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
| Deployed | `development`, version **4.4.0**, **installed in Jira** on the demo site |
| Credentials | `/opt/workspace/codegeist/.env` (`FORGE_EMAIL`, `FORGE_API_TOKEN`, chmod 600) |
| Deadline | **2026-12-22 22:00 EET** (Devpost submission) |
| Milestones | P3 data+eval **Nov 14** · P4 LLM judge+evidence **Nov 28** · P5 agent filmed **Dec 8 (hard gate)** · video cut **Dec 15** · submit **Dec 20** |
| Next action | **P6a: single-owner badge (C) + draft-the-ask button (D)** — spec in `SPEC.md` §13. Build, test, deploy, film. |

## Commands (the only ones that matter)

```bash
cd /opt/workspace/codegeist && set -a && . ./.env && set +a   # auth, no keychain, no forge login
cd app
npm test                      # 26 tests, no network (24 engine + 2 card-path)
npm run check                 # test + forge lint (the validator script was deleted: no PyYAML on this box)
npm run build:panel           # esbuild the Custom UI bundle → src/frontend/panel/app.js
npx forge lint                # must say "No issues found"
npm run forge:deploy          # builds the panel bundle first — never call forge deploy bare
npx forge install --demo-site --product Jira -e development --non-interactive --confirm-scopes --upgrade
cd .. && node tools/panel-probe.mjs MOBL-69   # the panel's resolver JSON, without a browser
```

## Architecture

```
app/manifest.yml                  panel + 4 functions + 2 actions + 2 MCP tools + trigger + scopes
                                  + rovo:agent `oncall-memory-agent` + rovo:skill `oncall-memory`
app/src/skills/oncall-memory/      SKILL.md — when to call which action, how to read receipts
app/src/engine.js                 PURE ranking (rankCandidates, rankPeople) — all logic lives here
app/src/handlers.js               Jira I/O: search, issue context, comment (the only write)
app/src/resolvers.js              panel resolver → plain props
app/src/frontend/panel/           Custom UI: index.html + src/main.js → app.js (esbuild IIFE)
app/test/engine.test.mjs          node:test, no deps — pure ranking
app/test/handlers.test.mjs        node:test + test/fixtures/ — buildCard against canned Jira JSON
(no separate manifest validator — `npm run check` covers it; forge lint checks handlers)
```

## Review round 1 (architect, t_6db62490) — fixed in v3.0.0

- Radar identity: every read now takes a mode; the trigger uses `api.asApp()` because
  `asUser()` is unavailable in product-event context. Errors are logged, not swallowed.
- Person receipts are links (`/browse/<key>`) — the demo beat is filmable now.
- The fix comment is fetched (`fields=comment`) and rendered in the panel and the radar
  comment, so "how it was fixed" exists for the first time.
- One engine call (`buildCard`) serves panel, actions and trigger — they cannot disagree.
- `"unassigned"` is no longer a person; issue keys are validated before reaching JQL;
  confidence is derived from result shape, not a 0.35 threshold that was unreachable.
- Removed unused `read:jira-user`; deleted `validate-manifest.py` (no PyYAML on this box —
  `npm run check` is now `npm test && forge lint`).
- Tests 7 → 13, including the hostile-JQL-title table.

**Proven at runtime (2026-11-04):** radar fires and comments — MOBL-67 received the radar comment
naming MOBL-58/59/63 with people. Two defects surfaced doing it: (1) the trigger did not register
until a redeploy *after* install, so "deployed" ≠ "listening"; (2) `text ~ "a b c"` is a PHRASE
query and matched nothing — now ORed per token by `jqlTextClause` in engine.js (test 14).
Entry log line in `onIssueCreated` means "no comment" can be told apart from "never invoked".

## Decisions taken (do not silently reverse)

1. **Custom UI, not UI Kit.** UI Kit needs a React build toolchain and `index.html` anyway; plain DOM + esbuild is smaller and fully ours. React deps were removed.
2. **The only write is one comment** on a newly created issue (the radar). `write:jira-work` is declared for it. Everything else is read-only.
3. **`read:graph:jira` is NOT declared yet.** TWG scopes force an **org-admin install** for judges; the scope goes in at P4 together with the query, behind the Jira-native fallback in SPEC §7.
4. **Teamwork Graph is CUT (Teemu, 2026-11-04)** — EAP plus an Atlassian support allowlist is external latency, not a task. Marketplace listing also not claimed.
5. **One app, one engine, two front doors** (panel + trigger). "Safe Hands" bulk ops stay out — see SPEC §12 for why.
6. **LLM judge is live (P4, 2026-11-04, v4.1.0).** Forge LLMs API, `claude-haiku-4-5-20251001`, top-5 only, JSON verdicts. Billing is on the Developer Space (no free tier, ~1c per issue). **No cache** — deliberate: a cache is a failure mode of its own at demo volume. Any parse/API failure falls back to token ranking, never to silence. `llm` module = major version; install upgrade needed admin approval.
7. **The demo project is `MOBL` (Atlassian sample "Mobile Dev"), not `OCD`** — Teemu's clean private space stays clean for the fresh-install/incognito test. MOBL already has 53 sample issues spanning 2021→2026 and 6 sample people, so the 0:00 pain shot and the 0:40 panel shot share one realistic stage; OCD has one assignable user, which would reduce "who knows" to a single name. Seeded issues carry `labels=oncall-seed` and are deletable in one JQL.
8. **Three labelled evidence kinds, Jira-native only (P4#2, v4.2.0).** `resolved` = assignee on
   the matched resolved issue · `diagnosed` = author of the fix comment we already fetch for
   `lastFix` (zero extra requests) · `wrote up` = actor of the `resolution` transition from the
   issue changelog. The changelog is fetched per surviving match (≤5), **not** added to the search
   call: measured 49 KB → 142 KB (2.9x) for 25 issues with `expand=changelog`. `rankPeople` dedupes
   by (person, issue, kind), ranks by distinct issues then kind count, and still drops any name
   with no receipt. No Confluence scope, no `read:graph:*`. `tools/seed-fix-comments.py` adds the
   in-family fix comments the `diagnosed` kind needs (the seeded corpus had none).
9. **P5 agent + skill are manifest-only and read-only (v4.4.0).** `rovo:skill` `oncall-memory`
   packages `src/skills/oncall-memory/SKILL.md` and declares `dependencies.tools: [who-knows,
   has-happened-before]` — the two existing action keys, so the agent reaches them through the
   skill and nothing in the manifest grants a wider surface. `rovo:agent` `oncall-memory-agent`
   lists only `skills: [oncall-memory]`, matching Atlassian's own skill example; if the agent
   turns out unable to invoke the actions, adding `actions:` to the agent is the fallback. No new
   scopes, so the install upgrade needed no admin re-consent. The prompt stays inline (CLI 15 ≥
   10.6 would allow a resource path; at six lines a file would be noise).
   **Proven live 2026-11-05**, in a logged-in Rovo chat on the demo site (agent picked from the
   "Switch to another agent" list, which lists `On-Call Memory`): *"Who should I ask about
   MOBL-122?"* → Teemu Kuosmanen (wrote up / closed MOBL-70, MOBL-71, MOBL-74), Cassi Owens
   (resolved MOBL-74), Max Taylor (resolved MOBL-71), closing with "based on the 10 most recent
   resolved matches in this project". Citations checked against Jira REST: MOBL-74 Done/Cassi,
   MOBL-71 Done/Max, MOBL-70 Done/Ryan Lee — no invented names or keys. **Rovo is entitled on the
   demo site** (Ask Rovo / Open Rovo Chat are in the Jira top bar), so the risk is gone.
   What was still missing — the *screen capture* — now exists: Teemu recorded it 2026-11-05
   (`/opt/data/Videos/oncall-raw/raw-P5-agent.webm`, converted to `raw-P5-agent.mp4`, plus a
   30 s `raw-P5-agent-answer.mp4` cut from 1:24). The clip shows the question, "Invoking tool:
   Read Skills for agents", then the answer with MOBL-70/71/74. Caveats: Rovo's "Try Rovo on
   your phone" promo card covers part of the last line, and the capture is 1920×1034 (not 16:9),
   so the final cut needs a 1080p canvas. Gate unchanged: filmed by **2026-12-08** — met.
   Demo-quality note: the seeder closed every issue through the API token, so the `wrote` kind
   points at Teemu on all seeded issues and he outranks the sample team — accurate, weak on
   camera. Re-attributing the resolution transitions in `tools/seed-incidents.py` is the fix if
   we want a teammate on top.

## Gotchas that cost real time

- Handler paths resolve **under `src/`**: `handlers.whoKnows`, never `src/handlers.whoKnows`. The lint error claims the file is missing when it is not.
- First-run analytics prompt kills every non-TTY command: `forge settings set usage-analytics false`.
- `forge register --personal` fails once a Developer Space exists.
- `forge install` needs the full flag set: `--demo-site --product Jira -e development`.
- `forge site provision` times out in the CLI but keeps provisioning server-side.
- `@forge/llm` returns `message.content` as **ContentPart[]**, not a string — `JSON.stringify` on it
  yields escaped text no parser can read (the judge silently fell back on every call until fixed).
  `contentText()` in engine.js is the only correct extraction.
- Adding the `llm` module is a **major version**: `forge deploy --approve MAJOR_VERSION_RULE`,
  then `forge install --demo-site --product Jira -e development --non-interactive --confirm-scopes --upgrade`.
- A trigger added in a deployment is **not** listening until a redeploy + install upgrade has happened;
  `forge logs -f radar-fn` showing nothing is ambiguous unless the handler logs at entry.
- `forge invoke` does not exist. The panel sits behind a site login, so panel output is inspected
  with `tools/panel-probe.mjs`: it runs the real `resolvers.js`/`handlers.js` against the real Jira
  REST API, with `tools/forge-shim/*` standing in for `@forge/api` and `@forge/llm`. The shimmed
  judge therefore takes its documented fallback (token ranking stands) — the deployed radar is
  where the real judge runs. Quote panel JSON from the probe, radar bodies from the Jira API.
- `tools/eval-recall.py` now **deletes and recreates** the `oncall-eval` fixtures. Reusing them
  silently scored the previous deployment: the trigger only fires on create, so a reused issue
  still carries the old comment and the run reports the old build's number.
- `npm test` used to import only `engine.js`, so v4.3.0 shipped `resultNote is not defined`
  (the empty-state fix added the function, the import was dropped) with **24 tests green and a
  dead panel** — the probe found it, not the suite. `test/handlers.test.mjs` now calls `buildCard`
  with canned Jira JSON through a fixture `@forge/api`; any "used but not imported" or card-shape
  break fails there. Keep a test that actually imports the I/O file.
- A workspace-cleanup cron can `git add`/commit in-progress edits in this repo under a
  `chore: workspace cleanup sync` message. Check `git log` before assuming your diff is uncommitted;
  don't rewrite pushed history over the message, follow up with the real one.
- `forge install --upgrade` can answer **"Site is already at the latest version"** right after a
  successful deploy. That is not a failed upgrade: a development install tracks the latest
  deployment, so the line only means no scope change needed consent. Verify the version with
  `forge deploy` output, not with the install message.
- The Forge API token authenticates REST (`/rest/api/3/myself` as Teemu) but **cannot log into the
  site UI**, and there is no vault entry for `one-atlas-boys`. Anything that only exists in the
  Jira/Rovo UI — the panel, the Rovo agent — needs a human login (`browser_vault action=save_login`).
- The seeded corpus had no comments at all, so `diagnosed` could not appear anywhere. Run
  `tools/seed-fix-comments.py` after `seed-incidents.py`; both are idempotent.

## Next up

**P3 — seeded + measured (2026-11-04).**
- **Corpus 27 Done issues** in `MOBL`, four failure families (redis/connection-pool, bad-deploy,
  disk-full, auth-token-expiry) × 2 same-vocabulary + 3 paraphrases, 1 near-miss each, plus
  3 unrelated controls. `tools/seed-incidents.py` is idempotent and writes
  `tools/seed-manifest.json` (slot → real key).
- **Published eval: 10/10 top-3 · 0/3 control false positives** (`tools/eval-20261104.json`),
  measured on the LIVE radar path (trigger → LLM judge → comment) with the 13 query issues
  created by `tools/eval-recall.py`. Do not quote a number from unit fixtures.
- Gotcha that cost a run: the radar comments on *any* new issue, so every fixture seed got a
  radar comment, which became its "last fix" and leaked other families' words into retrieval.
  The seeder now sweeps those comments off and `eval-recall.py` refuses to measure on a dirty
  corpus (`assert_corpus_clean`).
- Eval query issues carry label `oncall-eval`; the current set is **MOBL-117…129** (13 issues,
  the 10x batch was deleted). Delete the batch before filming so the pain shot does not show
  duplicate query tickets — but **keep MOBL-122** (the agent/panel demo question) and
  **MOBL-127** (the honest-empty control).
  **Done 2026-11-05:** the other 11 are deleted (all returned 204; the label now matches exactly
  122 and 127, and all 27 `oncall-seed` incidents are intact).
- Still open from P3: `raw-P3-panel.mp4` (see DEMO.md).

**P4 — judge: LIVE (v4.1.0, 2026-11-04).** Verified on MOBL-69: comment cites MOBL-60 + MOBL-61
with reasons, and drops the near-miss/weaker token matches. The 10-pair + 3-control eval is
done (10/10, 0/3 above). **P4#2 — three evidence kinds: LIVE (v4.2.0, 2026-11-04)** — panel and
radar print `resolved` / `diagnosed` / `wrote up` per receipt (SPEC §7, HANDOFF decision 8).

**P4b — Teamwork Graph + LLM judge** (then re-decide the org-admin trade-off) — TWG is **cut**.
**P5 — `rovo:skill` + `rovo:agent`: DEPLOYED AND PROVEN (v4.4.0, 2026-11-05).**
`oncall-memory-agent` + skill `oncall-memory` are in the manifest, lint clean, deployed, install
at the latest version (no scope change). Verified in a logged-in Rovo chat: the agent appears in
the agent switcher and answers "Who should I ask about MOBL-122?" with Teemu Kuosmanen /
Cassi Owens / Max Taylor plus MOBL-70, 71, 74 — every citation matches Jira (decision 9).
Remaining: the answer is recorded (`~/Videos/oncall-raw/raw-P5-agent.mp4`, 30 s cut
`raw-P5-agent-answer.mp4`) — P5 is closed. **Gate met: filmed before 2026-12-08.**

**P6a — C + D, decided, not built yet (SPEC §13).** Two presentation features on the existing card,
no new scopes, no new requests, no LLM:

- **C, single-owner badge.** `busFactor(items, people)` in `engine.js`: if at least two matched
  issues have receipts and one person's evidence covers every one of them, say so in the panel and
  append one sentence to the radar comment. On MOBL it should fire, because the seeder closed
  everything through one account — that is the demo beat and the known attribution skew in one.
- **D, draft the ask.** `askDraft({...})` builds the message a user would actually send, from the
  card's own fields; the panel copies it and also shows it, since the Custom UI iframe may refuse
  the clipboard.

Order: D first if only one fits. Gate: `npm test` with the new cases, `npm run check`, deploy +
install, then `tools/eval-recall.py` must still read 10/10 and 0/3 (these touch presentation only).
Do not re-decide the thresholds; they are written down in §13, including why the badge needs 100 %
coverage.

**P6 — video, listing decision, Devpost form**

## Open questions for Teemu

- Should the demo project be seeded with a fictional team + tickets he is happy to show judges?
- Marketplace listing: chase it (needs partner agreement + review) or skip and enter only the main + agent/MCP/TWG tracks?

## MCP: what "zero config" actually costs (verified 2026-11-04)

External MCP exposure is **off by default per app**. Before the 2:30 demo beat:

1. Atlassian Administration → **Apps → Sites → one-atlas-boys → Connected apps**
2. Select On-Call Memory → **Tools** → enable the two tools
3. In the client: `claude mcp add --transport http oncall https://mcp.atlassian.com/forge/d0c1b623-3512-4219-8760-0b15e2bd80b2`
4. Connect → OAuth consent → pick the site → approve

Never call the app "zero config" in copy. Say "one admin toggle, then any MCP client".

## Devpost submission artifact — write this before the video, not after

Draft lives in `docs/devpost.md` (tagline 114 chars, long description 586 words, tracks and
checklist included). Fill the video URL and the access path, then paste.

- [ ] Tagline (one sentence, ≤140 chars) — must not claim AI judging until P4 lands
- [ ] Long description: problem → product → receipts rule → how the tech requirement is met
- [ ] Category: **Apps for Software Teams**
- [ ] Bonus tracks claimed: MCP (yes) · Agents (only if the agent is filmed) · TWG (**cut**, EAP + allowlist) · Marketplace (**not claimed**)
- [ ] Video URL (public YouTube, ≤5 min, front-load 2:50)
- [ ] Install/access link, tested in a fresh incognito browser as a non-owner
- [ ] Repo URL (make `KuosmTE/oncall-memory` public or grant access)
- [ ] Fresh-site checklist: install → open issue → panel shows output → create issue → radar comment arrives

## Open decisions (owner: Teemu)

1. **Jira API token** in `.env` — blocks all seed data and therefore every measurement.
2. **Teamwork Graph**: EAP + Atlassian support allowlist. Either send the request now (10 min) or drop the track. Default if silent: drop.
3. **Forge LLM billing** — no free tier; the judge improvement assumes we accept cents-level billing.
