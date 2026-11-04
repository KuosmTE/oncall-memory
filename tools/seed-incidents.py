#!/usr/bin/env python3
"""Seed a Jira project with resolved incidents so the On-Call Memory panel has history.

The panel is only interesting when past work exists. This creates a handful of
resolved issues that all describe the same failure in different words, plus an
unrelated control issue, and distributes them across assignable users so the
"who knows" ranking has something real to rank.

Auth (add to /opt/workspace/codegeist/.env):
    JIRA_BASE=https://one-atlas-boys.atlassian.net
    JIRA_EMAIL=teemu.kuosm@gmail.com
    JIRA_API_TOKEN=<a Jira-scoped token — the Forge token cannot call Jira REST>

Usage:
    ./tools/seed-incidents.py --project DEV --dry-run
    ./tools/seed-incidents.py --project DEV

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
from pathlib import Path

# Deliberately NOT all in the same vocabulary: the recall number is only useful if it can
# disappoint us. Labels are written onto the issues so the demo and the eyeball test agree.
INCIDENTS = [
    ("Checkout latency spike after deploy", "p99 goes to 8s. Redis pool exhausted, connections queueing.", "similar"),
    ("Checkout timeouts during evening peak", "Same redis connection pool exhaustion as the spring incident.", "similar"),
    ("Orders hang at rush hour, cart requests queue up", "Requests wait in line behind a saturated backend; cart screen spins.", "paraphrase"),
    ("Web tier saturating on database connections during sales", "Connection ceiling reached under load, requests queue and time out.", "paraphrase"),
    ("Intermittent 504s on the payment step under load", "Gateway returns 504 for a slice of payment calls when traffic peaks.", "paraphrase"),
]
NEAR_MISS = ("Redis cache evictions after memory bump", "Eviction rate up after the instance resize; values vanish early.", "near-miss")
CONTROL = ("Printer on 3rd floor offline", "Toner replaced, still no network. Unrelated to checkout.", "control")


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True, help="Jira project key, e.g. DEV")
    ap.add_argument("--dry-run", action="store_true", help="print the plan, create nothing")
    args = ap.parse_args()

    load_env()
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

    plan = list(INCIDENTS) + [NEAR_MISS, CONTROL]
    if args.dry_run:
        for summary, desc, kind in plan:
            print(f"  would create [{kind}] {summary}")
        print("\ndry run — nothing created")
        return 0

    created = []
    found = jira.get(
        f"/rest/api/3/search/jql?jql={urllib.parse.quote(f'project={project['key']} AND labels=oncall-seed')}&maxResults=100&fields=summary,status"
    ).get("issues", [])
    existing = {i["fields"]["summary"]: i for i in found}
    for i, (summary, desc, kind) in enumerate(plan):
        prior = existing.get(summary)
        if prior:
            # A previous run may have died between create and transition — finish it, do not duplicate.
            if prior["fields"]["status"]["statusCategory"]["key"] != "done":
                tid = done_transition(jira, prior["key"])
                if tid:
                    jira.call("POST", f"/rest/api/3/issue/{prior['key']}/transitions", {"transition": {"id": tid}})
            print(f"  = skip (exists) [{kind}] {summary}")
            continue
        issue = jira.call(
            "POST",
            "/rest/api/3/issue",
            {
                "fields": {
                    "project": {"key": project["key"]},
                    "issuetype": {"id": type_id},
                    "summary": summary,
                    "description": adf(desc),
                    "labels": ["oncall-seed", kind],
                }
            },
        )
        key = issue["key"]
        acct = accounts[i % len(accounts)]
        if acct:
            jira.call("PUT", f"/rest/api/3/issue/{key}/assignee", {"accountId": acct})
        tid = done_transition(jira, key)
        if tid:
            # Workflow screens differ per project: MOBL rejects `resolution`, others require it.
            try:
                jira.call("POST", f"/rest/api/3/issue/{key}/transitions",
                          {"transition": {"id": tid}, "fields": {"resolution": {"name": "Done"}}})
            except RuntimeError:
                jira.call("POST", f"/rest/api/3/issue/{key}/transitions", {"transition": {"id": tid}})
        created.append((key, kind, summary))
        print(f"  ✓ {key} [{kind}] {summary}")

    print(f"\n{len(created)} issues created in {project['key']}")
    print("Open one of them in Jira — the panel should list the other incidents as 'happened before'")
    print("and should NOT match the control (`{}`).".format(CONTROL[0]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
