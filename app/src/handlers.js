// Forge handlers: the only file that does I/O. Everything decidable lives in engine.js.
//
// IDENTITY MATTERS: a product trigger runs as the APP, not as a user. `api.asUser()`
// is unavailable in that context (Forge docs, product events), so every read here
// takes a mode and the trigger passes "app". Getting this wrong fails silently.

import api, { route } from "@forge/api";
import { confidence, rankCandidates, rankPeople, toJqlText } from "./engine.js";

const FIELDS = ["summary", "description", "resolution", "resolutiondate", "assignee", "comment", "status"];
const KEY_RE = /^[A-Z][A-Z0-9_]*-[0-9]+$/;

function client(mode) {
  return mode === "app" ? api.asApp() : api.asUser();
}

function adfToText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join(" ");
  return [node.text, ...(node.content || []).map(adfToText)].filter(Boolean).join(" ");
}

/** The last non-empty comment on a resolved issue is the closest thing to "how it was fixed". */
function lastFixOf(issue) {
  const comments = issue.fields?.comment?.comments || [];
  for (let i = comments.length - 1; i >= 0; i--) {
    const text = adfToText(comments[i].body).replace(/\s+/g, " ").trim();
    if (text) return text.length > 240 ? `${text.slice(0, 237)}…` : text;
  }
  return null;
}

async function search(jql, mode, max = 25) {
  const res = await client(mode).requestJira(
    route`/rest/api/3/search/jql?jql=${jql}&maxResults=${max}&fields=${FIELDS.join(",")}`
  );
  if (!res.ok) {
    // Log the upstream body; never hand Jira internals to a user-facing surface.
    console.error(`JQL ${res.status}: ${(await res.text()).slice(0, 300)} :: ${jql}`);
    throw new Error(`Jira search failed (${res.status})`);
  }
  return (await res.json()).issues || [];
}

async function issueContext(issueKey, mode) {
  if (!KEY_RE.test(issueKey)) throw new Error(`Not an issue key: ${issueKey}`);
  const res = await client(mode).requestJira(
    route`/rest/api/3/issue/${issueKey}?fields=summary,description,project`
  );
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
    lastFix: lastFixOf(issue),
    resolution: issue.fields?.resolution?.name || null,
    // "assignee at resolution" — we can cite the current assignee, not who clicked Done.
    resolvedBy: issue.fields?.assignee?.displayName || null,
    resolvedAt: issue.fields?.resolutiondate || null,
    status: issue.fields?.status?.name || null,
  };
}

/**
 * The single engine call behind both front doors: one search, one ranking, both answers.
 * Returns { items, people, confidence, note } — never a bare name, never a bare claim.
 */
export async function buildCard({ issueKey, text } = {}, mode = "user") {
  let query = text || "";
  let projectKey = null;

  if (issueKey) {
    const ctx = await issueContext(issueKey, mode);
    projectKey = ctx.projectKey;
    query = `${ctx.summary} ${ctx.description}`;
  }
  const words = toJqlText(query);
  if (!words) {
    return { items: [], people: [], confidence: "low", note: "Nothing to search on." };
  }

  const scope = projectKey ? `project = "${projectKey}" AND ` : "";
  const notSelf = issueKey && KEY_RE.test(issueKey) ? ` AND key != "${issueKey}"` : "";
  const jql = `${scope}text ~ "${words}" AND statusCategory = Done${notSelf} ORDER BY resolved DESC`;

  const issues = await search(jql, mode);
  const items = rankCandidates(words, issues.map(toCandidate), 5);

  const byPerson = new Map();
  for (const m of items) {
    if (!m.resolvedBy) continue; // "unassigned" is not a person
    const row = byPerson.get(m.resolvedBy) || { person: m.resolvedBy, resolved: [], lastResolved: null };
    row.resolved.push(m.key);
    if (m.resolvedAt && (!row.lastResolved || m.resolvedAt > row.lastResolved)) row.lastResolved = m.resolvedAt;
    byPerson.set(m.resolvedBy, row);
  }

  return {
    items,
    people: rankPeople([...byPerson.values()], 3),
    confidence: confidence(items),
    note: items.length
      ? `Checked the ${issues.length} most recent resolved matches in this project.`
      : `No similar resolved issues among the ${issues.length} most recent matches in this project.`,
  };
}

/** Action: who-knows. People with receipts, ranked by evidence. */
export async function whoKnows(payload) {
  const card = await buildCard({ issueKey: payload?.issueKey, text: payload?.text }, "user");
  return { items: card.people, confidence: card.confidence, note: card.note };
}

/** Action: has-happened-before. The same card, the fixes half. */
export async function memoryCard(payload) {
  const card = await buildCard({ issueKey: payload?.issueKey, text: payload?.text }, "user");
  return { items: card.items, confidence: card.confidence, note: card.note };
}

/** ADF for the radar comment: the fixes, the fix line, and who did them. */
function commentBody(card) {
  const bullets = card.items.slice(0, 3).map((i) => ({
    type: "listItem",
    content: [{
      type: "paragraph",
      content: [{
        type: "text",
        text: `${i.key} — ${i.summary}${i.resolvedBy ? ` — fixed by ${i.resolvedBy}` : ""}${i.lastFix ? `: ${i.lastFix}` : ""}`,
      }],
    }],
  }));

  const people = card.people.length
    ? [`Ask: ${card.people.map((p) => `${p.person} (${p.receipts.join(", ")})`).join(" · ")}`]
    : [];

  return {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [{ type: "text", text: "On-Call Memory — this looks like it has happened before:" }] },
      { type: "bulletList", content: bullets },
      ...(people.length ? [{ type: "paragraph", content: [{ type: "text", text: people[0] }] }] : []),
    ],
  };
}

/**
 * Trigger: avi:jira:created:issue. Reads and comments as the app; posts at most one
 * comment, only when the evidence is real; logs and gives up rather than throwing into
 * a silent void. Platform delivery can lag up to 3 minutes.
 */
export async function onIssueCreated(event) {
  const key = event?.issue?.key;
  if (!key || !KEY_RE.test(key)) return;

  try {
    const card = await buildCard({ issueKey: key }, "app");
    if (!card.items.length) return;

    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${key}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody(card) }),
    });
    if (!res.ok) console.error(`Comment failed on ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    // A radar that fails loudly in the log beats one that fails as silence.
    console.error(`radar ${key}: ${e.message}`);
  }
}
