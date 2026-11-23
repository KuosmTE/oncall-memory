# On-Call Memory — privacy and data handling

Short version: the app stores nothing, and the only thing that leaves your Atlassian site is the text
of one issue plus up to five candidate summaries, sent to Atlassian's own Forge LLM API.

## What the app reads

- The issue the panel is open on: summary, description, project key.
- Jira search results: summary, description, resolution, resolution date, assignee, comments, status
  — read-only, under the `read:jira-work` scope. The panel scopes the search to the issue's own
  project; a free-text request from the actions or MCP searches the whole site.
- The changelog of up to five matched issues, to find the resolution transition.

## What leaves the site

- When the LLM judge runs, the app sends the new issue's text (up to 1,200 characters) and, for each
  of up to five candidates, the summary plus up to 400 characters of description, to Forge LLMs
  (`claude-haiku-4-5-20251001`). No user identifiers, no attachments, no other projects.
- If the model call or its parse fails, there is no retry and the token ranking answers instead.

## What is stored

Nothing. No Forge storage, no cache, no database, no analytics. Every panel open and every trigger
runs a fresh read.

## What is written to Jira

Exactly one comment, on a newly created issue, and only when a prior issue was judged to describe
the same problem. No assignments, no transitions, no field edits. The **Draft the ask** button writes
nothing to Jira: it copies text to the clipboard and shows it on screen as a fallback.

## Personal data

The app displays Atlassian display names that are already visible in the project it is installed in.
That is the product: evidence of who solved what. It does not profile people, score people, or export
anything.

## Contact

Open an issue at https://github.com/KuosmTE/oncall-memory/issues.
