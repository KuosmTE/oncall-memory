#!/usr/bin/env python3
"""Seed a Jira project with resolved incidents so the On-Call Memory panel has history.

The panel is only interesting when past work exists. This creates a corpus of resolved
incidents across four failure families — redis/connection-pool, bad-deploy/rollback,
disk-full, auth-token-expiry — plus one near-miss per family and unrelated controls.

De-gripped on purpose: each family has 2 same-vocabulary issues and 3 paraphrases, so a
retrieval number measured on it can disappoint us. Nothing here is written to match the
ranker; the wording is what a reporter would actually type.

Auth (add to /opt/workspace/codegeist/.env):
    JIRA_BASE=https://one-atlas-boys.atlassian.net
    JIRA_EMAIL=teemu.kuosm@gmail.com
    JIRA_API_TOKEN=<a Jira-scoped token — the Forge token cannot call Jira REST>

Usage:
    ./tools/seed-incidents.py --project MOBL --dry-run
    ./tools/seed-incidents.py --project MOBL

Idempotent: an issue whose summary already exists with label `oncall-seed` is reused,
never duplicated. Writes tools/seed-manifest.json (slot -> real key) for the eval harness.

Exit: 0 ok · 1 problem (prints what failed and which issues already exist)
"""
import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# slot, family, kind, summary, description
# kind: similar (same vocabulary) · paraphrase · near-miss · control
CORPUS = [
    # --- redis / connection-pool -------------------------------------------------
    ("redis-same-1", "redis-pool", "similar",
     "Checkout latency spike after deploy",
     "p99 goes to 8s. Redis pool exhausted, connections queueing."),
    ("redis-same-2", "redis-pool", "similar",
     "Checkout timeouts during evening peak",
     "Same redis connection pool exhaustion as the spring incident."),
    ("redis-para-1", "redis-pool", "paraphrase",
     "Orders hang at rush hour, cart requests queue up",
     "Requests wait in line behind a saturated backend; cart screen spins."),
    ("redis-para-2", "redis-pool", "paraphrase",
     "Web tier saturating on database connections during sales",
     "Connection ceiling reached under load, requests queue and time out."),
    ("redis-para-3", "redis-pool", "paraphrase",
     "Intermittent 504s on the payment step under load",
     "Gateway returns 504 for a slice of payment calls when traffic peaks."),
    ("redis-near", "redis-pool", "near-miss",
     "Redis cache evictions after memory bump",
     "Eviction rate up after the instance resize; values vanish early."),

    # --- bad deploy / rollback ---------------------------------------------------
    ("deploy-same-1", "bad-deploy", "similar",
     "Payment 5xx rate spikes right after release 4.18.0",
     "Error rate jumps from 0.2% to 9% within five minutes of the roll-out; charges fail."),
    ("deploy-same-2", "bad-deploy", "similar",
     "Elevated payment errors after the 4.18.0 deploy",
     "Same regression as the release that went out at 14:10; 5xx on the charge endpoint."),
    ("deploy-para-1", "bad-deploy", "paraphrase",
     "Order confirmations stopped arriving after last night's rollout",
     "Nothing in the confirmation queue since midnight, which is when the new build went live."),
    ("deploy-para-2", "bad-deploy", "paraphrase",
     "Customers charged twice after the Thursday release",
     "Duplicate charges reported since the new version shipped; support queue filling up."),
    ("deploy-para-3", "bad-deploy", "paraphrase",
     "Had to roll back this morning's build, checkout was broken",
     "The build broke the checkout submit path; rollback restored it within ten minutes."),
    ("deploy-near", "bad-deploy", "near-miss",
     "Release pipeline waiting on manual approval for hours",
     "Deployment gate stuck in the queue, nothing reached production; no customer impact."),

    # --- disk full ---------------------------------------------------------------
    ("disk-same-1", "disk-full", "similar",
     "Disk full on prod-db-2",
     "Root partition at 100%, Postgres cannot write; writes failing."),
    ("disk-same-2", "disk-full", "similar",
     "No space left on device on the primary database host",
     "Disk usage hit 100% overnight; WAL writes rejected."),
    ("disk-para-1", "disk-full", "paraphrase",
     "Postgres refusing writes because the volume ran out of room",
     "Database logs show no space remaining on /var/lib/postgresql."),
    ("disk-para-2", "disk-full", "paraphrase",
     "Log rotation filled the server disk overnight",
     "A runaway debug log ate 90 GB; the node is out of space and services are degraded."),
    ("disk-para-3", "disk-full", "paraphrase",
     "Database host unresponsive, df shows 100% on the data partition",
     "Writes time out and the data volume reports zero bytes free."),
    ("disk-near", "disk-full", "near-miss",
     "High disk latency on the SSD data volume",
     "io wait up, but plenty of free space; suspected noisy neighbour."),

    # --- auth token expiry -------------------------------------------------------
    ("auth-same-1", "auth-token", "similar",
     "API calls failing with 401 after the access token expired",
     "Integration jobs get 401 Unauthorized; the token was past its expiry."),
    ("auth-same-2", "auth-token", "similar",
     "Expired OAuth token causes 401s on the sync jobs",
     "Refresh stopped working, tokens are stale, every request rejected with 401."),
    ("auth-para-1", "auth-token", "paraphrase",
     "Nightly export dies because the credentials are past their expiry",
     "Job aborts at the first call; the stored credential expired weeks ago."),
    ("auth-para-2", "auth-token", "paraphrase",
     "Partner integration rejects our requests, says the token is no longer valid",
     "Their API returns invalid_token; our credential lapsed and nobody rotated it."),
    ("auth-para-3", "auth-token", "paraphrase",
     "Scheduled sync stopped ever since the refresh token lapsed",
     "No data since the 3rd; the refresh token expired and the job never recovered."),
    ("auth-near", "auth-token", "near-miss",
     "Users locked out after too many MFA attempts",
     "Account lockouts from repeated one-time-code failures; the credential itself is fine."),

    # --- unrelated controls (must never look like an incident family) ------------
    ("control-printer", "unrelated", "control",
     "Printer on 3rd floor offline",
     "Toner replaced, still no network. Unrelated to checkout."),
    ("control-display", "unrelated", "control",
     "Conference room display flickers during video calls",
     "The 4K panel drops signal every few minutes in room Aurora."),
    ("control-laptop", "unrelated", "control",
     "New starter laptop not enrolled in MDM",
     "Device shows up as unmanaged, profile install fails."),
]
WORKFLOW_LABELS = ("oncall-seed",)


def load_env(path=Path(__file__).resolve().parent.parent / ".env"):
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
            sys.exit("Missing JIRA_BASE / JIRA_EMAIL / JIRA_API_TOKEN in .env")
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
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:400]
            raise RuntimeError(f"{method} {path} → {e.code}: {detail}") from None

    def get(self, path):
        return self.call("GET", path)


def adf(text):
    return {
        "type": "doc",
        "version": 1,
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


def pick_issue_type(project):
    types = [t for t in project["issueTypes"] if not t.get("subtask")]
    for want in ("Bug", "Task", "Story"):
        for t in types:
            if t["name"] == want:
                return t["id"], t["name"]
    return types[0]["id"], types[0]["name"]


def done_transition(jira, key):
    for t in jira.get(f"/rest/api/3/issue/{urllib.parse.quote(key)}/transitions").get("transitions", []):
        if (t.get("to") or {}).get("statusCategory", {}).get("key") == "done":
            return t["id"]
    return None


def mark_done(jira, key):
    tid = done_transition(jira, key)
    if not tid:
        print(f"    ! no Done transition available for {key}")
        return False
    try:
        # Workflow screens differ per project: MOBL rejects `resolution`, others require it.
        jira.call("POST", f"/rest/api/3/issue/{key}/transitions",
                  {"transition": {"id": tid}, "fields": {"resolution": {"name": "Done"}}})
    except RuntimeError:
        jira.call("POST", f"/rest/api/3/issue/{key}/transitions", {"transition": {"id": tid}})
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--project", required=True, help="Jira project key, e.g. MOBL")
    ap.add_argument("--dry-run", action="store_true", help="print the plan, create nothing")
    args = ap.parse_args()

    load_env()
    print(f"corpus: {len(CORPUS)} issues, "
          f"{len({c[1] for c in CORPUS})} families")
    if args.dry_run:
        for slot, family, kind, summary, _ in CORPUS:
            print(f"  [{family:11}] {kind:10} {slot:15} {summary}")
        print("\ndry run — nothing created")
        return 0

    jira = Jira()
    me = jira.get("/rest/api/3/myself")
    project = jira.get(f"/rest/api/3/project/{urllib.parse.quote(args.project)}")
    type_id, type_name = pick_issue_type(project)
    users = jira.get(
        f"/rest/api/3/user/assignable/search?project={urllib.parse.quote(args.project)}&maxResults=50"
    )
    # Demo sites are full of service accounts (config-fy26-bot, OneAtlassian Bitbucket, …).
    # They are accountType=atlassian, so type filtering does not help — names do.
    # "Who knows" must rank people; a bot with a receipt is a lie with a citation.
    BOT = re.compile(r"bot|agent|bitbucket|provision|guardrail|config-|automation", re.I)
    accounts = [u["accountId"] for u in users if not BOT.search(u.get("displayName", ""))][:6] or [None]

    print(f"site      {jira.base}")
    print(f"as        {me.get('displayName')} <{me.get('emailAddress')}>")
    print(f"project   {project['key']} ({project['name']})  type={type_name}  assignees={len(accounts)}")

    seed_jql = "project={} AND labels=oncall-seed".format(project["key"])
    found = jira.get(
        "/rest/api/3/search/jql?jql=" + urllib.parse.quote(seed_jql)
        + "&maxResults=200&fields=summary,status,labels"
    ).get("issues", [])
    by_summary = {i["fields"]["summary"]: i for i in found}
    print(f"existing  {len(found)} issues labelled oncall-seed")

    manifest = {}
    created = skipped = 0
    for i, (slot, family, kind, summary, desc) in enumerate(CORPUS):
        prior = by_summary.get(summary)
        if prior:
            key = prior["key"]
            skipped += 1
            print(f"  = {key} exists [{family}/{kind}] {summary}")
            if prior["fields"].get("status", {}).get("statusCategory", {}).get("key") != "done":
                if mark_done(jira, key):
                    print(f"    → transitioned {key} to Done")
        else:
            issue = jira.call(
                "POST",
                "/rest/api/3/issue",
                {
                    "fields": {
                        "project": {"key": project["key"]},
                        "issuetype": {"id": type_id},
                        "summary": summary,
                        "description": adf(desc),
                        "labels": ["oncall-seed", kind, slot],
                    }
                },
            )
            key = issue["key"]
            created += 1
            acct = accounts[i % len(accounts)]
            if acct:
                jira.call("PUT", f"/rest/api/3/issue/{key}/assignee", {"accountId": acct})
            mark_done(jira, key)
            print(f"  ✓ {key} [{family}/{kind}] {summary}")
            by_summary[summary] = {"key": key, "fields": {"summary": summary, "labels": ["oncall-seed", kind, slot]}}
        manifest[slot] = {"key": key, "family": family, "kind": kind, "summary": summary}

    out = Path(__file__).resolve().parent / "seed-manifest.json"
    out.write_text(json.dumps(
        {"project": project["key"], "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
         "corpus": manifest},
        indent=2,
    ) + "\n")

    print(f"\n{created} created · {skipped} already existed · manifest → {out.relative_to(Path.cwd()) if out.is_relative_to(Path.cwd()) else out}")
    print("Every issue is Done, labelled oncall-seed + kind + slot, assigned to a human.")
    print("The panel should list the same-family issues as 'happened before' and ignore the controls.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
