# On-Call Memory — product spec (draft v0.1)

Codegeist 2026 submission. Category: **Apps for Software Teams**.
Bonus targets: **Teamwork Graph**, **Best Agents**, **Best app with Atlassian MCP**.
Owner: Teemu (guide, recorder, form-filler). Builder: Minttu. Deadline: 2026-12-22 22:00 EET.

## 1. Problem

An incident lands on a DevOps team. Jira already knows the answer — 40 issues mention
"timeout", three of them were the same failure, one has the fix in a comment and the
name of the person who wrote the runbook. Nobody can query that. So the team asks in
Slack and waits, or re-solves a 2024 problem in 2026.

The graph has the answer. It has no interface.

## 2. Product

**On-Call Memory** answers two questions, at the two moments they get asked.

| Moment | Front door | Question |
|---|---|---|
| You're looking at a ticket | Jira issue panel | "Who actually knows about this?" |
| A ticket is created | Product trigger → comment | "Has this happened before, and how was it fixed?" |

Both are one engine: **search similar past work → rank by text overlap → return receipts
(issue keys, people, links).** An LLM judge (live since v4.1.0) filters the top five candidates;
token ranking is the fallback when the judge fails.

### What "receipts" means (non-negotiable)

Never a bare name. Every claim carries its evidence: issue key, **which of three things the
person did**, and when. The three kinds are the whole vocabulary:

| Label | What it proves | Where it comes from |
|---|---|---|
| `resolved` | they were the assignee on the matched resolved issue | issue `assignee` |
| `diagnosed` | they wrote the fix comment on it | author of the comment we already fetch for "how it was fixed" |
| `wrote up` | they closed it | actor of the `resolution` transition in the issue changelog |

If we can't cite it, we don't say it — a kind that is missing for a person is simply not printed.
This is the difference between a demo and a product.

## 3. Non-goals

- No writing, transitioning, assigning or bulk operations. The single exception is
  **one comment posted on a newly created issue** (the radar). That comment is the whole
  write surface; everything else is read-only. (#3 "Safe Hands" is a separate product,
  deliberately not merged here.)
- No embeddings, no vector store. JQL text search + LLM judgement only.
- No cross-site, no external connectors, no configuration screens. Zero-setup install.
- No free-text chat UI of our own: Rovo is the chat, we supply the tools.

## 4. Modules (one app, four prize pools)

| Module | Purpose |
|---|---|
| `jira:issuePanel` (Custom UI) | The memory card for the issue in front of you |
| `trigger` — `avi:jira:created:issue` | Radar: comment on new issues |
| `action` ×2 (`who-knows`, `has-happened-before`) | The engine's callable surface |
| `rovo:skill` (SKILL.md) | Tells Rovo *when* and *how* to use the actions |
| `rovo:agent` | "On-Call Memory" teammate: prompt + actions + skill |
| `rovo:mcp` | Same read-only tools for Claude Code / Hermes |

## 5. Actions (engine surface)

All read-only, all return `{ items: [...], confidence, note }`.

1. `has-happened-before` — input: `text` or `issueKey`. Output: ≤5 past issues that
   were the same problem, each with resolution summary, resolver, date, and a one-line
   "why it matches". Excludes the input issue and anything unresolved.
2. `who-knows` — input: `issueKey`. Output: ≤3 people ranked by evidence (distinct issues
   first, then how many of the three kinds they cover), each with labelled receipts:
   `[{kind: resolved|diagnosed|wrote, issueKey, date}]`.
Both are served by one internal call (`buildCard`) so the panel, the actions and the
   trigger cannot disagree. The radar comment is a plain function, not an action: agents
   get no write surface.

**MCP exposure:** both actions, read-only.

## 6. Data sources

- **Jira search** (JQL `text ~ "..."`, project-scoped): candidate set, ≤50.
- **Teamwork Graph** (GraphQL + Cypher, read scopes): people ↔ work relationships for
  "who knows". Requires org-admin install — accepted, we are org admin on our own site.
- **Forge LLMs** (`claude-haiku-4-5`): **live since v4.1.0** — it judges the top 5 token-ranked
  candidates ("same problem?"), and any failure falls back to token ranking. No free tier (billed
  to the app developer).
- **Forge storage:** not used; there is deliberately no card cache at demo volume. Revisit only
  if the panel runs at real volume.

## 7. "Who knows" evidence — Jira-native, shipped (P4, v4.2.0)

The fallback is the product. Teamwork Graph was cut (HANDOFF decision 4), so every name in the
panel is backed by one of three Jira-native kinds, all inside `read:jira-work`:

| Kind | Label | Source | Cost |
|---|---|---|---|
| `resolved` | resolved | `assignee` on the matched resolved issue | already in the search fields |
| `diagnosed` | diagnosed | author of the fix comment already fetched for the fix line | zero extra requests |
| `wrote` | wrote up | actor of the `resolution` transition in the issue changelog | one `expand=changelog` fetch per matched issue (≤5) |

`rankPeople` dedupes by (person, issue, kind), ranks by distinct issue count then by how many
kinds the person covers, and drops any name without a receipt. The changelog is *not* added to
the search call: measured on the demo site, `expand=changelog` took the 25-issue search payload
from 49 KB to 142 KB (2.9x), so it is fetched per surviving match instead.

If a matched issue has no comment, its assignee was cleared, or the changelog shows the
resolution was later removed, that kind is absent for that person — never invented.
No Confluence scope and no `read:graph:*` is declared.

## 8. Acceptance criteria

- **P2** App installs on the dev site; panel renders the issue key and title.
- **P3** Given 10 hand-labelled issue pairs, `find-similar-resolved` returns the true
  pair in the top 3 for ≥8/10, and returns nothing for the 3 unrelated controls.
- **P4** Panel shows ≤3 people with receipts in <5s. New issue gets a radar comment
  within 3 min (platform limit), or says so.
- **P5** Rovo agent answers "who should I ask about PROJ-123" using our tool; Hermes
  calls `who-knows` over `https://mcp.atlassian.com/forge/<appId>`.
- **P6** 3-min video shows: ticket → panel answer → radar comment → agent → MCP call.

## 9. Demo script (3 min, the beats that score)

1. `0:00` The pain: an incident, 40 Jira hits, nobody to ask. (20s, no slides)
2. `0:20` Open the ticket → panel: "Ask these three." Click one → the issue that proves it.
3. `1:10` Create a near-duplicate ticket → radar comment appears with the previous fix.
4. `1:50` Ask the Rovo agent the same question in chat → it uses our tool, cites keys.
5. `2:30` In Claude Code: `who knows about this?` → MCP call, same answer, outside Atlassian.
6. `2:50` One line: read-only except one comment, zero config, install link.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Trigger lag up to 3 min | Panel is the instant hero; radar is the "it also" beat |
| TWG needs org admin to install | Accepted; fallback in §7 keeps the core alive |
| JQL text search is dumb | LLM judge does the real matching; ship the 10-pair test |
| Demo-site data too sparse for a story | Seed our own project with 5 resolved incidents in P2 |
| LLM cost / latency | Haiku only, 30-min cache, one call per card |

## 11. Out of scope until after submission

Marketplace listing (separate decision, review takes weeks), Safe Hands MCP writes,
Confluence-side module, paid tier.

## 12. Competitive landscape (checked 2026-11-02, Marketplace REST)

| Space | Who is there | Read |
|---|---|---|
| Duplicate / similar issues | Find Duplicates (12.7k dl, 123k users, 3.9★/49), Similar Issues Finder + Similar & Related (Starware, 2 apps), Duplicate AI, Merge Assistant, Appsvio Service Pack for Agents, JSM native similar-request suggestion | **Saturated.** No novelty left. Can exist as a feature; cannot be the pitch. |
| Evidence-derived expertise ("who actually did this") | Nothing. Only *declared* skill matrices: Skills for Jira (6 installs), Skills Matrix (7), SkillQuest (2) — manual HR data | **Empty.** The wedge: a skill matrix records what people claim, we show what they did. |
| Teamwork Graph apps | 1 (Gitbook Connector, 0 installs) | **Greenfield**, matches the bonus track. |
| MCP over Atlassian | Secure MCP for Confluence (16 installs), MCP Gateway for Jira (0), BesTest (65), Atlassian's own Bitbucket DC MCP | **Early and shallow.** Almost nobody ships an opinionated MCP surface. |
| Bulk Jira operations | Deep Clone (11.4k), Appfire, codefortynine | **Mature.** Confirms "Safe Hands" is a feature, not a product. |
| Decision logs | Simple Decision Log (4 installs, 0 reviews), Atlassian Labs Decisions Helper (247) | Empty but low demand signal — nobody installs decision tools. Empty ≠ wanted. |
| Status / reporting | Time-in-status, velocity, eazyBI, Dashboard Hub — hundreds | Reporting is commoditised. "Your page disagrees with reality" is unserved, but urgency is weak. |

### The real competitor is Rovo Chat itself

Rovo can already answer "who worked on this" *approximately*, in a chat panel, from
the graph. We are not inventing a capability — we are building the interface the
capability lacks. Defensible differences, in order of how much they matter on camera:

1. **Receipts or silence.** Every name ships with the issue key, the kind of thing they did
   (resolved / diagnosed / wrote up) and the date. A chat answer can't be audited; a panel
   entry can.
2. **At the point of work.** It appears on the ticket, unprompted. No prompt engineering,
   no "did you ask Rovo the right way".
3. **Outside Atlassian.** Same tools over `mcp.atlassian.com`, so Claude Code and Hermes
   get the same memory mid-fix.
4. **Deterministic.** Fixed JQL, fixed ranking rules, no per-open cache to go stale — the same
   issue gives the same answer twice.

Positioning sentence (evidence types are broadened as of v4.2.0 — three labelled kinds, no longer
"assignee at resolution" only):
**"Your skill matrix records what people claim. On-Call Memory cites who was there when it
was fixed — how they were there, with the issue keys to prove it."**

Do not claim a kind that the panel does not print. If a person's only receipt is a diagnosis, the
sentence still holds; the panel says `diagnosed — MOBL-58` and nothing more.

## 13. P6a — two cheap features, decided (C and D)

Both are read-only, need no new scope, no new dependency and no extra request. Both are filmable in
one take. Build them in this order, D first if only one fits the schedule.

**Shared rules.** Pure logic in `engine.js` with unit tests, presentation in `resolvers.js` and the
panel bundle. No LLM call, no storage, no new Jira request, no write. Nothing ships from a claim the
card cannot prove.

### C. Single-owner badge ("bus factor")

The same receipts, read as a risk. When every matched issue's evidence points at one person, say so.

- Input: `items` (matched issues) and `people` (ranked, with `evidence[].issueKey`).
- Rule: consider only items that have at least one receipt. If fewer than 2 such items, say
  nothing. Otherwise take `people[0]` and compare the distinct `issueKey`s in that person's evidence
  with the union of all evidence keys. Equal ⇒ single owner.
- Output: `{ person, issues, of }` or `null` from `busFactor(items, people)`.
- Panel: one line under the people list, e.g. `Single owner: Cassi Owens holds every receipt (2 of 2).`
  Radar: append the same sentence to the comment, and only when the badge exists.
- Tests: sole owner over 3 items → badge; two owners → null; one item → null; top person covers
  2 of 3 → null; item with no receipts is ignored rather than counted.

### D. "Draft the ask" button

A name is not a message. Give the user the message.

- Pure template, no model: `askDraft({ key, summary, person, receiptKey, receiptDate, fix })`.
- Output: `Hi Cassi Owens — MOBL-122 ("We rolled the release back, checkout was broken") looks like
  MOBL-74, which you resolved on 2026-11-04: "Raised the pool max, timeouts stopped". Could you take
  a look?`
- Rules: every field comes from the card. Missing `fix` drops that clause and the colon that
  introduces it. Missing date drops the date clause. No person, no button. Never a key that is not
  in that person's evidence.
- Panel: one button under the top person. It copies the text and also shows it in a selectable
  block, because the Custom UI iframe may refuse `navigator.clipboard`; the fallback has to work
  without the clipboard, on camera.
- Tests: full sentence with all fields; missing fix; missing date; the text never contains a key
  that is not the provided `receiptKey`; no people ⇒ no draft.

### Acceptance

- `npm test` green, new cases included.
- `npm run check` clean; deploy + install upgrade succeed with no scope change.
- Panel and radar both show the badge on the demo corpus (MOBL-122 should qualify: the seeded
  issues were all closed by one account).
- The button produces a message naming the person, the query key and the receipt key.
- `tools/eval-recall.py` unchanged at 10/10 and 0/3. These features touch presentation, not
  retrieval, so any movement there is a bug.

### Non-goals

No new scopes, no comment from the button, no assignment, no caching, no LLM in either feature, no
dashboard. If the badge fires on almost every issue on real data, the threshold is wrong, not the
idea: it must require 2 matched issues and 100% coverage.

