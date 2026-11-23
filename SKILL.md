---
name: oncall-memory
description: Use when someone asks who to ask about a Jira problem, who knows about a component, or whether an issue has happened before. Calls the On-Call Memory MCP tools and answers with receipts.
---

# On-Call Memory (for third-party agents)

This skill is for agents outside Atlassian (Claude Code, Cursor, Hermes, any MCP client). It needs the
On-Call Memory MCP connection:

```
claude mcp add --transport http oncall https://mcp.atlassian.com/forge/d0c1b623-3512-4219-8760-0b15e2bd80b2
```

A site admin must enable the two tools once: Atlassian Admin → Apps → Sites → *your site* →
Connected apps → On-Call Memory → Tools.

## Tools

| Tool | Use it when | Input |
|---|---|---|
| `who-knows` | "Who should I ask about X?", "who knows about this component?" | `issueKey` (required) |
| `has-happened-before` | "Has this happened before?", "how was this fixed last time?" | `text` or `issueKey` |

## How to answer

1. Call the tool. Use `issueKey` when you have one — a real ticket gives a far better query than
   free text.
2. Lead with the names and their receipts, e.g. *"Cassi Owens (resolved MOBL-74), Teemu Kuosmanen
   (wrote up MOBL-70, MOBL-71)"*.
3. Say what was searched, using the tool's `note` field ("checked the 10 most recent resolved matches
   in this project").
4. If one person holds every receipt, say so — the tool reports it as a single owner.

## Rules

- Never name a person the tool did not return, and never cite an issue key the tool did not return.
- Do not infer seniority, expertise or availability from a name. The only claim you may make is the
  receipt: which issue, which kind of work, which date.
- If the tools return nothing, say there are no receipts and what was searched. An empty answer with a
  scope is worth more than a plausible guess.
- If you have no issue key, call `has-happened-before` with the user's text first, then pass a key it
  returned to `who-knows`. `who-knows` does not accept a free-text description.
