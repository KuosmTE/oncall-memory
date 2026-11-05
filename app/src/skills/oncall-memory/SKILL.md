---
name: oncall-memory
description: Find who on this Jira project has actually solved an issue's kind of problem, and which past issues prove it. Use when someone asks who to ask about an issue, who knows about a component, or whether a problem has happened before.
allowed-tools: who-knows has-happened-before
---

# On-call memory

Two read-only tools answer from resolved Jira history. Every name and every past
issue they return comes with the issue key that proves it; nothing is inferred
from job titles, teams or skill matrices.

## who-knows — the person question

Call `who-knows` with `issueKey` (the ticket the user is asking about, e.g.
`MOBL-122`). It returns:

```json
{
  "items": [
    {
      "person": "Ada Isadora",
      "kinds": ["resolved", "diagnosed"],
      "evidence": [
        { "kind": "resolved", "issueKey": "MOBL-75", "date": "2026-11-04" },
        { "kind": "diagnosed", "issueKey": "MOBL-75", "date": "2026-11-03" }
      ],
      "receipts": ["MOBL-75"],
      "lastResolved": "2026-11-04"
    }
  ],
  "confidence": "medium",
  "note": "Checked the 10 most recent resolved matches in this project."
}
```

`items` is ranked: more distinct issues first, then more kinds. Read `kind` as
the claim it is:

- `resolved` — they were the assignee when that issue was resolved.
- `diagnosed` — they wrote the comment that explains the fix.
- `wrote` — they performed the resolution transition in the changelog.

Answer with the people, best first, and cite their receipt keys as Jira links:
`Ada Isadora — resolved MOBL-75, diagnosed MOBL-75`. Say what the kind means in
plain words ("closed it", "wrote up the fix") rather than printing the enum.

## has-happened-before — the past-fix question

Call `has-happened-before` with either `issueKey` (an existing ticket) or `text`
(a free-text problem description — use this when the user describes a symptom
without a ticket). It returns the same search's fixed half:

```json
{
  "items": [
    {
      "key": "MOBL-61",
      "summary": "Redis pool exhausted after deploy",
      "lastFix": "Raised the pool max, timeouts stopped",
      "resolvedBy": "Ada Isadora",
      "wroteBy": "Max Taylor",
      "resolvedAt": "2026-11-04T10:05:00.000+0000",
      "why": "same failure mode and component"
    }
  ],
  "confidence": "medium",
  "note": "Checked the 10 most recent resolved matches in this project."
}
```

Use it when the user asks what the fix was, or wants the history rather than a
name. Lead with the fix, then who owned it and the key.

## Rules

1. **Never invent a person, a key or a fix.** Only names in `items[].person`
   (or `resolvedBy` / `wroteBy`) may be mentioned; only keys in the output may
   be cited. No "probably", no "the team", no guessing from the description.
2. **Cite every claim.** A name without an issue key is not an answer. Format
   keys as links so the user can open the proof.
3. **Empty is a real answer.** When `items` is empty, say there are no receipts
   for this in the project and quote the `note` (it names what was searched).
   Offer `has-happened-before` with paraphrased text as the next step — do not
   fill the silence with a plausible name.
4. **One question, one call.** If the user asks both "has this happened" and
   "who should I ask", call both tools once each and merge the answer: the fix
   first, then the people with their receipts.
5. **Dates** are ISO (`2026-11-04`). Give the month and day in prose.
6. If a tool fails, say the lookup failed and that Jira could not be read. Do
   not retry more than once and never substitute your own knowledge of people.
