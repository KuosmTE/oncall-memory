// One command to answer "is the demo still true?" before the camera rolls.
//
// It runs the REAL panel resolver against the REAL Jira site (same shim as
// tools/panel-probe.mjs) and asserts the facts the film script depends on:
// the badge exists on MOBL-122, the empty state still holds on MOBL-127, the seeded
// corpus is intact and clean, no eval batch is waiting to be swept, and neither demo
// issue was accidentally closed. Exit 1 if any of that is false, so a broken board
// stops the run before a take is wasted.
//
// Usage: node tools/demo-preflight.mjs
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@forge/api") {
      return { url: new URL("./forge-shim/api.mjs", import.meta.url).href, shortCircuit: true };
    }
    if (specifier === "@forge/llm") {
      return { url: new URL("./forge-shim/llm.mjs", import.meta.url).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const { panelData } = await import(path.join(here, "..", "app", "src", "resolvers.js"));
const { default: api, route } = await import(path.join(here, "forge-shim", "api.mjs"));

const RADAR = "this looks like it has happened before";
const DEMO = "MOBL-122";
const EMPTY = "MOBL-127";
const SEEDS = 27;

const rows = [];
const check = (name, ok, detail) => rows.push({ name, ok, detail });

async function jql(jqlText, fields, max = 100) {
  const res = await api.asUser().requestJira(
    route`/rest/api/3/search/jql?jql=${encodeURIComponent(jqlText)}&maxResults=${max}&fields=${fields}`
  );
  if (!res.ok) throw new Error(`JQL ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).issues || [];
}

// --- the two cards the film script opens -------------------------------------------
const demo = await panelData({ issueKey: DEMO });
const badge = demo.singleOwner || "";
const m = badge.match(/^Single owner: (.+) holds every receipt \((\d+) of \d+\)\.$/);
const top = demo.people?.[0];
const draft = demo.draft || "";
check(
  `panel ${DEMO} badge`,
  demo.ok && !!m && Number(m[2]) >= 2 && m[1] === top?.person,
  demo.ok ? badge || "(no badge — is the top person covering every receipt?)" : demo.message
);
check(
  `panel ${DEMO} draft`,
  !!draft &&
    draft.startsWith(`Hi ${top?.person} — ${DEMO} (`) &&
    (top?.evidence || []).some((e) => draft.includes(e.issueKey)) &&
    draft.endsWith("Could you take a look?"),
  draft || "(no draft — is there a top person with a receipt?)"
);

const empty = await panelData({ issueKey: EMPTY });
check(
  `panel ${EMPTY} empty state`,
  empty.ok && empty.people.length === 0 && !empty.singleOwner && !empty.draft &&
    String(empty.verdict).startsWith("No receipts"),
  `${empty.verdict} · people ${empty.people.length} · badge ${empty.singleOwner} · draft ${empty.draft}`
);

// --- the board behind the beats ----------------------------------------------------
const seeds = await jql('project = "MOBL" AND labels = oncall-seed', "summary,comment", SEEDS);
const dirty = seeds.filter((i) => JSON.stringify(i.fields?.comment || {}).includes(RADAR));
check(
  "seeded corpus",
  seeds.length === SEEDS && dirty.length === 0,
  `${seeds.length}/${SEEDS} incidents${dirty.length ? `, radar comments on ${dirty.map((i) => i.key).join(", ")}` : ", none carrying a radar comment"}`
);

const batch = await jql('project = "MOBL" AND labels = oncall-eval', "summary");
check(
  "eval batch",
  batch.length === 0,
  batch.length ? `${batch.length} fixture(s) to sweep before filming: ${batch.map((i) => i.key).join(", ")}` : "none — nothing to sweep"
);

const demoIssues = await jql(`project = "MOBL" AND key in (${DEMO}, ${EMPTY})`, "status");
const closed = demoIssues.filter((i) => i.fields?.status?.statusCategory?.key === "done");
check(
  "demo issues open",
  demoIssues.length === 2 && closed.length === 0,
  demoIssues.map((i) => `${i.key} ${i.fields.status.name}`).join(", ") || "missing"
);

// --- report -------------------------------------------------------------------------
console.log("demo preflight (panel path runs the token-ranking fallback, not the judge)\n");
for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(24)} ${r.detail}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - failed}/${rows.length} ${failed ? "FAIL — fix before filming" : "PASS — ready to film"}`);
process.exit(failed ? 1 : 0);
