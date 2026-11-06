# Devpost submission draft

Working copy. Fill the `TBD` fields the day the video is uploaded.

## Tagline (140 characters max)

Jira tells you forty tickets look like yours. It never tells you who to ask. This app does, and shows the receipt.

## Category

Apps for Software Teams.

## Long description

**The problem.** When something breaks, Jira is good at finding tickets that look like yours. It is
bad at telling you who fixed them. Skill matrices record what people say they can do. What you want
is what people already did, and that evidence is already in Jira: who was the assignee when the
issue was resolved, who wrote the comment explaining the fix, who moved it to Done.

**What it does.** Open an issue and a panel names up to three people who have solved that kind of
problem, each with the issue key, the date, and the kind of work they did there. Create an issue and
a comment arrives with the previous fix and who to ask. Ask the Rovo agent the same question in chat
and it answers with the same keys. The same two actions are exposed as MCP tools, so other clients
can ask it too.

The same receipts are also read as a risk: when one person's evidence covers every matched issue,
the panel and the radar comment both say `Single owner: … holds every receipt (5 of 5)`. It needs at
least two matched issues and 100 % coverage, so it stops firing the moment a second person owns one
of the matches — the seeded corpus's known skew turned into a finding instead of hidden. A
**Draft the ask** button under the top name writes the message you would actually send — the person,
the issue you are on, the issue that proves it, the date and the fix — and puts it on the clipboard,
or on screen as selectable text where the clipboard is blocked. It never comments, assigns or
transitions anything: it is a copy-paste, not an automation.

**The receipts rule.** Three kinds of evidence, all read from Jira: `resolved` (assignee at
resolution), `diagnosed` (author of the fix comment), `wrote up` (who performed the resolution
transition). Ranked by distinct issues, then how many kinds a person covers. A name without an
issue key is never printed. When nothing matches, the panel says so and states what it searched:
"No receipts: nothing resolved looks like this ticket."

**How it decides.** Token ranking pulls the 25 most recent resolved issues in the project. A Forge
LLM judge (`claude-haiku-4-5`) reads the top five and decides which ones are actually the same
failure mode. When the model call or the parse fails, the token ranking stands and the card still
renders, so the judge improves quality without becoming a dependency.

**What it measures.** Ten hand-written paraphrase pairs across four failure families, plus
three unrelated controls, all created as real issues on a live site. The radar comment named the
true match in the top three 10 times out of 10, and stayed silent on all three controls. That is
the deployed path: trigger, judge, comment. The unit suite covers 39 cases with no network,
including the panel's card path against canned Jira JSON.

**What it does not do.** Teamwork Graph needs EAP and an Atlassian support allowlist, which puts it
outside a six-week schedule, so the Jira-native evidence above is what ships. Bulk operations,
dashboards and caching are deliberately absent: at demo volume a cache causes more failures than it
prevents. There is no Marketplace listing either; this runs as a development deployment.

**How it uses Forge.** A Custom UI issue panel with a resolver, a product trigger that comments as
the app, the Forge LLM API for judging, two actions shared by Rovo and MCP, a `rovo:agent` with a
`rovo:skill` that tells the agent when to call which action and how to read the receipts. Scopes
are `read:jira-work` and `write:jira-work`. The only write in the code is the single radar comment.

**What leaves Jira.** The judge sends the new issue's text and the top five candidate summaries to
Forge LLMs. Nothing else leaves the site, and the app stores nothing.

**Limits.** The demo corpus is synthetic: 27 resolved incidents across redis pools, bad
deploys, disk full and expired auth tokens, seeded with a script that ships in the repo. The seeded
issues were closed through the API, so the "wrote up" kind points at the same account on all of
them; on a real project that field spreads across the team. The MCP surface needs one admin toggle
per site before a client can connect.

## Tracks

- **Apps for Software Teams** (category)
- **MCP**: yes. Two tools over `rovo:mcp`, one admin toggle, then any MCP client.
- **Agents**: yes. A Rovo agent answers "who should I ask about MOBL-122?" and cites issue keys.
- **Teamwork Graph**: no. EAP plus an allowlist put it outside the schedule.
- **Marketplace**: no. Not pursued for this submission.

## Video

`TBD` (public YouTube, under 5 minutes). Shows the panel on a real issue including the single-owner
line and a drafted message, the radar comment arriving on a newly created ticket, the Rovo agent
answering with cited keys, and the same question from an MCP client outside Atlassian.

## Try it

- Repo: `https://github.com/KuosmTE/oncall-memory` — **private today**. Flip it public before
  submitting or judges get a 404; the code is the strongest part of this entry.
- Demo site: `https://one-atlas-boys.atlassian.net`, project MOBL, issue **MOBL-122**. The panel
  shows three people with labelled receipts, the `Single owner: …` line and the **Draft the ask**
  button. Ask for access and I will add you, since a Forge development install cannot be installed
  by a stranger from a link.
- Fresh-install check: install on a second site, open an issue with no history, confirm the panel
  renders the empty state instead of a blank frame.

## Submission checklist

- [ ] Tagline pasted, under 140 characters
- [ ] Long description pasted
- [ ] Category: Apps for Software Teams
- [ ] Tracks: MCP and Agents claimed, TWG and Marketplace left alone
- [x] The single-owner badge + draft sentence is in the description above (v4.6.0, deployed and
      proven — keep it only while the panel still prints both)
- [ ] Video URL (public, unlisted check done in week 4)
- [ ] Repo flipped from private to public (checked 2026-11-06: still private)
- [ ] Demo site access path written down (request by email or Discord) — one of the three options in
      `DEMO.md` → Weekend run book, "One decision is still yours"
- [ ] Submitted before 2026-12-20 22:00 EET
