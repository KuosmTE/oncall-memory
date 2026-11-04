#!/usr/bin/env python3
"""Measure the live radar: top-3 recall on 10 labelled pairs + false positives on 3 controls.

This is the number the Codegeist submission quotes ("X/10 top-3, Y/3 false positives").
It measures the DEPLOYED app, not the unit fixtures: it creates the query issues in Jira,
waits for the `avi:jira:created:issue` trigger to post the On-Call Memory comment (platform
lag up to 3 minutes), parses the issue keys out of that comment's ADF, and scores them
against hand-labelled ground truth in tools/eval-pairs.json.

Auth (same .env as the seeder):
    JIRA_BASE=https://one-atlas-boys.atlassian.net
    JIRA_EMAIL=teemu.kuosm@gmail.com
    JIRA_API_TOKEN=<a Jira-scoped token>

Usage:
    ./tools/eval-recall.py --help                    # works with no credentials on the box
    ./tools/eval-recall.py --dry-run                 # print the plan, create nothing
    ./tools/eval-recall.py --only redis-peak         # one pair (smoke test)
    ./tools/eval-recall.py                           # full run: 10 pairs + 3 controls

Writes eval-<YYYYMMDD>.json next to this script. Exit 0 only when recall >= 8/10 and no
control received a comment; exit 1 otherwise (a miss is data, a silent pass is not).
"""
import argparse
import base64
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEY_RE = re.compile(r"[A-Z][A-Z0-9_]*-[0-9]+")
RADAR_MARKER = "On-Call Memory \u2014 this looks like it has happened before"
PASS_RECALL = 8

# Mirror of app/src/engine.js — used ONLY to diagnose a miss offline
# ("token search missed it" vs "judge said different"). Never used for the score.
STOP = set(
    "the a an and or of for to in on with is was were be been it this that from at as by not no "
    "you your we our when then there here".split()
)


def tokens(text):
    return [
        t for t in re.split(r"[^a-z0-9._-]+", (text or "").lower())
        if len(t) > 2 and t not in STOP
    ]


def to_jql_text(text, limit=8):
    return " ".join(tokens(text)[:limit])


def jql_text_clause(words):
    return " OR ".join(f'text ~ "{w}"' for w in words.split(" ") if w)


def rank_candidates(query_words, candidates, limit=5):
    q = set(tokens(query_words))
    if not q:
        return []
    scored = []
    for c in candidates:
        t = set(tokens(" ".join(filter(None, [c["summary"], c["description"], c.get("lastFix")]))))
        matched = q & t
        if not matched:
            continue
        score = len(matched) / math.sqrt(len(q) * max(len(t), 1))
        scored.append({**c, "score": round(score, 3), "matched": sorted(matched)})
    scored.sort(key=lambda c: (-c["score"], c["key"]))
    return scored[:limit]


# --- Jira REST --------------------------------------------------------------------------

def load_env(path=HERE.parent / ".env"):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


class Jira:
    def __init__(self):
        self.base = os.environ.get("JIRA_BASE", "").rstrip("/")
        email = os.environ.get("JIRA_EMAIL", "")
        token = os.environ.get("JIRA_API_TOKEN", "")
        if not (self.base and email and token):
            sys.exit(
                "fatal: missing JIRA_BASE / JIRA_EMAIL / JIRA_API_TOKEN "
                "(set them in /opt/workspace/codegeist/.env — the eval cannot measure without them)"
            )
        self.auth = base64.b64encode(f"{email}:{token}".encode()).decode()

    def call(self, method, path, body=None):
        req = urllib.request.Request(
            self.base + path,
            method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={
                "Authorization": f"Basic {self.auth}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:400]
            raise RuntimeError(f"{method} {path} -> {e.code}: {detail}") from None

    def get(self, path):
        return self.call("GET", path)

    def search(self, jql, fields, max_results=50):
        path = (
            "/rest/api/3/search/jql?jql=" + urllib.parse.quote(jql)
            + f"&maxResults={max_results}&fields=" + urllib.parse.quote(fields)
        )
        return self.get(path).get("issues", [])


def adf(text):
    return {"type": "doc", "version": 1,
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}


def adf_text(node):
    """Flatten ADF to text; list items are joined with newlines so structure survives."""
    if not node:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return "\n".join(filter(None, (adf_text(n) for n in node)))
    parts = []
    if node.get("text"):
        parts.append(node["text"])
    for child in node.get("content") or []:
        parts.append(adf_text(child))
    return " ".join(p for p in parts if p)


def parse_radar_keys(comment_body):
    """Keys from the radar comment's bullet list, in display order (= ranking order).

    Returns (keys, people_text). Structural walk first; a regex over the whole body only
    as a fallback so an ADF shape change is visible rather than silently scored as 0 keys.
    """
    keys = []

    def walk(node):
        if isinstance(node, list):
            for n in node:
                walk(n)
            return
        if not isinstance(node, dict):
            return
        if node.get("type") == "bulletList":
            for item in node.get("content") or []:
                text = adf_text(item).strip()
                m = KEY_RE.match(text)
                if m:
                    keys.append(m.group(0))
            return
        for child in node.get("content") or []:
            walk(child)

    walk(comment_body.get("content") if isinstance(comment_body, dict) else None)
    body_text = adf_text(comment_body)
    people = ""
    for line in body_text.split("\n"):
        if line.strip().startswith("Ask:"):
            people = line.strip()
    return keys, people


def radar_comment(comments):
    """The app's comment (marker match), or None. Jira returns comments oldest-first."""
    for c in comments:
        if RADAR_MARKER in adf_text(c.get("body")):
            return c
    return None


# --- eval -----------------------------------------------------------------------------

def validate_expected(jira, project, pairs):
    """Ground truth must point at real, Done, oncall-seed issues in the same project."""
    keys = sorted({k for p in pairs for k in p["expected"]})
    bad = []
    for key in keys:
        try:
            issue = jira.get(f"/rest/api/3/issue/{urllib.parse.quote(key)}?fields=summary,status,labels,project")
        except RuntimeError as e:
            bad.append(f"{key}: unreadable ({e})")
            continue
        f = issue["fields"]
        cat = ((f.get("status") or {}).get("statusCategory") or {}).get("key")
        labels = set(f.get("labels") or [])
        if f.get("project", {}).get("key") != project:
            bad.append(f"{key}: in project {f.get('project', {}).get('key')}, expected {project}")
        if cat != "done":
            bad.append(f"{key}: status {f.get('status', {}).get('name')} is not Done")
        if "oncall-seed" not in labels:
            bad.append(f"{key}: missing oncall-seed label (labels={sorted(labels)})")
    if bad:
        sys.exit("fatal: eval-pairs.json points at issues that are not ground truth:\n  " + "\n  ".join(bad))


def assert_corpus_clean(jira, keys):
    """A fixture whose 'last fix' is our own radar comment carries other families' words.

    That contaminates retrieval, so the eval refuses to measure on a dirty corpus instead of
    publishing a number it cannot defend. The seeder sweeps these comments off.
    """
    dirty = []
    for key in keys:
        comments = jira.get(
            f"/rest/api/3/issue/{urllib.parse.quote(key)}/comment?maxResults=100"
        ).get("comments", [])
        if any(RADAR_MARKER in adf_text(c.get("body")) for c in comments):
            dirty.append(key)
    return dirty


def create_or_reuse(jira, project, queries, issue_type_id):
    """Create the query issues (labels oncall-eval). Reuses an existing one by summary."""
    existing = jira.search(
        f'project = "{project}" AND labels = oncall-eval ORDER BY created ASC',
        "summary,status", 200,
    )
    by_summary = {i["fields"]["summary"]: i["key"] for i in existing}
    out = {}
    for q in queries:
        key = by_summary.get(q["summary"])
        if key:
            print(f"  = {key} reused [{q['id']}] {q['summary']}")
            out[q["id"]] = key
            continue
        issue = jira.call("POST", "/rest/api/3/issue", {"fields": {
            "project": {"key": project},
            "issuetype": {"id": issue_type_id},
            "summary": q["summary"],
            "description": adf(q["description"]),
            "labels": ["oncall-eval"],
        }})
        out[q["id"]] = issue["key"]
        print(f"  + {issue['key']} created [{q['id']}] {q['summary']}")
    return out


def wait_for_comments(jira, keys, deadline_s, interval=20):
    """Poll every created issue until it has a radar comment (or the deadline passes)."""
    pending = dict(keys)
    got = {}
    started = time.time()
    while pending and time.time() - started < deadline_s:
        for qid, key in list(pending.items()):
            comments = jira.get(
                f"/rest/api/3/issue/{urllib.parse.quote(key)}/comment?maxResults=50"
            ).get("comments", [])
            c = radar_comment(comments)
            if c:
                got[qid] = c
                del pending[qid]
                print(f"  {key} [{qid}] radar comment after {int(time.time() - started)}s")
        if pending:
            print(f"  waiting on {len(pending)}/{len(keys)} "
                  f"({int(time.time() - started)}s elapsed, {int(deadline_s)}s budget)")
            time.sleep(interval)
    return got, pending


def diagnose(jira, project, query_text, query_key, expected, got_keys, comments_seen, manifest):
    """Explain a miss without touching the app: replay the token stage from Jira data."""
    words = to_jql_text(query_text)
    if not words:
        return {"stage": "token_search", "detail": "query tokenised to nothing"}
    jql = (f'project = "{project}" AND ({jql_text_clause(words)}) AND statusCategory = Done'
           f' AND key != "{query_key}" ORDER BY resolved DESC')
    issues = jira.search(jql, "summary,description,comment,resolution", 25)
    candidates = []
    for i in issues:
        f = i["fields"]
        last = None
        cs = ((f.get("comment") or {}).get("comments") or [])
        for c in reversed(cs):
            text = adf_text(c.get("body")).strip()
            if text:
                last = text[:240]
                break
        candidates.append({
            "key": i["key"],
            "summary": f.get("summary") or "",
            "description": adf_text(f.get("description")),
            "lastFix": last,
        })
    top5 = rank_candidates(words, candidates, 5)
    top5_keys = [c["key"] for c in top5]
    cand_keys = [c["key"] for c in candidates]
    hit_rank = None
    for k in expected:
        if k in top5_keys:
            hit_rank = k
            break
    if not comments_seen:
        if not candidates:
            stage, detail = "radar", "no Done issue matched the JQL token OR — nothing to judge, so no comment"
        else:
            stage, detail = "radar", f"radar never commented although {len(candidates)} candidates matched (trigger/judge failure — check `forge logs -f radar-fn`)"
    elif hit_rank:
        stage, detail = "judge", f"token rank had {hit_rank} in top-5 ({', '.join(top5_keys)}); the judge removed it"
    else:
        below = sorted(k for k in expected if k in cand_keys)
        if below:
            stage = "token_rank"
            detail = f"JQL found {', '.join(below)} but the token score put it outside top-5 ({', '.join(top5_keys)})"
        else:
            stage = "token_search"
            detail = f"JQL token OR returned {len(candidates)} issues, none of the expected keys ({', '.join(cand_keys[:8]) or 'none'})"
    return {"stage": stage, "detail": detail, "jql": jql,
            "token_top5": top5_keys, "comment_keys": got_keys}


def main():
    ap = argparse.ArgumentParser(
        description="Measure top-3 recall and control false positives on the LIVE radar.",
        epilog="Exit 0 only if recall >= %d/10 and no control got a comment." % PASS_RECALL,
    )
    ap.add_argument("--project", default="MOBL", help="Jira project key (default: MOBL)")
    ap.add_argument("--pairs", default=str(HERE / "eval-pairs.json"), help="ground-truth file")
    ap.add_argument("--only", action="append", default=[], metavar="ID",
                    help="run only these pair/control ids (repeatable; smoke test)")
    ap.add_argument("--poll-seconds", type=int, default=360,
                    help="how long to wait for radar comments (default 360; trigger lags up to 180)")
    ap.add_argument("--interval", type=int, default=20, help="poll interval seconds (default 20)")
    ap.add_argument("--out", default=None, help="output JSON (default eval-YYYYMMDD.json)")
    ap.add_argument("--dry-run", action="store_true", help="print the plan, create nothing")
    args = ap.parse_args()

    spec = json.loads(Path(args.pairs).read_text())
    pairs = spec["pairs"]
    controls = spec["controls"]
    if args.only:
        wanted = set(args.only)
        pairs = [p for p in pairs if p["id"] in wanted]
        controls = [c for c in controls if c["id"] in wanted]
        if not pairs and not controls:
            sys.exit(f"fatal: --only {sorted(wanted)} matched nothing in {args.pairs}")

    print(f"eval      radar top-3 recall + control false positives")
    print(f"project   {args.project}")
    print(f"pairs     {len(pairs)}   controls {len(controls)}")
    if args.dry_run:
        for p in pairs:
            print(f"  [pair] {p['id']:14} expected {','.join(p['expected']):28} {p['summary']}")
        for c in controls:
            print(f"  [ctrl] {c['id']:14} expected (none)                   {c['summary']}")
        print("\ndry run — nothing created")
        return 0

    load_env()
    jira = Jira()
    project = jira.get(f"/rest/api/3/project/{urllib.parse.quote(args.project)}")
    types = [t for t in project["issueTypes"] if not t.get("subtask")]
    type_id = next((t["id"] for t in types if t["name"] == "Bug"),
                   next(t["id"] for t in types))
    print(f"site      {jira.base}  project {project['key']} ({project['name']})")

    validate_expected(jira, args.project, pairs)

    manifest_path = HERE / spec.get("corpus_manifest", "seed-manifest.json")
    manifest = json.loads(manifest_path.read_text())["corpus"] if manifest_path.exists() else {}
    near_miss = {v["key"] for v in manifest.values() if v["kind"] == "near-miss"}

    dirty = assert_corpus_clean(jira, [v["key"] for v in manifest.values()])
    if dirty:
        sys.exit(
            "fatal: corpus issues carry radar comments: " + ", ".join(dirty)
            + "\n       A fixture whose 'last fix' quotes the radar is contaminated (other"
              " families' summaries leak in). Run tools/seed-incidents.py to sweep them."
        )

    print(f"\ncreating {len(pairs) + len(controls)} query issues (label oncall-eval)")
    queries = [{**p, "kind": "pair"} for p in pairs] + [{**c, "kind": "control"} for c in controls]
    key_by_id = create_or_reuse(jira, args.project, queries, type_id)

    print(f"\nwaiting for radar comments (budget {args.poll_seconds}s)")
    comments, pending = wait_for_comments(jira, key_by_id, args.poll_seconds, args.interval)

    results, control_results = [], []
    for p in pairs:
        key = key_by_id[p["id"]]
        c = comments.get(p["id"])
        keys = parse_radar_keys(c["body"])[0] if c else []
        got = keys[:3]
        hit = any(k in got for k in p["expected"])
        row = {
            "id": p["id"], "family": p.get("family"), "query_issue": key,
            "query": p["summary"], "expected": p["expected"], "got_top3": got,
            "hit": hit, "comment": bool(c),
            "near_miss_in_top3": sorted(set(got) & near_miss),
            "extra": [k for k in got if k not in p["expected"]],
        }
        if c and not keys:
            row["unparsable"] = True
        if not hit:
            row["diagnosis"] = diagnose(
                jira, args.project, f"{p['summary']} {p['description']}",
                key, p["expected"], got, bool(c), manifest,
            )
        results.append(row)

    for ctl in controls:
        key = key_by_id[ctl["id"]]
        c = comments.get(ctl["id"])
        keys = parse_radar_keys(c["body"])[0] if c else []
        row = {"id": ctl["id"], "query_issue": key, "query": ctl["summary"],
               "comment": bool(c), "got_top3": keys[:3], "false_positive": bool(c)}
        if c:
            row["diagnosis"] = diagnose(
                jira, args.project, f"{ctl['summary']} {ctl['description']}",
                key, [], keys[:3], True, manifest,
            )
        control_results.append(row)

    # --- report -------------------------------------------------------------------------
    hits = sum(1 for r in results if r["hit"])
    fps = sum(1 for r in control_results if r["false_positive"])
    unparsable = [r["id"] for r in results + control_results if r.get("unparsable")]

    print("\nper-pair (expected -> got, top-3)")
    print(f"{'query':14} {'expected':26} {'got top-3':26} result")
    print("-" * 92)
    for r in results:
        print(f"{r['id']:14} {','.join(r['expected']):26} {','.join(r['got_top3']) or '—':26} "
              f"{'HIT' if r['hit'] else 'MISS'}")
    print("\ncontrols (must stay silent)")
    print(f"{'query':14} {'comment':10} {'got top-3':26} result")
    print("-" * 92)
    for r in control_results:
        print(f"{r['id']:14} {str(r['comment']):10} {','.join(r['got_top3']) or '—':26} "
              f"{'FALSE POSITIVE' if r['false_positive'] else 'ok (silent)'}")

    if unparsable:
        print(f"\nUNPARSABLE comments: {', '.join(unparsable)} — ADF shape changed, keys not found")
    pending_pairs = [q for q in pending if q in {p["id"] for p in pairs}]
    pending_controls = [q for q in pending if q in {c["id"] for c in controls}]
    if pending_pairs:
        print(f"\npairs with NO radar comment within {args.poll_seconds}s: "
              f"{', '.join(pending_pairs)} (keys: {', '.join(key_by_id[q] for q in pending_pairs)})")
    if pending_controls:
        print(f"controls correctly silent: {', '.join(pending_controls)}")
    misses = [r for r in results if not r["hit"]]
    if misses:
        print("\nwhy the misses happened")
        for r in misses:
            d = r.get("diagnosis") or {}
            print(f"  {r['id']:14} [{d.get('stage', '?')}] {d.get('detail', 'no comment, no diagnosis')}")

    subset = len(results) < len(spec["pairs"])
    if subset:
        passed = fps == 0 and not unparsable
        verdict = (f"SUBSET ({len(results)} of {len(spec['pairs'])} pairs) — 8/10 threshold not applied"
                   if passed else "FAIL")
    else:
        passed = hits >= PASS_RECALL and fps == 0 and not unparsable
        verdict = f"{'PASS' if passed else 'FAIL'} (threshold {PASS_RECALL}/{len(results)}, 0 controls)"
    print(f"\nRESULT {hits}/{len(results)} top-3 · {fps}/{len(control_results)} control false positives"
          f" · {verdict}")

    out_path = Path(args.out) if args.out else HERE / f"eval-{datetime.now().strftime('%Y%m%d')}.json"
    payload = {
        "eval": "oncall-memory live radar — top-3 recall + control false positives",
        "run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "site": jira.base,
        "project": args.project,
        "pairs_file": str(Path(args.pairs).name),
        "query_issues": key_by_id,
        "pairs": results,
        "controls": control_results,
        "summary": {
            "recall": f"{hits}/{len(results)}",
            "hits": hits,
            "total_pairs": len(results),
            "control_false_positives": fps,
            "controls_total": len(control_results),
            "unparsable": unparsable,
            "pairs_no_comment": sorted(pending_pairs),
            "controls_silent": sorted(pending_controls),
            "subset": subset,
            "threshold": f"{PASS_RECALL}/{len(spec['pairs'])}" if not subset else "n/a (subset run)",
            "passed": passed,
        },
    }
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {out_path}")

    if not passed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
