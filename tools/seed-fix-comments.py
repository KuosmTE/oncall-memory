#!/usr/bin/env python3
"""Give a few corpus issues a real fix comment, so "diagnosed it" has evidence to cite.

The panel's second evidence kind is *the author of the fix comment on a matched issue*. The
seeded corpus (tools/seed-incidents.py) has no comments, so without this step the honoured rule
"if a kind is missing for a person, do not print it" would hide the kind on every real run.

These are plain Jira comments written through the REST API, so they are authored by the token
owner (the only identity we hold credentials for). They are deliberately in-family: a comment on
a redis incident must not introduce bad-deploy or disk vocabulary, or it becomes retrieval noise
the eval will punish.

Auth (same .env as the seeder — the Forge token cannot call Jira REST):
    JIRA_BASE / JIRA_EMAIL / JIRA_API_TOKEN

Usage:
    ./tools/seed-fix-comments.py --dry-run
    ./tools/seed-fix-comments.py

Idempotent: an issue that already carries the comment (matched on its first 40 characters) is
skipped, so running twice is a no-op. Keys come from tools/seed-manifest.json.
"""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent

# slot (tools/seed-manifest.json) -> comment text. First 40 chars are the idempotency marker.
FIX_COMMENTS = {
    "redis-same-1": "Raised the Redis connection pool to 200 and put a p99 alert at one second. Queueing stopped within minutes.",
    "redis-para-1": "Pool exhaustion again: bumped maxTotal to 250 and gave the cache its own instance, so cart requests stop queueing behind checkout.",
    "redis-para-2": "The connection ceiling was the pool size. Raised it and added a saturation dashboard, so the web tier shows the queue before it times out.",
    "deploy-same-1": "Reverted 4.18.0 to 4.17.2. The payment service config was missing the retry budget; redeployed at 15:05 and the 5xx rate fell back to 0.2%.",
    "disk-same-1": "Cleared the archived WAL segments and cut log rotation to 7 days. Added a 90% disk alert on prod-db-2 so the root partition never fills again.",
    "auth-same-1": "Rotated the API token, moved expiry to 90 days, and added a warning job 7 days before expiry so the integration jobs stop getting 401s.",
}


def load_env(path=HERE.parent / ".env"):
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


class Jira:
    def __init__(self, env):
        self.base = env["JIRA_BASE"].rstrip("/")
        self.auth = base64.b64encode(f"{env['JIRA_EMAIL']}:{env['JIRA_API_TOKEN']}".encode()).decode()

    def call(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={
                "Authorization": "Basic " + self.auth,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            print(f"  ! {method} {path} -> {e.code} {e.read()[:300]!r}")
            raise

    def comments(self, key):
        return self.call("GET", f"/rest/api/3/issue/{urllib.parse.quote(key)}/comment?maxResults=100").get("comments", [])


def adf_to_text(node):
    if not node:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, list):
        return " ".join(adf_to_text(n) for n in node)
    return " ".join(filter(None, [node.get("text")] + [adf_to_text(c) for c in node.get("content", [])]))


def adf(text):
    return {
        "type": "doc",
        "version": 1,
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}],
    }


def main():
    parser = argparse.ArgumentParser(description="Add in-family fix comments to seeded corpus issues.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    manifest = json.loads((HERE / "seed-manifest.json").read_text())["corpus"]
    env = load_env()
    jira = Jira(env)

    added = skipped = 0
    for slot, text in FIX_COMMENTS.items():
        entry = manifest.get(slot)
        if not entry:
            print(f"  ! slot {slot} is not in seed-manifest.json — run seed-incidents.py first")
            return 1
        key = entry["key"]
        marker = text[:40]
        existing = [adf_to_text(c.get("body")).replace("\n", " ") for c in jira.comments(key)]
        if any(marker in body for body in existing):
            print(f"  = {key} already carries the fix comment")
            skipped += 1
            continue
        if args.dry_run:
            print(f"  + would comment on {key}: {text[:60]}…")
            added += 1
            continue
        jira.call("POST", f"/rest/api/3/issue/{urllib.parse.quote(key)}/comment", {"body": adf(text)})
        print(f"  + {key} commented")
        added += 1

    print(f"done: {added} added, {skipped} already present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
