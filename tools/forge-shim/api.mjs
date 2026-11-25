// Minimal stand-in for @forge/api, for running the real handlers/resolvers outside Forge.
// It speaks the real Jira REST API with the JIRA_* credentials from .env, so a probe exercises
// the same code path the panel does — the only thing faked is the runtime plumbing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Repo root is two levels up from tools/forge-shim/. It must resolve from any checkout — the
// hardcoded server path made the probe and the preflight unusable on a laptop.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadEnv(file = path.join(ROOT, ".env")) {
  const env = {};
  if (!fs.existsSync(file)) return env; // no .env here: fall back to the real environment
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const cfg = (key) => process.env[key] || env[key] || "";
const missing = ["JIRA_BASE", "JIRA_EMAIL", "JIRA_API_TOKEN"].filter((k) => !cfg(k));
if (missing.length) {
  throw new Error(
    `Missing ${missing.join(", ")}: put them in ${path.join(ROOT, ".env")} (cp from the server, chmod 600) ` +
      "or export them in the shell."
  );
}
const BASE = String(cfg("JIRA_BASE")).replace(/\/$/, "");
const AUTH = `Basic ${Buffer.from(`${cfg("JIRA_EMAIL")}:${cfg("JIRA_API_TOKEN")}`).toString("base64")}`;

/** Forge's route tag concatenates; it does not encode. Mirrored exactly. */
export function route(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? String(values[i]) : ""), "");
}

async function requestJira(url, options = {}) {
  const res = await fetch(BASE + url, {
    method: options.method || "GET",
    headers: { Authorization: AUTH, Accept: "application/json", ...(options.headers || {}) },
    body: options.body,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, json: async () => JSON.parse(text), text: async () => text };
}

const client = { requestJira };
const api = { asApp: () => client, asUser: () => client, fetch };

export default api;
