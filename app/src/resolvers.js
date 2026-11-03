// Resolver for the issue panel. Returns plain props; the UI stays dumb.
import { memoryCard, whoKnows } from "./handlers.js";

export async function panelData(payload) {
  const issueKey =
    payload?.context?.extension?.issue?.key ||
    payload?.issueKey ||
    payload?.context?.extension?.issueKey;

  if (!issueKey) {
    return { ok: false, message: "Open an issue to use On-Call Memory." };
  }

  // Both queries share the same search; failures must degrade, never blank the panel.
  try {
    const [card, people] = await Promise.all([memoryCard({ issueKey }), whoKnows({ issueKey })]);
    return {
      ok: true,
      issueKey,
      fixes: card.items.map((i) => ({
        key: i.key,
        summary: i.summary,
        resolvedBy: i.resolvedBy || "unassigned",
        matched: (i.matched || []).slice(0, 4).join(", "),
      })),
      people: people.items.map((p) => ({
        person: p.person,
        resolved: p.receipts.resolved.slice(0, 3).join(", "),
        lastActive: p.receipts.lastActive,
      })),
      note: card.note,
    };
  } catch (e) {
    return { ok: false, message: String(e.message || e).slice(0, 200) };
  }
}
