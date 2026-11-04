import test from "node:test";
import assert from "node:assert/strict";
import { confidence, rankCandidates, rankPeople, toJqlText, tokens, verdict } from "../src/engine.js";

// Fixtures mirror the real failure: many issues mention "timeout", three are the same bug.
const candidates = [
  { key: "OPS-101", summary: "Checkout latency after deploy: redis pool exhausted", description: "connect timeout to redis", lastFix: "raised pool size to 200" },
  { key: "OPS-102", summary: "Checkout timeouts during peak", description: "same redis connection pool exhaustion as before", lastFix: null },
  { key: "OPS-103", summary: "Printer on 3rd floor offline", description: "toner", lastFix: null },
  { key: "OPS-104", summary: "Redis connection pool exhausted in checkout", description: "pool timeout", lastFix: "fix: pool 200 + alert" },
];

test("finds the same-problem issues and drops the unrelated one", () => {
  const out = rankCandidates("checkout timing out, redis pool exhausted", candidates);
  assert.ok(out.length >= 2, "expected at least two matches");
  assert.ok(!out.some((c) => c.key === "OPS-103"), "printer issue must not match");
  assert.ok(out.slice(0, 3).some((c) => c.key === "OPS-101" || c.key === "OPS-104"));
});

test("the fix comment is searchable and survives to the result", () => {
  const [hit] = rankCandidates("pool size 200", candidates);
  assert.equal(hit.key, "OPS-101");
  assert.match(hit.lastFix, /pool size to 200/);
});

test("unrelated query returns nothing (silence beats a confident guess)", () => {
  assert.deepEqual(rankCandidates("quarterly budget forecast spreadsheet", candidates), []);
});

test("respects limit and orders by score", () => {
  const out = rankCandidates("redis pool exhausted checkout", candidates, 2);
  assert.equal(out.length, 2);
  assert.ok(out[0].score >= out[1].score);
});

test("every hit carries its receipts", () => {
  const [first] = rankCandidates("redis pool exhausted", candidates);
  assert.ok(first.matched.length > 0);
  assert.ok(first.key);
});

test("empty query is silent", () => {
  assert.deepEqual(rankCandidates("", candidates), []);
  assert.deepEqual(rankCandidates("the and of", candidates), []);
});

// --- trust boundary: the tokenizer charset is the only sanitiser -----------------
// If someone "simplifies" toJqlText, these must fail before a deploy can ship it.
test("hostile issue titles cannot escape the quoted JQL phrase", () => {
  const hostile = [
    'OPS-1" OR project = SECRET ORDER BY created',
    'x") OR (text ~ "password',
    'timeout") OR (text ~ "secret',
    'a\\" OR 1=1 --',
    "OPS-1 AND status = Done OR text ~ 'x'",
  ];
  for (const input of hostile) {
    const out = toJqlText(input);
    // What matters is not what words survive (they sit INSIDE the quoted phrase and are
    // literal text there) — it is that nothing can close the phrase or start an operator.
    assert.ok(!/["'\\(){}=*~]/.test(out), `phrase-breaking char survived: ${JSON.stringify(out)}`);
    assert.ok(out === "" || /^[a-z0-9._ -]+$/.test(out), `unexpected charset: ${JSON.stringify(out)}`);
  }
});

test("jql text keeps at most the configured token budget", () => {
  const out = toJqlText("one two three four five six seven eight nine ten", 8);
  assert.equal(out.split(" ").length, 8);
});

// --- people ---------------------------------------------------------------------
test("people are ranked by evidence, receipts attached", () => {
  const people = rankPeople([
    { person: "Anna", resolved: ["OPS-101", "OPS-104"], lastResolved: "2026-09-02" },
    { person: "Mikko", resolved: ["OPS-102"], lastResolved: "2026-10-30" },
    { person: "Nobody", resolved: [] },
  ]);
  assert.equal(people[0].person, "Anna");
  assert.equal(people.length, 2, "person with no receipts is dropped");
  assert.deepEqual(people[0].receipts, ["OPS-101", "OPS-104"]);
});

test("a nameless row is never rendered as a person", () => {
  assert.deepEqual(rankPeople([{ person: null, resolved: ["OPS-1"] }]), []);
  assert.deepEqual(rankPeople([{ person: "", resolved: ["OPS-1"] }]), []);
});

// --- labels ---------------------------------------------------------------------
test("confidence never reports high on a single weak hit", () => {
  assert.equal(confidence([]), "low");
  assert.equal(confidence([{ matched: ["a", "b", "c"], score: 0.5 }]), "medium");
  assert.equal(confidence([{ matched: ["a", "b", "c"], score: 0.5 }, { matched: ["a"], score: 0.2 }]), "high");
});

test("verdict states the receipt rule, including when there is nothing", () => {
  assert.match(verdict([], []), /^No receipts/);
  assert.equal(verdict([{ key: "A" }, { key: "B" }], [{ person: "A" }]), "2 past fixes · 1 person who did them");
  assert.equal(verdict([{ key: "A" }], []), "1 past fix");
});

test("tokenizer drops stopwords and short noise", () => {
  assert.deepEqual(tokens("The Redis pool is exhausted!"), ["redis", "pool", "exhausted"]);
});
