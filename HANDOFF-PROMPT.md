# Handoff prompt — paste this into a fresh session

---

You are picking up **On-Call Memory**, a Codegeist 2026 hackathon entry (Atlassian Forge app). Read `/opt/workspace/codegeist/HANDOFF.md` first, then `SPEC.md` §7 and `DEMO.md`. Do not re-plan what is already built.

**State at handoff (verify, don't assume):**
- Repo `/opt/workspace/codegeist`, HEAD `8c48c39`, clean, pushed to `KuosmTE/oncall-memory` (private).
- App id `ari:cloud:ecosystem::app/d0c1b623-3512-4219-8760-0b15e2bd80b2`, deployed **v4.3.0** to `development`, installed in Jira on `one-atlas-boys.atlassian.net`, project **MOBL**.
- 24 unit tests green. Live-recall eval: **10/10 top-3, 0/3 control false positives** (`tools/eval-20261104-v42.json`).
- Shipped: issue panel (Custom UI), radar trigger (asApp), Forge LLM judge on top-5 with token fallback, three labelled evidence kinds (resolved / diagnosed / wrote-up), two actions exposed over `rovo:mcp`.

**Commands (credentials live in `.env`, never print them):**
```bash
cd /opt/workspace/codegeist && set -a && . ./.env && set +a
cd app
npm test                       # must be 24+ green
npm run check                  # test + forge lint
npm run forge:deploy           # builds panel bundle — never call forge deploy bare
npx forge install --demo-site --product Jira -e development --non-interactive --confirm-scopes --upgrade
node ../tools/panel-probe.mjs MOBL-122      # real panel output (token fallback outside Forge)
python3 ../tools/eval-recall.py --project MOBL   # recall harness, must stay >= 8/10, 0 controls
```

**Next task — the only remaining checkup improvement:**
Add `rovo:agent` + `rovo:skill` (a `SKILL.md` in `src/skills/<name>/`) wired to the two existing actions `who-knows` and `has-happened-before`, so a Rovo agent answers "who should I ask about MOBL-xxx" and cites issue keys. No new OAuth scopes. **Hard gate: if the agent is not filmed working by 2026-12-08, delete the modules and ship without them.**

Acceptance: manifest lints; `forge deploy` + upgrade install succeed; one screenshot/terminal capture of the agent citing a real MOBL key; `npm test` green; commit + push; update `HANDOFF.md` in the same commit.

**Hard rules:**
- Never add `read:graph:*` or a Teamwork Graph dependency — TWG is EAP + Atlassian support allowlist, cut from the critical path.
- No new OAuth scopes without asking Teemu first. No production deploy. No Marketplace listing.
- Every claim on screen must survive inspection: "read-only except one comment", never "zero config" (external MCP needs a per-app admin toggle).
- Commit and push after each meaningful change; docs move in the same commit as the code.
- Deadlines: P4 done **Nov 28** · agent filmed **Dec 8 (gate)** · video cut **Dec 15** · Devpost submit **Dec 20, 22:00 EET**.

**Keys that exist right now** (the `MOBL-10x` series from earlier is deleted — do not reuse old links): `MOBL-122` real match, `MOBL-127` honest-empty control, `MOBL-74` stable seeded incident.

Start by running `npm test` and `node ../tools/panel-probe.mjs MOBL-122` to confirm the state above, then report one line before touching the manifest.
