// Forge handlers: the only file that does I/O. Everything decidable lives in engine.js.
//
// IDENTITY MATTERS: a product trigger runs as the APP, not as a user. `api.asUser()`
// is unavailable in that context (Forge docs, product events), so every read here
// takes a mode and the trigger passes "app". Getting this wrong fails silently.

import api, { route } from "@forge/api";
import { chat } from "@forge/llm";
import {
  applyJudgement,
  busFactor,
  busFactorText,
  confidence,
  contentText,
  jqlTextClause,
  judgeMessages,
  parseJudgement,
  rankCandidates,
  rankPeople,
  receiptsText,
  resultNote,
  toJqlText,
} from "./engine.js";

// Haiku: cheapest active Forge LLM tier — this is a yes/no with a one-line reason, not reasoning.
const JUDGE_MODEL = "claude-haiku-4-5-20251001";

// Our own radar comment is not a diagnosis, and the app is not a person: both are recognisable.
const RADAR_MARKER = "On-Call Memory — this looks like it has happened before";

/** A Jira user is a receipt; an app (including this one) or a customer is not. */
function isPerson(user) {
  if (!user?.displayName) return false;
  if (user.accountType && user.accountType !== "atlassian") return false;
  return !/^unassigned$/i.test(user.displayName);
}

/**
 * Ask the model which candidates are really the same problem.
 * ponytail: no 30-min cache yet — a demo issue costs ~1c and a cache is a failure mode of its own.
 * Add Forge storage TTL caching when the panel is opened at real volume.
 * On ANY failure the token ranking stands: a judge that breaks must not break the product.
 */
async function judge(query, items) {
  if (!items.length) return items;
  try {
    const res = await chat({ model: JUDGE_MODEL, messages: judgeMessages(query, items) });
    const text = contentText(res?.choices?.[0]?.message?.content);
    const verdicts = parseJudgement(text);
    if (!verdicts) {
      console.error(`judge unparsable: ${text.slice(0, 200)}`);
      return items;
    }
    return applyJudgement(items, verdicts);
  } catch (e) {
    console.error(`judge failed, token ranking stands: ${e.message}`);
    return items;
  }
}

const FIELDS = ["summary", "description", "resolution", "resolutiondate", "assignee", "comment", "status"];
const MAX_MATCHES = 5; // also caps the per-issue changelog fetches
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

/**
 * The last non-empty comment written by a person is the closest thing to "how it was fixed".
 * Its author is the second evidence kind: they diagnosed it. This is the same fetch we already
 * made for `lastFix`, so the extra kind costs no request.
 */
function lastFixOf(issue) {
  const comments = issue.fields?.comment?.comments || [];
  for (let i = comments.length - 1; i >= 0; i--) {
    const text = adfToText(comments[i].body).replace(/\s+/g, " ").trim();
    if (!text || text.startsWith(RADAR_MARKER)) continue; // our own comment is not a diagnosis
    return {
      text: text.length > 240 ? `${text.slice(0, 237)}…` : text,
      author: isPerson(comments[i].author) ? comments[i].author.displayName : null,
      created: comments[i].created || null,
    };
  }
  return { text: null, author: null, created: null };
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
  const fix = lastFixOf(issue);
  return {
    key: issue.key,
    summary: issue.fields?.summary || "",
    description: adfToText(issue.fields?.description),
    lastFix: fix.text,
    // Evidence kind 2 — the person who wrote the fix comment down (no extra request).
    diagnosedBy: fix.author,
    diagnosedAt: fix.created,
    resolution: issue.fields?.resolution?.name || null,
    // Evidence kind 1 — "assignee at resolution": who owns it, not who clicked Done.
    resolvedBy: isPerson(issue.fields?.assignee) ? issue.fields.assignee.displayName : null,
    resolvedAt: issue.fields?.resolutiondate || null,
    status: issue.fields?.status?.name || null,
  };
}

/**
 * Evidence kind 3 — who actually closed it, from the issue changelog's resolution transition.
 * Fetched per matched issue because `expand=changelog` on the search call measured 2.9x the
 * payload (49 KB → 142 KB for 25 issues); only the ≤5 surviving matches are worth that.
 * A failure here loses one kind for one issue; it never fails the card.
 */
async function closer(issueKey, mode) {
  try {
    const res = await client(mode).requestJira(
      route`/rest/api/3/issue/${issueKey}?expand=changelog&fields=resolution`
    );
    if (!res.ok) {
      console.error(`changelog ${issueKey}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    let hit = null;
    for (const h of data?.changelog?.histories || []) {
      for (const item of h.items || []) {
        if (item.field !== "resolution") continue;
        // A cleared resolution means it was reopened: the earlier transition no longer counts.
        hit = item.toString && isPerson(h.author) ? { actor: h.author.displayName, date: h.created || null } : null;
      }
    }
    return hit;
  } catch (e) {
    console.error(`changelog ${issueKey}: ${e.message}`);
    return null;
  }
}

/**
 * The single engine call behind both front doors: one search, one ranking, both answers.
 * Returns { items, people, confidence, note } — never a bare name, never a bare claim.
 */
export async function buildCard({ issueKey, text } = {}, mode = "user") {
  let query = text || "";
  let projectKey = null;
  // The card's own subject: the draft needs the query key and summary, and fetching them
  // again would be a second request for data this call already read.
  let subject = { key: null, summary: text || "" };

  if (issueKey) {
    const ctx = await issueContext(issueKey, mode);
    projectKey = ctx.projectKey;
    query = `${ctx.summary} ${ctx.description}`;
    subject = { key: issueKey, summary: ctx.summary };
  }
  const words = toJqlText(query);
  if (!words) {
    return { subject, items: [], people: [], confidence: "low", note: "Nothing to search on." };
  }

  const scope = projectKey ? `project = "${projectKey}" AND ` : "";
  const notSelf = issueKey && KEY_RE.test(issueKey) ? ` AND key != "${issueKey}"` : "";
  const jql = `${scope}(${jqlTextClause(words)}) AND statusCategory = Done${notSelf} ORDER BY resolved DESC`;

  const issues = await search(jql, mode);
  // Judge BEFORE people: a person is only cited for an issue the judge confirmed is the same problem.
  const ranked = await judge(query, rankCandidates(words, issues.map(toCandidate), MAX_MATCHES));
  // Who closed each match (evidence kind 3). Only the surviving matches, in parallel, ≤5 requests.
  const closers = await Promise.all(ranked.map((m) => closer(m.key, mode)));
  const items = ranked.map((m, i) => ({ ...m, wroteBy: closers[i]?.actor || null, wroteAt: closers[i]?.date || null }));

  // One row per person, one receipt per (kind, issue). A kind we cannot prove is simply absent.
  const add = (rows, person, kind, issueKey, date) => {
    if (!person || !issueKey) return;
    const row = rows.get(person) || { person, evidence: [] };
    row.evidence.push({ kind, issueKey, date: date || null });
    rows.set(person, row);
  };
  const byPerson = new Map();
  for (const m of items) {
    add(byPerson, m.resolvedBy, "resolved", m.key, m.resolvedAt);
    add(byPerson, m.diagnosedBy, "diagnosed", m.key, m.diagnosedAt);
    add(byPerson, m.wroteBy, "wrote", m.key, m.wroteAt);
  }

  const rows = [...byPerson.values()];
  const people = rankPeople(rows, 3);
  // P6a: the badge is a claim about *every* receipt holder, so it is computed from all rows —
  // ranking truncation to three must not hide a fourth person who holds one of the keys.
  const singleOwner = busFactorText(busFactor(items, rankPeople(rows, rows.length)));

  return {
    subject,
    items,
    people,
    singleOwner,
    confidence: confidence(items),
    note: resultNote(items, issues.length, Boolean(projectKey)),
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

/** ADF for the radar comment: the fixes, who owns / closed them, who to ask, and the risk line. */
function commentBody(card) {
  const bullets = card.items.slice(0, 3).map((i) => ({
    type: "listItem",
    content: [{
      type: "paragraph",
      content: [{
        type: "text",
        text: `${i.key} — ${i.summary}${i.why ? ` — ${i.why}` : ""}${i.resolvedBy ? ` — assignee ${i.resolvedBy}` : ""}${i.wroteBy && i.wroteBy !== i.resolvedBy ? ` — closed by ${i.wroteBy}` : ""}${i.lastFix ? `: ${i.lastFix}` : ""}`,
      }],
    }],
  }));

  const people = card.people.length
    ? [`Ask: ${card.people.map((p) => `${p.person} (${receiptsText(p)})`).join(" · ")}`]
    : [];
  // P6a: only when the badge exists — a sentence that fires on every issue would be noise.
  const owner = card.singleOwner;

  return {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [{ type: "text", text: "On-Call Memory — this looks like it has happened before:" }] },
      { type: "bulletList", content: bullets },
      ...(people.length ? [{ type: "paragraph", content: [{ type: "text", text: people[0] }] }] : []),
      ...(owner ? [{ type: "paragraph", content: [{ type: "text", text: owner }] }] : []),
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
  // One line at entry: without it, "no comment" cannot be told apart from "never invoked".
  console.log(`radar entry: ${event?.eventType || "no-eventType"} ${key || "no-key"}`);
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
