# HANDOFF — On-Call Memory (Codegeist 2026)

Read this first in a fresh session. Then `SPEC.md` (product) and `DEMO.md` (filming).

## Where things are

| Thing | Value |
|---|---|
| Repo (local) | `/opt/workspace/codegeist` |
| App dir | `/opt/workspace/codegeist/app` |
| App id | `ari:cloud:ecosystem::app/d0c1b623-3512-4219-8760-0b15e2bd80b2` |
| Developer Space | Minttu Labs (account: teemu.kuosm@gmail.com) |
| Live site | `https://one-atlas-boys.atlassian.net` (Forge demo site, ~90 days) |
| Deployed | `development`, version **2.1.0**, **installed in Jira** on the demo site |
| Credentials | `/opt/workspace/codegeist/.env` (`FORGE_EMAIL`, `FORGE_API_TOKEN`, chmod 600) |
| Deadline | **2026-12-22 22:00 EET** (Devpost submission) |

## Commands (the only ones that matter)

```bash
cd /opt/workspace/codegeist && set -a && . ./.env && set +a   # auth, no keychain, no forge login
cd app
npm test                      # 7/7 engine tests, no network
./validate-manifest.py        # manifest ↔ handlers ↔ actions consistency
npm run build:panel           # esbuild the Custom UI bundle → src/frontend/panel/app.js
npx forge lint                # must say "No issues found"
npx forge deploy -e development --non-interactive
npx forge install --demo-site --product Jira -e development --non-interactive --confirm-scopes --upgrade
```

## Architecture

```
app/manifest.yml                  panel + 4 functions + 2 actions + rovo:mcp + trigger + scopes
app/src/engine.js                 PURE ranking (rankCandidates, rankPeople) — all logic lives here
app/src/handlers.js               Jira I/O: search, issue context, comment (the only write)
app/src/resolvers.js              panel resolver → plain props
app/src/frontend/panel/           Custom UI: index.html + src/main.js → app.js (esbuild IIFE)
app/test/engine.test.mjs          node:test, no deps
app/validate-manifest.py          pre-deploy checker (handlers resolve under src/)
```

## Decisions taken (do not silently reverse)

1. **Custom UI, not UI Kit.** UI Kit needs a React build toolchain and `index.html` anyway; plain DOM + esbuild is smaller and fully ours. React deps were removed.
2. **The only write is one comment** on a newly created issue (the radar). `write:jira-work` is declared for it. Everything else is read-only.
3. **`read:graph:jira` is NOT declared yet.** TWG scopes force an **org-admin install** for judges; the scope goes in at P4 together with the query, behind the Jira-native fallback in SPEC §7.
4. **One app, one engine, two front doors** (panel + trigger). "Safe Hands" bulk ops stay out — see SPEC §12 for why.
5. **No LLM yet.** Matching is token-overlap. The Forge LLM judge is a P4 upgrade and has **no free tier** (billed to the app developer).

## Gotchas that cost real time

- Handler paths resolve **under `src/`**: `handlers.whoKnows`, never `src/handlers.whoKnows`. The lint error claims the file is missing when it is not.
- First-run analytics prompt kills every non-TTY command: `forge settings set usage-analytics false`.
- `forge register --personal` fails once a Developer Space exists.
- `forge install` needs the full flag set: `--demo-site --product Jira -e development`.
- `forge site provision` times out in the CLI but keeps provisioning server-side.

## Next up

**P3 — make the panel mean something**
- Seed 5 resolved incident tickets on the demo site, same failure, different years, so the panel has history (use JQL via the site UI or a one-off `curl` script with an API token — Forge token cannot call Jira REST).
- Acceptance: open a 6th similar issue → panel shows ≥2 "happened before" and ≥1 person with receipts.
- Record `raw-P3-panel.mp4` (see DEMO.md).

**P4 — Teamwork Graph + LLM judge** (then re-decide the org-admin trade-off)
**P5 — `rovo:skill` + `rovo:agent`** (manifest-only, but only after there is data worth citing)
**P6 — video, listing decision, Devpost form**

## Open questions for Teemu

- Should the demo project be seeded with a fictional team + tickets he is happy to show judges?
- Marketplace listing: chase it (needs partner agreement + review) or skip and enter only the main + agent/MCP/TWG tracks?
