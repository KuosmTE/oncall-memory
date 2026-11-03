// Pure ranking logic. No Forge, no network, no dependencies. Testable with `node --test`.

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
 * Re-rank Jira search hits against the query they were searched for.
 * JQL `text ~` is a dumb OR; this decides which hits actually look like the same problem.
 * ponytail: token overlap, not embeddings. Upgrade path = Forge LLM judge on the top 5.
 */
export function rankCandidates(query, candidates, limit = 5) {
  const q = new Set(tokens(query));
  if (q.size === 0) return [];

  return candidates
    .map((c) => {
      const text = [c.summary, c.description, ...(c.comments || [])].join(" ");
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
 * Rank people by evidence, not by title. Every output row carries its receipts.
 * evidence: [{ person, resolved: [issueKey], docs: [pageId], lastActive: ISO date }]
 */
export function rankPeople(evidence, limit = 3) {
  return evidence
    .map((e) => ({
      person: e.person,
      score: (e.resolved || []).length * 2 + (e.docs || []).length,
      receipts: {
        resolved: e.resolved || [],
        docs: e.docs || [],
        lastActive: e.lastActive || null,
      },
    }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.person.localeCompare(b.person))
    .slice(0, limit);
}
