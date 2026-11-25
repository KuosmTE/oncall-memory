# HANDOFF — On-Call Memory (Codegeist 2026)

Read this first in a fresh session. Then `SPEC.md` (product) and `DEMO.md` (filming).

## Where things are

| Thing | Value |
|---|---|
| Repo (local) | `/opt/workspace/codegeist` |
| App dir | `/opt/workspace/codegeist/app` |
| App id | `ari:cloud:ecosystem::app/d0c1b623-3512-4219-8760-0b15e2bd80b2` |
| Developer Space | Minttu Labs (account: teemu.kuosm@gmail.com) — **rename to `bittisorvi.org`** in the console: that string is what the install page shows as the provider |
| Live site | `https://one-atlas-boys.atlassian.net` (Forge demo site, ~90 days) |
| Deployed | `development` **major 6** (2026-11-24: review fixes, Teamwork Graph scopes removed) · **production major 2** (2026-11-24: review fixes + P6a; this is what the judges' install link will serve) — `forge deploy list` prints majors, not minors |
| Credentials | `/opt/workspace/codegeist/.env` (`FORGE_EMAIL`, `FORGE_API_TOKEN`, chmod 600) |
| Deadline | **2026-12-22 22:00 EET** (Devpost submission) |
| Milestones | P3 data+eval **Nov 14** · P4 LLM judge+evidence **Nov 28** · P5 agent filmed **Dec 8 (hard gate)** · video cut **Dec 15** · submit **Dec 20** |
| Next action | **`docs/week-plan.md`** — 29 days to the 2026-12-22 deadline. Step 1 is the judges' installation link (browser, 25 min): flip the repo public → Developer Console → Distribution → Sharing → paste into `JUDGES.md` + Devpost. Then record, upload, submit by 2026-12-15. |

## Contest facts (verified 2026-11-23, `codegeist2026.devpost.com/rules`)

- Deadline **2026-12-22 12:00 pm PT = 22:00 EET**; judging 2027-01-05 → 02-03; winners ~2027-02-15.
- Categories: Apps for Software Teams · Business Teams · Specialized Industries. Ours is Software Teams.
- **Bonus prizes** ($1,500, 6 winners each): Best Agents (Rovo/assignable) · Best app with Atlassian
  MCP · Best Teamwork Graph integration · Best Marketplace published app.
- **One submission can win at most one Grand Prize and one Bonus Prize** — claim two bonuses, expect one.
- **An installation link is mandatory** for judging, made in the developer console after a
  **production** deploy. A demo-site install does not count.
- **Multiple submissions are allowed** but each must be "unique and substantially different".
- Judging: five equally weighted criteria — Technological Implementation, Design, Potential Impact,
  Innovation/Idea, Presentation.
- Participation swag: first 300 eligible submissions — submit early, not on the last day.

## Commands (the only ones that matter)

```bash
cd /opt/workspace/codegeist && set -a && . ./.env && set +a   # auth, no keychain, no forge login
cd app
npm test                      # 39 tests, no network (37 engine + 2 card-path)
npm run check                 # test + forge lint (the validator script was deleted: no PyYAML on this box)
npm run build:panel           # esbuild the Custom UI bundle → src/frontend/panel/app.js
npx forge lint                # must say "No issues found"
npm run forge:deploy          # builds the panel bundle first — never call forge deploy bare
npx forge install --demo-site --product Jira -e development --non-interactive --confirm-scopes --upgrade
cd .. && node tools/demo-preflight.mjs        # 6/6 PASS = the film-day state is still true
cd .. && node tools/panel-probe.mjs MOBL-69   # the panel's resolver JSON, without a browser
cd app && npm run forge:deploy -- -e production   # builds the panel first; judges install from prod
                                              # sharing lives at .../myapps/<appId>/manage/distribution
```

## Architecture

```
app/manifest.yml                  panel + 4 functions + 2 actions + 2 MCP tools + trigger + scopes
                                  + rovo:agent `oncall-memory-agent` + rovo:skill `oncall-memory`
app/src/skills/oncall-memory/      SKILL.md — when to call which action, how to read receipts
app/src/engine.js                 PURE ranking + presentation (rankCandidates, rankPeople,
                                  busFactor, askDraft, bestReceipt) — all logic lives here
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

## Review round 2 (architect, t_94fbf920, 2026-11-23) — fixed in 5.0.0

Read-only review of `main` at 45bb050: **1 blocker, 4 should-fix, 5 nice-to-have**, every claim
verified by execution. Fixed:

- **🔴 Panel receipt links were dead clicks.** The Custom UI iframe sandbox has no `allow-popups`, so
  `target="_blank"` is blocked, and a relative `/browse/KEY` href resolves against the CDN origin, not
  the Jira site. `issueLink` now calls `router.open()` (present in `@forge/bridge` 7.2.1). This broke
  DEMO beat 0:40 and the "key you can click" promise in JUDGES.md — the beat is filmable again, but a
  human click is the only test for it.
- **🟡 `busFactor` fired on joint ownership.** It only checked `people[0]`; if Alice resolved and Bob
  closed every match, both held every receipt and the badge still said "Single owner: Alice". Owners
  are now counted across everyone and exactly one is required.
- **🟡 The badge's coverage union came from the top-3 rows.** A 4th-ranked receipt holder was invisible,
  so `(2 of 2)` could be printed while a third receipt existed. The badge is now computed in `buildCard`
  from every receipt holder and travels as `card.singleOwner`; resolver and radar read that field.
- **🟡 `resultNote` claimed "in this project" for free-text searches**, which have no project scope. The
  note takes the scope as a parameter, and PRIVACY.md states the same distinction.
- **🟡 The scripted MCP question asked for a description** ("the checkout rollback in MOBL"), but
  `who-knows` requires an issue key. Beat now uses MOBL-122; `SKILL.md` documents the two-step fallback
  (`has-happened-before` with text → take a key → `who-knows`).
- 🔵 Fixture comment about `route` encoding corrected (the real SDK *does* encode), DEMO's "watch past
  3" corrected to five minutes, and the production deploy command now goes through
  `npm run forge:deploy --` so a stale panel can never be shipped.

Sound and left alone: engine purity, manifest/module hygiene, trigger identity (`asApp`), JQL injection
defences, resolver/frontend contract, the contest-facts docs, and production 2.0.0 carrying P6a.

## P6b — Teamwork Graph load: probed, parked (2026-11-24)

Built to SPEC §13's "what is this person carrying now" idea, using the curated
`atlassianUserAssignedJiraWorkItems` query. It works: live panel, `edges=4` for Cassi Owens,
`errors=0`, and the consent for `read:graph:issue:jira` + `read:graph:user:atlassian` went through
without a browser prompt. It is **not shipped**, because every assigned item in the sample corpus is
in the Done category, so every person renders `0 open items` — honest, but worth nothing on camera
and worth two extra permission prompts for a judge.

Kept on branch `feat/twg-workload` (worktree `/opt/workspace/tmp/cg-twg`) together with temporary
`panel diag` / `twg raw` log lines; `main` carries no graph scopes. If a future corpus has open
assigned work, resurrecting it is a manifest hunk plus the same panel line.

## Gotchas that cost real time

- **`jira:issuePanel` is not a sidebar section.** In the new issue view the panel is added from
  **View app actions → <panel title>**, and only then does the app's resolver run — before that
  click there is no iframe, no log line, nothing. Every "the panel is proven" claim before
  2026-11-24 rested on `tools/panel-probe.mjs` JSON, because nobody had clicked that menu item.
  The first live look (via a browser session Teemu opened) showed the card, the badge and the draft
  working exactly as designed. The film beats must show the click itself.

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
- `tools/eval-recall.py` deletes **every** issue carrying `oncall-eval`, not only its own batch.
  MOBL-122 / MOBL-127 used to carry that label and the P6a re-measurement would have destroyed the
  demo pair; the label was removed 2026-11-06. Never label a ticket that must appear on camera.
- The single-owner badge needs **two matched items that have receipts**, so a card where the judge
  keeps one match prints no badge (3 of 10 pair comments on 2026-11-06). That is the §13 gate, not
  a regression — do not "fix" it by counting items nobody touched.
- `bestReceipt` sorts by (kind, has a fix, recency) on purpose: the newest receipt alone gave
  MOBL-75, which has no fix comment, and the filmed sentence lost its most concrete clause.
- The panel probe reports the **token-ranking fallback** (no LLM outside Forge), the radar reports
  the judge's top-5 — so the same issue can show 5 receipts in the probe and 3 in the comment. The
  badge rule is identical; quote each from its own path.
- `forge deploy -e production` failed its first run with `Error: Request timed out after 300000ms` in
  the lint step, then succeeded unchanged on a retry (production 2.0.0). A lint timeout is not a lint
  failure — retry before reaching for `--no-verify`.
- The judges' **installation link** only exists after a *production* deploy (docs: deploy to production,
  then developer console → Distribution → Sharing). It is invalidated every time sharing is re-saved,
  so regenerate and re-paste into `JUDGES.md` after any change to the distribution settings.
- An app **submitted for Marketplace listing can no longer be distributed via installation link** —
  which is why the Marketplace bonus is skipped: the install link is a judging requirement and the
  listing is a bonus. Do not flip that order without cloning the app id.
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
  **Done 2026-11-05:** the other 11 are deleted (all returned 204; the label then matched exactly
  122 and 127, and all 27 `oncall-seed` incidents are intact). **2026-11-06:** both lost the
  `oncall-eval` label when P6a was re-measured, so an eval run cannot delete them any more — see
  Gotchas. Both are still open (`To Do`) and are what the panel beat opens.
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

**P6a — C + D: BUILT, DEPLOYED, PROVEN (v4.6.0, 2026-11-06).** SPEC §13, two presentation
features on the existing card — no new scope, no new request, no LLM, no write:

- **C, single-owner badge.** `busFactor(items, people)` + `busFactorText(badge)` in `engine.js`.
  Fires only from 2 receipt-bearing matched items up and only at 100 % coverage (the top person's
  distinct evidence keys must equal the union); an issue with no receipt is ignored, not counted.
  Panel prints the line under the people list; the radar appends the same sentence, only when the
  badge exists.
- **D, draft the ask.** `askDraft({...})` + `bestReceipt(person, items)` in `engine.js`.
  `buildCard` now also returns `subject: { key, summary }` — the issue context it already fetched,
  so the draft costs no second request. `bestReceipt` prefers a resolution, then a close, then a
  diagnosis, and within a kind prefers an issue that actually has a fix; **the verb follows the
  receipt kind** (`resolved` / `closed` / `diagnosed`), the one deliberate widening of the §13
  example, because on MOBL the top person's receipt is `wrote up` and a message saying "resolved"
  would contradict the label printed three lines above it. The panel button reveals a selectable
  block and *then* tries `navigator.clipboard`; if the iframe refuses, the text is already on
  screen. Nothing is written to Jira from the panel.

Evidence (2026-11-06, all against the live site):

- `npm test` **39/39** — 13 new cases (5 badge gate, 6 draft template, 2 receipt pick); the card
  test now pins `subject` too.
- `npm run check` → "No issues found". Deploy **4.6.0**, install upgrade answered "already at the
  latest version" (no scope change, no admin re-consent).
- Panel, real resolver + real Jira REST (`node tools/panel-probe.mjs MOBL-122`):
  `singleOwner: "Single owner: Teemu Kuosmanen holds every receipt (5 of 5)."` and
  `draft: Hi Teemu Kuosmanen — MOBL-122 ("We rolled the release back, checkout was broken") looks
  like MOBL-70, which you closed on 2026-11-04: "Reverted 4.18.0 to 4.17.2. The payment service
  config was missing the retry budget;…". Could you take a look?` MOBL-127 (the honest-empty
  control) correctly shows `No receipts`, no badge, no draft.
- Radar, real judge, fresh issue (MOBL-135, created by the eval run, since swept): the comment ends
  `Ask: Teemu Kuosmanen (diagnosed — MOBL-70 · wrote up — MOBL-74 · …) · Cassi Owens (resolved —
  MOBL-74) · Max Taylor (resolved — MOBL-71) Single owner: Teemu Kuosmanen holds every receipt
  (3 of 3).` Badge appeared on **7 of the 10 pair comments**; the other 3 cards held a single
  matched issue, below the 2-item gate — the gate working, not a miss. No control got a comment.
- `tools/eval-recall.py` on v4.6.0: **10/10 top-3 · 0/3 control false positives**
  (`tools/eval-20261106.json`) — unchanged, as it must be: these touch presentation, not retrieval.
- `node tools/demo-preflight.mjs` asserts the badge, the draft, the empty state, the 27-incident
  corpus (and that it is free of radar comments), the absence of an eval batch and that both demo
  issues are still open — **6/6 PASS**. That is step 1 of the weekend run book, and it is what
  "panel and radar both show it" means operationally.
- **Live panel, first look (2026-11-24, Teemu's browser, dev major 6).** Opened from
  **View app actions → On-Call Memory**; renders above Activity with a `DEV` badge and shows
  `3 past fixes · 3 people who did them`, Teemu's receipts (`diagnosed` MOBL-70 · `wrote up`
  MOBL-74 / MOBL-71 / MOBL-70), Cassi's and Max's `resolved` receipts, and
  `Single owner: Teemu Kuosmanen holds every receipt (3 of 3).` — the badge exists on the screen a
  judge sees, not only in probe JSON. **Draft the ask** produced
  `Hi Teemu Kuosmanen — MOBL-122 ("We rolled the release back, checkout was broken") looks like
  MOBL-70, which you closed …` and **copied it to the clipboard** (the button flipped to "Copied"),
  so the selectable block is a spare path, not the only one. Note the verb is "closed": the top
  person's receipt is `wrote up`, and the template follows the kind on purpose.
  **Receipt keys verified the same session:** Teemu clicked every `MOBL-…` link in the panel and
  each opened the right ticket, so the `router.open` fix works inside the live iframe and DEMO
  beat 0:40 is filmable. The panel is now the best-evidenced part of the app.

**P6a#2 — the ask arrives with the radar comment (2026-11-24).** `cardAsk(card)` in `engine.js` is now
the single builder of the drafted message: the panel resolver and `commentBody` both call it, so the
button and the comment cannot disagree. The comment gains the sentence as its last paragraph, only
when there is a person and a receipt. Live proof from the eval run (`MOBL-144`):

> … Single owner: Teemu Kuosmanen holds every receipt (2 of 2). Hi Teemu Kuosmanen — MOBL-144
> ("Checkout falls over at peak again") looks like MOBL-58, which you closed on 2026-11-04: "Raised
> the Redis connection pool to 200 and put a p99 alert at one second. Queueing stopped within
> minutes.". Could you take a look?

Tests 44 → 45 (card-level ask, comment tail, and the trailing-period case). **Eval after both
changes: 10/10 top-3 · 0/3 controls** (`tools/eval-20261124.json`, re-run on the final build, so the
measured build is the live build). Deployed to `development` and `production`; no new scopes. The
trailing-period trim (`askDraft` drops a final `.` before quoting the fix) landed before that eval.

The eval batch (**MOBL-157…169**, second run) was deleted after measuring, so the board is again 27
seeded incidents + **MOBL-122** (demo question) + **MOBL-127** (honest-empty control). The two demo
issues
**no longer carry the `oncall-eval` label** — the eval deletes every issue with that label before
creating its batch, and would have destroyed both. Do not label them again.

**P6 — video, listing decision, Devpost form**

## Open questions for Teemu

- **Teamwork Graph**: run the 45-minute spike (`docs/week-plan.md` §5) or ship as-is? Default if
  silent: ship as-is; the entry already shows the receipts rule, the badge and the draft.
- **Optional cheap win**: append the drafted ask to the radar comment, so a new ticket arrives with the
  message already written (~30 min, no new scope, needs one eval re-run). Not built.

## MCP: what "zero config" actually costs (verified 2026-11-04)

External MCP exposure is **off by default per app**. Before the 2:30 demo beat:

1. Atlassian Administration → **Apps → Sites → one-atlas-boys → Connected apps**
2. Select On-Call Memory → **Tools** → enable the two tools
3. In the client: `claude mcp add --transport http oncall https://mcp.atlassian.com/forge/d0c1b623-3512-4219-8760-0b15e2bd80b2`
4. Connect → OAuth consent → pick the site → approve

Never call the app "zero config" in copy. Say "one admin toggle, then any MCP client".

## Devpost submission artifact — write this before the video, not after

Draft lives in `docs/devpost.md`: tagline (114 chars), long description, "how it meets the technology
requirement", bonus-prize selection, video/section copy and the checklist. `docs/week-plan.md` §1–4 is
the step order; `JUDGES.md` is the testing instruction the rules require.

- [x] Tagline (114 chars), long description, tech-requirement blurb
- [x] Category: **Apps for Software Teams**; bonus prizes **Agents + MCP** (one bonus per submission)
- [ ] Installation link generated in the developer console (production 2.0.0 is already deployed) and
      pasted into `JUDGES.md` + the Devpost Access field
- [ ] Video URL (public YouTube, ≤5 min, front-load 2:50)
- [x] Repo public — `github.com/KuosmTE/oncall-memory` went public 2026-11-25 (44-commit history
      scanned for secrets first: nothing but documentation placeholders; anonymous read returns 200)
- [ ] Test the install link in incognito as a *second* site's admin: install → open issue → panel shows
      output or the empty state → create issue → radar comment arrives
- [ ] Teamwork Graph: optional 45-min spike in `docs/week-plan.md` §5 decides whether the claim flips
- [ ] Submit by 2026-12-15 (slack), hard stop 2026-12-22 12:00 pm PT

## Open decisions (owner: Teemu)

1. **Installation link** — the only remaining hard blocker; 25 minutes in the browser (`docs/week-plan.md` §1).
2. **Record date** — the beats need one uninterrupted hour plus the MCP toggle. Everything else can wait.
3. **TWG spike** — 45 minutes that decides between "ship as-is" and a graph-backed person context.

Resolved: Jira API token (in `.env`), Forge LLM billing (accepted, cents per issue), TWG EAP/allowlist
(gone — the API is in Preview since 2026-10-15), Marketplace (skipped: listing would block the install
link).
