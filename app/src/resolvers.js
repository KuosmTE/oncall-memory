// Resolver for the issue panel. One engine call, plain props out; the UI stays dumb.
import { buildCard } from "./handlers.js";
import { askDraft, bestReceipt, verdict } from "./engine.js";

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
    // P6a: the badge reads the same receipts as risk; the draft is the message for the top person.
    const receipt = card.people[0] ? bestReceipt(card.people[0], card.items) : null;
    const draft = receipt && card.subject?.key
      ? askDraft({
        key: card.subject.key,
        summary: card.subject.summary,
        person: card.people[0].person,
        receiptKey: receipt.receiptKey,
        receiptDate: receipt.receiptDate ? receipt.receiptDate.slice(0, 10) : null,
        fix: receipt.fix,
        receiptKind: receipt.receiptKind,
      })
      : null;

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
        // Each receipt keeps its kind: "resolved" / "diagnosed" / "wrote up" are different claims.
        evidence: p.evidence.map((e) => ({
          kind: e.kind,
          issueKey: e.issueKey,
          date: e.date ? e.date.slice(0, 10) : null,
        })),
        kinds: p.kinds,
        receipts: p.receipts, // plain keys, for callers that only want the links
        lastResolved: p.lastResolved ? p.lastResolved.slice(0, 10) : null,
        // P6b: { open, more } from the Teamwork Graph, or null when the graph gave no answer.
        open: p.open || null,
      })),
      singleOwner: card.singleOwner,
      draft,
      note: card.note,
    };
  } catch (e) {
    console.error(`panel ${issueKey}: ${e.message}`);
    return { ok: false, message: "Couldn't reach Jira just now. Reopen the issue to retry." };
  }
}
