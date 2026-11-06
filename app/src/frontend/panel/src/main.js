// Custom UI panel. Plain DOM, no framework: the resolver already shaped the data.
import { invoke } from "@forge/bridge";
import { KIND_LABEL } from "../../../engine.js";

const app = document.getElementById("app");

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (k === "class") node.className = v;
    else if (k === "href") node.href = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c?.nodeType ? c : document.createTextNode(String(c)));
  return node;
}

const issueLink = (key) =>
  h("a", { class: "key", href: `/browse/${key}`, target: "_blank", rel: "noopener" }, key);

function section(title, rows) {
  return h("section", {}, h("h2", {}, title), ...rows);
}

function peopleRow(p) {
  // Receipts are labelled links: "wrote up — MOBL-61". The label is the whole point — a name
  // without the kind of evidence is a guess dressed as a receipt. Two lines: name, receipts.
  const evidence = p.evidence?.length
    ? p.evidence
    : (p.receipts || []).map((k) => ({ kind: "resolved", issueKey: k }));
  const line = h("span", { class: "why" });
  evidence.forEach((e, i) => {
    line.append(h("span", { class: "kind" }, KIND_LABEL[e.kind] || e.kind));
    line.append(document.createTextNode(" — "));
    line.append(issueLink(e.issueKey));
    if (i < evidence.length - 1) line.append(document.createTextNode(" · "));
  });
  if (p.lastResolved) line.append(document.createTextNode(` · last resolved ${p.lastResolved}`));

  return h("div", { class: "row" }, h("span", { class: "name" }, p.person), line);
}

function fixRow(f) {
  const detail = [
    f.why || null,
    f.fix ? `fix: ${f.fix}` : null,
  ].filter(Boolean).join(" · ");
  return h(
    "div",
    { class: "row" },
    issueLink(f.key),
    h("span", { class: "what" }, f.summary),
    h("span", { class: "why" }, detail || `${f.assignee || "no assignee recorded"}${f.resolvedAt ? ` · resolved ${f.resolvedAt}` : ""}`)
  );
}

function draftBlock(text) {
  // The Custom UI iframe may refuse navigator.clipboard, so the block is revealed first and
  // the copy is a bonus. The fallback has to work on camera without any permission.
  const out = h("pre", { class: "drafttext", hidden: "hidden" }, text);
  const btn = h("button", { type: "button", class: "btn" }, "Draft the ask");
  btn.addEventListener("click", async () => {
    out.removeAttribute("hidden");
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Select the text below";
    }
  });
  return h("div", { class: "draft" }, btn, out);
}

function render(data) {
  app.replaceChildren();

  if (!data || !data.ok) {
    app.append(h("div", { class: "msg err" }, data?.message || "On-Call Memory could not load."));
    return;
  }

  // The claim, first: a judge should learn the rule before reading any row.
  app.append(
    h("div", { class: `verdict ${data.verdict.startsWith("No receipts") ? "empty" : ""}` },
      h("span", { class: "vtext" }, data.verdict),
      data.confidence ? h("span", { class: "conf" }, data.confidence) : null)
  );

  if (data.people?.length) {
    const rows = [];
    data.people.forEach((p, i) => {
      rows.push(peopleRow(p));
      if (i === 0 && data.draft) rows.push(draftBlock(data.draft)); // under the top person
    });
    if (data.singleOwner) rows.push(h("p", { class: "owner" }, data.singleOwner));
    app.append(section("Ask these people", rows));
  }

  app.append(
    section(
      "Happened before",
      data.fixes?.length ? data.fixes.map(fixRow) : [h("p", { class: "note" }, "Nothing to cite.")]
    )
  );

  if (data.note) app.append(h("p", { class: "note" }, data.note));
}

invoke("panelData")
  .then(render)
  .catch((e) => render({ ok: false, message: String(e?.message || e) }));
