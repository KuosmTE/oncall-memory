// Forge handlers: thin I/O glue around the pure engine in engine.js.
// Everything decidable lives in engine.js and is unit-tested there; this file only
// talks to Jira and shapes the result.

import api, { route } from "@forge/api";
import { rankCandidates, rankPeople, tokens } from "./engine.js";

const FIELDS = ["summary", "description", "resolution", "resolutiondate", "assignee", "updated"];

function adfToText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join(" ");
  return [node.text, ...(node.content || []).map(adfToText)].filter(Boolean).join(" ");
}

function jqlText(text) {
  // Quoted JQL values must not contain raw quotes.
  return tokens(text).slice(0, 8).join(" ").replace(/["\\]/g, "");
}

async function search(jql, max = 25) {
  const res = await api.asUser().requestJira(
    route`/rest/api/3/search/jql?jql=${jql}&maxResults=${max}&fields=${FIELDS.join(",")}`
  );
  if (!res.ok) throw new Error(`JQL failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).issues || [];
}

async function issueContext(issueKey) {
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?fields=summary,description,project`);
  if (!res.ok) throw new Error(`Issue ${issueKey} unreadable (${res.status})`);
  const data = await res.json();
  return {
    key: data.key,
    projectKey: data.fields?.project?.key,
    summary: data.fields?.summary || "",
    description: adfToText(data.fields?.description),
  };
}

function toCandidate(issue) {
  return {
    key: issue.key,
    summary: issue.fields?.summary || "",
    description: adfToText(issue.fields?.description),
    resolution: issue.fields?.resolution?.name || null,
    resolvedBy: issue.fields?.assignee?.displayName || null,
    resolvedAt: issue.fields?.resolutiondate || null,
    status: issue.fields?.status?.name || null,
  };
}

/**
 * Action: who-knows. Returns people with receipts, never a bare name.
 * ponytail: Jira-native evidence (resolved-issue assignees) only — the Teamwork Graph
 * variant is an upgrade, this is the fallback that must always work (SPEC §7).
 */
export async function whoKnows(payload) {
  const issueKey = payload?.issueKey;
  if (!issueKey) return { items: [], confidence: "low", note: "No issue key supplied." };

  const ctx = await issueContext(issueKey);
  const words = jqlText(`${ctx.summary} ${ctx.description}`);
  if (!words) return { items: [], confidence: "low", note: "Issue has too little text to search on." };

  const jql = `project = "${ctx.projectKey}" AND text ~ "${words}" AND statusCategory = Done ORDER BY resolved DESC`;
  const issues = await search(jql);
  const matches = rankCandidates(words, issues.map(toCandidate), 8);

  const byPerson = new Map();
  for (const m of matches) {
    const name = m.resolvedBy || "unassigned";
    const row = byPerson.get(name) || { person: name, resolved: [], docs: [], lastActive: null };
    row.resolved.push(m.key);
    if (m.resolvedAt && (!row.lastActive || m.resolvedAt > row.lastActive)) row.lastActive = m.resolvedAt;
    byPerson.set(name, row);
  }

  const items = rankPeople([...byPerson.values()], 3);
  return {
    items,
    confidence: items.length ? "medium" : "low",
    note: items.length
      ? `${matches.length} past issues looked like this one.`
      : "No past resolver found — say so instead of guessing.",
  };
}

/**
 * Action: has-happened-before / panel card. Same engine, different front door.
 */
export async function memoryCard(payload) {
  const issueKey = payload?.issueKey;
  let query = payload?.text || "";
  let projectKey = null;

  if (issueKey) {
    const ctx = await issueContext(issueKey);
    projectKey = ctx.projectKey;
    query = `${ctx.summary} ${ctx.description}`;
  }
  const words = jqlText(query);
  if (!words) return { items: [], confidence: "low", note: "Nothing to search on." };

  const scope = projectKey ? `project = "${projectKey}" AND` : "";
  const alsoOpen = issueKey ? ` AND key != "${issueKey}"` : "";
  const jql = `${scope} text ~ "${words}" AND statusCategory = Done${alsoOpen} ORDER BY resolved DESC`;

  const issues = await search(jql);
  const items = rankCandidates(words, issues.map(toCandidate), 5);
  return {
    items,
    confidence: items.length ? (items[0].score > 0.35 ? "high" : "medium") : "low",
    note: items.length ? "Ranked by text overlap with the query." : "Nothing similar was ever resolved here.",
  };
}

/** ADF for the radar comment. One paragraph, one bullet list, no decoration. */
function commentBody(items) {
  return {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [{ type: "text", text: "On-Call Memory — this looks like it has happened before:" }] },
      {
        type: "bulletList",
        content: items.map((i) => ({
          type: "listItem",
          content: [{
            type: "paragraph",
            content: [{
              type: "text",
              text: `${i.key} — ${i.summary}${i.resolvedBy ? ` (resolved by ${i.resolvedBy})` : ""}`,
            }],
          }],
        })),
      },
    ],
  };
}

/**
 * Trigger: avi:jira:created:issue. Posts at most one comment, and only when the evidence
 * is real. Platform delivery can lag up to 3 minutes — the copy never claims "instantly".
 */
export async function onIssueCreated(event) {
  const key = event?.issue?.key;
  if (!key) return;

  const card = await memoryCard({ issueKey: key });
  if (!card.items.length) return;

  const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: commentBody(card.items.slice(0, 3)) }),
  });
  if (!res.ok) throw new Error(`Comment failed on ${key} (${res.status})`);
}
