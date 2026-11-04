// Custom UI panel. Plain DOM, no framework: the resolver already shaped the data.
import { invoke } from "@forge/bridge";

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
  // Receipts are links: the demo beat is "click the person, land on the issue that proves it".
  const links = (p.receipts || []).map((k) => issueLink(k));
  const line = h("span", { class: "why" });
  links.forEach((a, i) => {
    line.append(a);
    if (i < links.length - 1) line.append(document.createTextNode(" · "));
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
    app.append(section("Ask these people", data.people.map(peopleRow)));
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
