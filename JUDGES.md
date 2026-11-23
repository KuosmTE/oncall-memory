# On-Call Memory — judge instructions

This is the "instructions to get the app working in a judge's environment" the rules ask for. Expected
time: 2 minutes to install, 5 minutes to see everything.

## 1. Install

1. Open the installation link: `INSTALL_LINK` — regenerate it in the
   [developer console](https://developer.atlassian.com/console/myapps/d0c1b623-3512-4219-8760-0b15e2bd80b2)
   → Distribution if it has expired; the link is invalidated each time sharing is re-saved.
2. Sign in as a site admin of any Jira Cloud site you can install apps on. A free developer site works.
3. Approve the scopes: `read:jira-work`, `write:jira-work`. The app reads issues and writes exactly one
   comment (the radar) on a newly created issue.
4. The app uses the Forge LLM API, billed to the vendor's Developer Space — nothing is billed to your
   site. Approve the AI consent if your site prompts for it.

## 2. See the panel

Open any Jira issue that has history — resolved issues in the same project, with assignees and
comments — and look for **On-Call Memory** in the right-hand column, under the fields.

Expected: up to three people, each with `resolved` / `diagnosed` / `wrote up` receipts, an issue key
and a date. When one person's evidence covers every matched issue, a
`Single owner: … holds every receipt (n of n)` line appears, and a **Draft the ask** button sits under
the top person.

An issue with no matching history shows the empty state (what was searched, and that nothing matched).
That is the honest answer, not a broken panel.

## 3. See the radar

Create an issue in a project where similar issues were resolved before, with a summary that describes
the failure ("Checkout fails after the morning deploy"). The platform can lag up to three minutes.

Expected: one comment from the app, citing the previous issues with the person who resolved, diagnosed
or closed each, the people to ask with their receipts, and the single-owner line when it applies.

## 4. Ask it in chat

Jira → **Rovo** → agent switcher → **On-Call Memory** → "Who should I ask about PROJECT-123?"
Expected: names with issue keys, and a closing sentence about the scope of what was searched.

## 5. Use it from outside Atlassian

Needs a site admin for the toggle, once:

1. Admin → **Apps → Sites → your site → Connected apps → On-Call Memory → Tools**: enable both tools.
2. In any MCP client:

   ```
   claude mcp add --transport http oncall https://mcp.atlassian.com/forge/d0c1b623-3512-4219-8760-0b15e2bd80b2
   ```

3. Connect, approve OAuth, pick your site, then ask the same question. The two tools are `who-knows`
   and `has-happened-before`.

The app ships a `SKILL.md` for third-party agents that describes when to call which tool and how to
read the receipts.

## 6. What to expect, and what not to

- Nothing is stored; every answer is a fresh read of Jira.
- The radar comments once, on creation, and never edits, assigns or transitions anything.
- If the LLM judge is unavailable, token ranking answers instead and the card still renders — a
  fallback, not a failure.
- The public demo corpus is synthetic (27 seeded incidents); on your own project the answers are as
  good as your history, and every name carries a key you can click.

## Demo site (optional)

<https://one-atlas-boys.atlassian.net> → project **MOBL** → issue **MOBL-122** is the issue the video
opens. Access on request: comment on the Devpost submission with the Atlassian account email you will
use.
