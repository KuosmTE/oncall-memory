// Resolver for the issue panel. One engine call, plain props out; the UI stays dumb.
import { buildCard } from "./handlers.js";
import { verdict } from "./engine.js";

export async function panelData(payload) {
  const issueKey =
    payload?.context?.extension?.issue?.key ||
    payload?.issueKey ||
    payload?.context?.extension?.issueKey;

  if (!issueKey) {
    return { ok: false, message: "Open an issue to use On-Call Memory." };
  }

  try {
    const card = await buildCard({ issueKey }, "user");
    return {
      ok: true,
      issueKey,
      verdict: verdict(card.items, card.people),
      confidence: card.confidence,
      fixes: card.items.map((i) => ({
        key: i.key,
        summary: i.summary,
        assignee: i.resolvedBy, // "assignee at resolution" — what we can actually cite
        resolvedAt: i.resolvedAt ? i.resolvedAt.slice(0, 10) : null,
        fix: i.lastFix,
        why: i.why || null,
        matched: (i.matched || []).slice(0, 5).join(", "),
      })),
      people: card.people.map((p) => ({
        person: p.person,
        receipts: p.receipts,
        lastResolved: p.lastResolved ? p.lastResolved.slice(0, 10) : null,
      })),
      note: card.note,
    };
  } catch (e) {
    console.error(`panel ${issueKey}: ${e.message}`);
    return { ok: false, message: "Couldn't reach Jira just now. Reopen the issue to retry." };
  }
}
