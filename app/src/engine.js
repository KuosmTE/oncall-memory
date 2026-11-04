// Pure logic: ranking, query text, confidence, the verdict line. No Forge, no network.
// Everything here is unit-tested; src/handlers.js only does I/O.

const STOP = new Set(
  "the a an and or of for to in on with is was were be been it this that from at as by not no you your we our when then there here".split(" ")
);

export function tokens(text) {
  return (text || "")
    .toLowerCase()
    .split(/[^a-z0-9._-]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/**
 * Text → the value that goes inside a quoted JQL `text ~ "…"`.
 * SECURITY: the tokenizer charset ([a-z0-9._-]) is the sanitiser — it cannot emit a
 * quote, a backslash or a JQL operator, so nothing here can close the quoted phrase.
 * Do not widen the charset; tests/engine.test.mjs holds the hostile-title table.
 */
export function toJqlText(text, limit = 8) {
  return tokens(text).slice(0, limit).join(" ");
}

/**
 * JQL `text ~ "a b c"` is a PHRASE query — it only matches those words adjacent, which for
 * tokens pulled out of a ticket summary matches nothing. What we want is a dumb OR over the
 * tokens; rankCandidates does the real judging. Tokens are already charset-sanitised by tokens().
 */
export function jqlTextClause(words) {
  return words
    .split(" ")
    .filter(Boolean)
    .map((w) => `text ~ "${w}"`)
    .join(" OR ");
}

/**
 * Re-rank Jira search hits against the query they were searched for.
 * JQL `text ~` is a dumb OR; this decides which hits actually describe the same problem.
 * ponytail: token overlap, not embeddings. Upgrade path = Forge LLM judge on the top 5.
 */
export function rankCandidates(query, candidates, limit = 5) {
  const q = new Set(tokens(query));
  if (q.size === 0) return [];

  return candidates
    .map((c) => {
      const text = [c.summary, c.description, c.lastFix].filter(Boolean).join(" ");
      const t = new Set(tokens(text));
      let hits = 0;
      const matched = [];
      for (const w of q) if (t.has(w)) { hits++; matched.push(w); }
      const score = hits ? hits / Math.sqrt(q.size * Math.max(t.size, 1)) : 0;
      return { ...c, score: Number(score.toFixed(3)), matched };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || String(a.key).localeCompare(String(b.key)))
    .slice(0, limit);
}

/**
 * Rank people by evidence, not by title. Every row carries its receipts.
 *
 * Three evidence kinds exist, and each one proves a different thing:
 *   resolved  — assignee on a matched resolved issue (all we could cite before)
 *   diagnosed — author of the fix comment we already fetch for lastFix
 *   wrote     — actor of the resolution transition in the issue changelog (who closed it)
 *
 * Input rows: { person, evidence: [{ kind, issueKey, date }] }, or the older
 * { person, resolved: [key], lastResolved } shape (treated as "resolved" receipts).
 * Dedupe by (person, issueKey, kind); rank by number of distinct issues, then by how many
 * kinds the person covers, then by name. A name with no receipt is dropped: it is a guess.
 */
export const EVIDENCE_KINDS = ["resolved", "diagnosed", "wrote"];
export const KIND_LABEL = { resolved: "resolved", diagnosed: "diagnosed", wrote: "wrote up" };

/** One receipt, as the panel and the radar comment both print it: "wrote up — OPS-12". */
export function receiptText(e) {
  const label = KIND_LABEL[e?.kind];
  return label && e?.issueKey ? `${label} — ${e.issueKey}` : "";
}

/** All of a person's receipts on one line, newest first. */
export function receiptsText(person) {
  return (person?.evidence || []).map(receiptText).filter(Boolean).join(" · ");
}

/** Newest receipt first; receipts without a date go last. Deterministic, so tests can pin it. */
function byRecency(a, b) {
  return (
    String(b.date || "").localeCompare(String(a.date || "")) ||
    String(a.issueKey).localeCompare(String(b.issueKey)) ||
    EVIDENCE_KINDS.indexOf(a.kind) - EVIDENCE_KINDS.indexOf(b.kind)
  );
}

export function rankPeople(rows, limit = 3) {
  const people = new Map();

  for (const row of rows || []) {
    // "unassigned" is a state, not a person, and a nameless row is never a receipt.
    if (!row?.person || /^unassigned$/i.test(row.person)) continue;

    const events = [...(row.evidence || [])];
    for (const key of row.resolved || []) {
      events.push({ kind: "resolved", issueKey: key, date: row.lastResolved || null });
    }

    for (const e of events) {
      if (!KIND_LABEL[e?.kind] || !e.issueKey) continue; // a kind we cannot prove is not a claim
      const p = people.get(row.person) || {
        person: row.person,
        seen: new Set(),
        evidence: [],
        kinds: new Set(),
        issues: new Set(),
        lastResolved: null,
      };
      const id = `${e.kind}|${e.issueKey}`;
      if (p.seen.has(id)) continue;
      p.seen.add(id);
      p.evidence.push({ kind: e.kind, issueKey: e.issueKey, date: e.date || null });
      p.kinds.add(e.kind);
      p.issues.add(e.issueKey);
      if (e.kind === "resolved" && e.date && (!p.lastResolved || e.date > p.lastResolved)) {
        p.lastResolved = e.date;
      }
      people.set(row.person, p);
    }
  }

  return [...people.values()]
    .map((p) => ({
      person: p.person,
      score: p.issues.size,
      kinds: EVIDENCE_KINDS.filter((k) => p.kinds.has(k)),
      receipts: [...p.issues],
      evidence: p.evidence.slice().sort(byRecency),
      lastResolved: p.lastResolved,
    }))
    .sort((a, b) => b.score - a.score || b.kinds.length - a.kinds.length || a.person.localeCompare(b.person))
    .slice(0, limit);
}

/** Confidence from the shape of the result, not a magic score threshold. */
export function confidence(matches) {
  if (!matches.length) return "low";
  if (matches.length >= 2 && matches[0].matched.length >= 3) return "high";
  return "medium";
}

/** The one line that makes the claim readable in five seconds. */
export function verdict(fixes, people) {
  if (!fixes.length && !people.length) {
    return "No receipts: nothing resolved looks like this ticket.";
  }
  const parts = [];
  if (fixes.length) parts.push(`${fixes.length} past fix${fixes.length === 1 ? "" : "es"}`);
  if (people.length) parts.push(`${people.length} ${people.length === 1 ? "person" : "people"} who did them`);
  return parts.join(" · ");
}

// --- judge (P4) ------------------------------------------------------------------
// The model call lives in handlers.js; the prompt and the parsing live here so they are
// testable without network. A judge that cannot be parsed must fall back, never invent.

/** Messages for "is this the same problem?" over the top candidates. */
export function judgeMessages(query, items) {
  const candidates = items.map((c, i) => ({
    n: i + 1,
    key: c.key,
    summary: c.summary,
    text: (c.description || "").slice(0, 400),
  }));
  return [
    {
      role: "system",
      content:
        "You judge whether Jira issues describe the SAME underlying problem, not merely the same words. " +
        'Reply with JSON only: {"verdicts":[{"key":"ABC-1","same":true,"why":"no more than 15 words"}]}. ' +
        "Use same=true only when the failure mode AND the affected component match; a shared word like redis, " +
        "timeout or deploy is not enough. Judge every candidate given.",
    },
    {
      role: "user",
      content: `NEW ISSUE:\n${String(query).slice(0, 1200)}\n\nCANDIDATES:\n${JSON.stringify(candidates)}`,
    },
  ];
}

/** @forge/llm content is string | ContentPart[]; the text lives in the parts, not in JSON. */
export function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === "string" ? p : p?.text || "")).join("");
  }
  return "";
}

/** Tolerant parse: models wrap JSON in prose or fences. null = unusable, caller falls back. */
export function parseJudgement(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const data = JSON.parse(text.slice(start, end + 1));
    const list = Array.isArray(data) ? data : data.verdicts;
    if (!Array.isArray(list)) return null;
    return list
      .filter((v) => v && typeof v.key === "string")
      .map((v) => ({ key: v.key, same: v.same === true, why: String(v.why || "").slice(0, 160) }));
  } catch {
    return null;
  }
}

/** Annotate ranked items with the verdict; drop the ones the judge says are different. */
export function applyJudgement(items, verdicts) {
  if (!verdicts || !verdicts.length) return items;
  const byKey = new Map(verdicts.map((v) => [v.key, v]));
  return items
    .map((i) => {
      const v = byKey.get(i.key);
      return v ? { ...i, same: v.same, why: v.why } : i;
    })
    .filter((i) => i.same !== false);
}

/**
 * The line under the card. The empty state is the most-screenshotted thing in the demo,
 * so "among the 0 most recent matches" is not allowed to exist.
 */
export function resultNote(items, scanned) {
  if (items.length) return `Checked the ${scanned} most recent resolved match${scanned === 1 ? "" : "es"} in this project.`;
  if (scanned === 0) return "No resolved issue in this project shares vocabulary with this ticket.";
  return `Checked the ${scanned} most recent resolved matches — none looked like this.`;
}
