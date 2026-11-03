// Custom UI panel. Plain DOM, no framework: the resolver already shaped the data.
import { invoke } from "@forge/bridge";

const app = document.getElementById("app");

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "href") node.href = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c?.nodeType ? c : document.createTextNode(String(c)));
  return node;
}

function section(title, rows) {
  return h("section", {}, h("h2", {}, title), ...rows);
}

function render(data) {
  app.replaceChildren();

  if (!data || !data.ok) {
    app.append(h("div", { class: "msg err" }, data?.message || "On-Call Memory could not load."));
    return;
  }

  if (data.people?.length) {
    app.append(
      section(
        "Ask these people",
        data.people.map((p) =>
          h("div", { class: "row" },
            h("span", { class: "name" }, p.person),
            h("span", { class: "why" }, p.resolved + (p.lastActive ? ` · last active ${p.lastActive.slice(0, 10)}` : ""))
          )
        )
      )
    );
  }

  if (data.fixes?.length) {
    app.append(
      section(
        "Happened before",
        data.fixes.map((f) =>
          h("div", { class: "row" },
            h("a", { class: "key", href: `/browse/${f.key}`, target: "_blank", rel: "noopener" }, f.key),
            h("span", { class: "why" }, `${f.summary} — ${f.resolvedBy}`)
          )
        )
      )
    );
  } else {
    app.append(section("Happened before", [h("p", { class: "note" }, "Nothing similar was ever resolved here.")]));
  }

  if (data.note) app.append(h("p", { class: "note" }, data.note));
}

invoke("panelData")
  .then(render)
  .catch((e) => render({ ok: false, message: String(e?.message || e) }));
