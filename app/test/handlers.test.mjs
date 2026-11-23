// The card path (panel and radar both call buildCard) against canned Jira JSON.
// Why this file exists: nothing in `npm test` imported handlers.js, so v4.3.0 shipped
// `resultNote is not defined` with 24 tests green and a dead panel. One call here catches
// every "used but not imported" and every card-shape regression, without network.
import { registerHooks } from "node:module";
import assert from "node:assert/strict";
import test from "node:test";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@forge/api") {
      return { url: new URL("./fixtures/api.mjs", import.meta.url).href, shortCircuit: true };
    }
    if (specifier === "@forge/llm") {
      return { url: new URL("./fixtures/llm.mjs", import.meta.url).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

test("buildCard returns a card with a note and one receipt per evidence kind", async () => {
  const { buildCard } = await import("../src/handlers.js");

  const card = await buildCard({ issueKey: "Q-1" });

  assert.equal(card.items.length, 1);
  assert.equal(card.items[0].key, "Q-2");
  // The line under the card — this is the call that was undefined at HEAD.
  assert.equal(card.note, "Checked the 1 most recent resolved match in this project.");

  const people = Object.fromEntries(card.people.map((p) => [p.person, p]));
  assert.deepEqual(Object.keys(people).sort(), ["Ada Lovelace", "Grace Hopper", "Max Taylor"]);
  assert.deepEqual([...people["Ada Lovelace"].kinds], ["resolved"]);
  assert.deepEqual([...people["Grace Hopper"].kinds], ["diagnosed"]);
  assert.deepEqual([...people["Max Taylor"].kinds], ["wrote"]);
  // Every cited name must carry the key that proves it.
  for (const p of card.people) assert.ok(p.receipts.length > 0, `${p.person} has no receipt`);
  // P6a: the draft is built from the card's own subject — no second request for it.
  assert.deepEqual(card.subject, { key: "Q-1", summary: "Redis connection pool exhausted after deploy" });
  // P6b: no graph outside Forge, so the load is unknown (null) and the panel prints no line.
  for (const p of card.people) assert.equal(p.open, null, `${p.person} should have no load outside Forge`);
});

test("buildCard says 'nothing to search on' instead of querying an empty ticket", async () => {
  const { buildCard } = await import("../src/handlers.js");
  const card = await buildCard({});
  assert.deepEqual(card.items, []);
  assert.equal(card.note, "Nothing to search on.");
});
