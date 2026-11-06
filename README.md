# On-Call Memory

**Ask who fixed it before. Every name comes with the Jira issue that proves it.**

A Forge app for Jira Cloud, built for Codegeist 2026. Open an issue and the panel names up to
three people who have solved that kind of problem, with the issue key, the date, and how we know.
Create an issue and a comment arrives with the previous fix. Ask the Rovo agent the same question
and it cites the same keys.

## The problem

Jira search tells you that forty tickets look like yours. It never tells you who to ask.

Skill matrices and expertise apps record what people claim. The useful signal is what they
already did: who was the assignee when the ticket was resolved, who wrote the comment explaining
the fix, who actually moved it to Done. That signal sits in Jira the whole time and nobody reads
it.

## What it does

| Surface | Behaviour |
|---|---|
| **Issue panel** (Custom UI) | Up to three people, ranked by distinct issues then evidence breadth, each with receipts. Empty is a real answer: "No receipts: nothing resolved looks like this ticket." |
| **Radar** (product trigger) | On issue creation, posts one comment naming up to three past issues, their fixes and who to ask. Silent when there is no evidence. |
| **Rovo agent** (`rovo:agent` + `rovo:skill`) | Answers "who should I ask about MOBL-122?" by loading the skill, calling the actions and citing issue keys. |
| **MCP** (`rovo:mcp`) | The same two actions as tools for any MCP client, after one admin toggle on the site. |

Three evidence kinds, all from Jira, all inside `read:jira-work`:

- `resolved`: assignee at the time the matched issue was resolved
- `diagnosed`: author of the comment that explains the fix
- `wrote up`: actor of the `resolution` transition in the issue changelog

`rankPeople` dedupes by (person, issue, kind). If it cannot prove a name with an issue key, the
name does not appear.

## What it measures

- **10/10** labelled pairs put the true match in the top three, and **0/3** unrelated controls
  produced a match. Measured on the live radar path (trigger, judge, comment), not on fixtures.
  Harness in `tools/eval-recall.py`, results in `tools/eval-20261104*.json`.
- **26** unit tests (`npm test`), no network: ranking, evidence kinds, the judge's prompt and
  parse fallbacks, and the card path against canned Jira JSON.
- Retrieval starts as token ranking over resolved issues in the project. A Forge LLM judge
  (`claude-haiku-4-5`) then decides which of the top five are really the same problem. When the
  API call or the parse fails, ranking stands and the card still renders.

## Read-only, except one comment

The app declares `read:jira-work` and `write:jira-work`. The only write in the code is the single
radar comment on a newly created issue (`handlers.onIssueCreated`). No cache, no storage, no
Confluence scope, no Teamwork Graph dependency.

## Repo layout

```
app/manifest.yml                panel + functions + 2 actions + rovo:mcp + rovo:agent + rovo:skill + trigger
app/src/engine.js               pure ranking: rankCandidates, rankPeople, judge prompt/parse, verdict
app/src/handlers.js             the only file that does Jira I/O (search, changelog, one comment)
app/src/resolvers.js            panel resolver → plain props
app/src/frontend/panel/         Custom UI (plain DOM + esbuild bundle)
app/src/skills/oncall-memory/   SKILL.md the Rovo agent loads
app/test/                       node:test, no deps; handlers.test.mjs runs buildCard on canned JSON
tools/                          seeding, live eval harness, panel probe, forge shims
SPEC.md · DEMO.md · HANDOFF.md  product spec · filming protocol · current state and decisions
```

## Run it

Requires Node 22 or 24 and a Jira Cloud site you administer.

```bash
git clone <this repo> && cd oncall-memory/app
npm install
npm test                       # 26 tests, no network
npm run check                  # tests + forge lint
npm run forge:deploy           # builds the panel bundle, then deploys to development
npx forge install --demo-site --product Jira -e development --non-interactive --confirm-scopes
```

Open any issue in the project and the panel is on the issue view. New issues get the radar
comment within the platform's three-minute delivery window.

The demo corpus is synthetic. `tools/seed-incidents.py` creates four failure families (redis
connection pool, bad deploy, disk full, auth token expiry) with same-vocabulary and paraphrased
duplicates plus unrelated controls. `tools/seed-fix-comments.py` adds the fix comments the
`diagnosed` kind needs. Both are idempotent and label everything `oncall-seed`, so the whole
corpus deletes with one JQL.

## What is not here

Teamwork Graph needs EAP plus an Atlassian support allowlist. The Jira-native evidence above is
what ships. The fallback is the product.

Bulk operations, auto-assignment and dashboards are out. The app answers one question and is not
trying to become a workflow tool.

Caching is out. At demo volume it causes more failures than it prevents.

There is no Marketplace listing. The app runs as a development deployment on the demo site.

`SPEC.md` has the product reasoning and the competitive landscape. `HANDOFF.md` has the
decisions, and the mistakes that cost real time.
