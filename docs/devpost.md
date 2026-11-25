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
a comment arrives with the previous fix, who to ask, and **the message already drafted** — the
comment is the next action, not a notification. Ask the Rovo agent the same question in chat
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

## How it meets the technology requirement

The app is a Forge app with eight module types: a Custom UI `jira:issuePanel` with a resolver, four
`function` handlers (panel, radar trigger, two actions), two `action` entries, a product `trigger` on
`avi:jira:created:issue`, a `rovo:agent` with a `rovo:skill`, a `rovo:mcp` exposing the two actions as
MCP tools, and the `llm` module for the judge. Everything runs on Forge (`nodejs24.x`), with no
external service: reads go through `@forge/api` as the user in the panel and as the app in the trigger,
and the only write is one comment created with `write:jira-work`.

## Tracks

- **Apps for Software Teams** (category)
- **Best Agents** — $1,500 bonus. The app ships `rovo:agent` `oncall-memory-agent` plus a reusable
  `rovo:skill`; the agent answers "who should I ask about this issue?" with cited keys.
- **Best app with Atlassian MCP** — $1,500 bonus. Two tools over `rovo:mcp` (`who-knows`,
  `has-happened-before`) plus a `SKILL.md` written for third-party agents.
- **Teamwork Graph** — not claimed as of 2026-11-23: the API entered Preview on 2026-10-15 and the
  app does not consume the graph yet (`docs/week-plan.md` §5 holds the 45-minute spike that decides it).
- **Marketplace published app** — not claimed: an app submitted for listing can no longer be shared
  through an installation link, and the installation link is a judging requirement.

One submission can win at most one Grand Prize and one Bonus Prize, so both bonus categories are
selected and the strongest one counts.

## Video

`TBD` — paste the URL here and into Devpost's **Video demo link**. Rules: public YouTube, ≤ 5 min;
unlisted does not count. Title, description and chapter times are drafted in `DEMO.md` → *Upload
copy*; correct the chapter times against the real cut before publishing, a chapter pointing at the
wrong beat is worse than none.

Shows the panel on a real issue including the single-owner line and a drafted message, the radar
comment arriving on a newly created ticket, the Rovo agent answering with cited keys, and the same
question from an MCP client outside Atlassian.

## Try it

- **Installation link for judges:** <https://developer.atlassian.com/console/install/d0c1b623-3512-4219-8760-0b15e2bd80b2?signature=AYABeC6w5VsCD1MQiaEXFAEsGfkAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBQDSyVvkl0DBHc9O6Pu52iAAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDMhNTQekLfpI28b1HAIBEIA7ekIBfFjEh198k9dCzzCMS5N5onSQhldAcDWzoZmCrV9ZwPoZhc01FdEuJ6%2BwLoLQ4HdvhOTHSFuhLXYAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgHq41yUIR268N5FuX6jNtVvAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQM1aZzZPO9G9VPNJWGAgEQgDvb2IKoLfnKj3P3q4pXeniaKAWK4UAe%2BOR16uA50RKnnCJBuaYqOTSye88PkKxhgfCuMrnfsHjWB8pMIAAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAVi2AV9NUJZ3IIqtaEtfD38AAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAwysmZPIAp8n6iPgAQCARCAO4jX8q9YMjJLeZpLMUlKi9nbFUU1WHAWh08xknTuIm0Rzx938dut%2F%2FASks2dirdydwb4P8dJLXGPWwV9AgAAAAAMAAAQAAAAAAAAAAAAAAAAANaNaJ2t0TDaLIrcQXNV1Jv%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADKtMXK1nlFmfAdo3%2FYXA15RkAV6OSwisIR87YWM%2FEFu6u8uZ6oySGoXWA4gY1yBZnMHxcy0u7XewkKRmfhOhAbrkug%3D&product=jira> (from the developer console → Distribution → Sharing;
  regenerating it invalidates the previous link). Two scopes, one comment, no external services.
- **Judge instructions:** [`JUDGES.md`](../JUDGES.md) — install, where the panel is, how to see the radar,
  the Rovo agent, the MCP setup, and what to expect.
- Repo: `https://github.com/KuosmTE/oncall-memory`.
- Demo site (optional): `https://one-atlas-boys.atlassian.net`, project MOBL, issue **MOBL-122**. The
  panel shows three people with labelled receipts, the `Single owner: …` line and the **Draft the ask**
  button. Access on request: comment on the submission with your Atlassian account email.
- Privacy: [`PRIVACY.md`](../PRIVACY.md) — nothing is stored; only the judged issue text leaves the site.
- Fresh-install check: install on a second site, open an issue with no history, confirm the panel
  renders the empty state instead of a blank frame.

## Submission checklist

- [ ] Tagline pasted, under 140 characters
- [ ] Long description pasted
- [ ] Category: Apps for Software Teams
- [ ] Bonus prizes: Best Agents **and** Best app with Atlassian MCP selected
- [x] The single-owner badge + draft sentence is in the description above (v4.6.0, deployed and
      proven — keep it only while the panel still prints both)
- [x] "How it meets the technology requirement" written (module list, scopes, no external service)
- [ ] Installation link generated and pasted (`docs/week-plan.md` §1); tested in incognito on a
      second site as its admin
- [ ] `JUDGES.md` linked from the submission as the testing instructions
- [ ] Video URL (public, unlisted check done in week 4)
- [ ] Chapter times in the description match the final cut (`DEMO.md` → Upload copy)
- [ ] Repo flipped from private to public (checked 2026-11-06: still private)
- [ ] Demo site access path written down ("comment with your Atlassian email")
- [ ] Submitted before 2026-12-15 (slack) / hard stop 2026-12-22 12:00 pm PT
