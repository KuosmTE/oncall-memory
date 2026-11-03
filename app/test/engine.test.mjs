import test from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, rankPeople, tokens } from "../src/engine.js";

// Fixtures mirror the real failure: 40 issues mention "timeout", three are the same bug.
const candidates = [
  { key: "OPS-101", summary: "Checkout latency after deploy: redis pool exhausted", description: "connect timeout to redis", comments: ["raised pool size to 200"] },
  { key: "OPS-102", summary: "Checkout timeouts during peak", description: "same redis connection pool exhaustion as before", comments: [] },
  { key: "OPS-103", summary: "Printer on 3rd floor offline", description: "toner", comments: [] },
  { key: "OPS-104", summary: "Redis connection pool exhausted in checkout", description: "pool timeout", comments: ["fix: pool 200 + alert"] },
];

test("finds the same-problem issues and drops the unrelated one", () => {
  const out = rankCandidates("checkout timing out, redis pool exhausted", candidates);
  assert.ok(out.length >= 2, "expected at least two matches");
  assert.ok(!out.some((c) => c.key === "OPS-103"), "printer issue must not match");
  assert.ok(out.slice(0, 3).some((c) => c.key === "OPS-101" || c.key === "OPS-104"));
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

test("people are ranked by evidence, receipts attached", () => {
  const people = rankPeople([
    { person: "Anna", resolved: ["OPS-101", "OPS-104"], docs: ["884422"], lastActive: "2026-09-02" },
    { person: "Mikko", resolved: ["OPS-102"], docs: [], lastActive: "2026-10-30" },
    { person: "Nobody", resolved: [], docs: [] },
  ]);
  assert.equal(people[0].person, "Anna");
  assert.equal(people.length, 2, "person with no receipts is dropped");
  assert.deepEqual(people[0].receipts.resolved, ["OPS-101", "OPS-104"]);
});

test("tokenizer drops stopwords and short noise", () => {
  assert.deepEqual(tokens("The Redis pool is exhausted!"), ["redis", "pool", "exhausted"]);
});
