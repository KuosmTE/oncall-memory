import test from "node:test";
import assert from "node:assert/strict";
import { applyJudgement, confidence, contentText, jqlTextClause, judgeMessages, KIND_LABEL, parseJudgement, rankCandidates, rankPeople, receiptText, receiptsText, toJqlText, tokens, verdict } from "../src/engine.js";

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

// --- three labelled evidence kinds (P4#2) ---------------------------------------
// One issue can prove three different things about three different people, and the
// panel is only honest if it says which thing each receipt proves.
const ev = (kind, issueKey, date = null) => ({ kind, issueKey, date });

test("one issue can carry all three kinds, each counted once", () => {
  const [p] = rankPeople([
    {
      person: "Anna",
      evidence: [
        ev("resolved", "OPS-101", "2026-10-01"),
        ev("diagnosed", "OPS-101", "2026-09-30"),
        ev("wrote", "OPS-101", "2026-10-02"),
        ev("wrote", "OPS-101", "2026-10-02"), // duplicate (person, issue, kind)
      ],
    },
  ]);
  assert.deepEqual(p.kinds, ["resolved", "diagnosed", "wrote"]);
  assert.equal(p.evidence.length, 3, "the duplicate receipt is dropped");
  assert.equal(p.score, 1, "score counts distinct issues, not receipts");
  assert.deepEqual(p.receipts, ["OPS-101"]);
});

test("rank is distinct issues first, then number of kinds, then name", () => {
  const people = rankPeople([
    { person: "Zoe", evidence: [ev("resolved", "A-1"), ev("resolved", "A-2")] },
    {
      person: "Anna",
      evidence: [ev("resolved", "B-1"), ev("diagnosed", "B-1"), ev("wrote", "B-1"), ev("resolved", "B-2")],
    },
    { person: "Mikko", evidence: [ev("resolved", "C-1"), ev("diagnosed", "C-1"), ev("wrote", "C-1")] },
  ]);
  assert.deepEqual(people.map((p) => p.person), ["Anna", "Zoe", "Mikko"]);
  assert.equal(people[0].score, 2);
  assert.equal(people[2].score, 1);
});

test("a person known only from a diagnosis is still cited", () => {
  const people = rankPeople([{ person: "Sanna", evidence: [ev("diagnosed", "OPS-7", "2026-09-01")] }]);
  assert.equal(people.length, 1, "any evidence kind is a receipt");
  assert.deepEqual(people[0].kinds, ["diagnosed"]);
  assert.equal(people[0].lastResolved, null, "no resolution, no resolved date");
});

test("unknown kinds do not become claims", () => {
  assert.deepEqual(rankPeople([{ person: "Ghost", evidence: [ev("rumoured", "OPS-1")] }]), []);
  assert.deepEqual(rankPeople([{ person: "Nobody", evidence: [] }]), []);
  assert.equal(receiptText({ kind: "rumoured", issueKey: "OPS-1" }), "");
});

test("receipts print their label, newest first", () => {
  const [p] = rankPeople([
    {
      person: "Anna",
      evidence: [ev("resolved", "OPS-1", "2026-09-01"), ev("wrote", "OPS-9", "2026-10-30"), ev("diagnosed", "OPS-5")],
    },
  ]);
  assert.equal(p.evidence[0].issueKey, "OPS-9");
  assert.equal(receiptText(p.evidence[0]), "wrote up — OPS-9");
  assert.equal(receiptsText(p), "wrote up — OPS-9 · resolved — OPS-1 · diagnosed — OPS-5");
  assert.equal(KIND_LABEL.wrote, "wrote up", "the panel and the radar comment share one label table");
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

// The bug this guards: `text ~ "a b c"` is a phrase, so a summary's tokens matched nothing.
test("jql clause ORs tokens instead of building one phrase", () => {
  assert.equal(
    jqlTextClause("redis pool exhausted"),
    'text ~ "redis" OR text ~ "pool" OR text ~ "exhausted"'
  );
  assert.equal(jqlTextClause(""), "");
});

// --- judge (P4) ------------------------------------------------------------------
test("judge prompt carries the query and every candidate, and demands JSON", () => {
  const msgs = judgeMessages("redis pool exhausted", [
    { key: "A-1", summary: "one", description: "d1" },
    { key: "A-2", summary: "two", description: "d2" },
  ]);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, "system");
  assert.match(msgs[0].content, /JSON/);
  assert.match(msgs[1].content, /redis pool exhausted/);
  assert.match(msgs[1].content, /A-1/);
  assert.match(msgs[1].content, /A-2/);
});

test("a fenced or chatty judgement is still parsed; garbage yields null", () => {
  const clean = parseJudgement('{"verdicts":[{"key":"A-1","same":true,"why":"same pool"}]}');
  assert.deepEqual(clean, [{ key: "A-1", same: true, why: "same pool" }]);

  const chatty = parseJudgement('Sure! ```json\n{"verdicts":[{"key":"B-2","same":false,"why":"different component"}]}\n``` done');
  assert.deepEqual(chatty, [{ key: "B-2", same: false, why: "different component" }]);

  assert.equal(parseJudgement("no json here"), null);
  assert.equal(parseJudgement(""), null);
  assert.equal(parseJudgement('{"verdicts": "nope"}'), null);
});

test("judged-different items are dropped, unknown items keep their place", () => {
  const items = [{ key: "A-1", score: 0.9 }, { key: "A-2", score: 0.5 }];
  const kept = applyJudgement(items, [
    { key: "A-1", same: false, why: "different" },
    { key: "A-2", same: true, why: "same pool" },
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].key, "A-2");
  assert.equal(kept[0].why, "same pool");

  // No verdict for A-1 => token ranking stands (fallback path).
  assert.deepEqual(applyJudgement(items, []), items);
  assert.equal(applyJudgement(items, null), items);
});

// Regression: the SDK returns content as ContentPart[], and JSON.stringify on it produced
// escaped text that no parser could read — the judge silently fell back on every call.
test("contentText reads both the string and the content-part shapes", () => {
  assert.equal(contentText("plain"), "plain");
  assert.equal(contentText([{ type: "text", text: "a" }, { type: "text", text: "b" }]), "ab");
  assert.equal(contentText([{ type: "text", text: '{"verdicts":[]}' }]), '{"verdicts":[]}');
  assert.equal(contentText(null), "");
  assert.equal(contentText(undefined), "");
});
