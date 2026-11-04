// Minimal stand-in for @forge/api, for running the real handlers/resolvers outside Forge.
// It speaks the real Jira REST API with the JIRA_* credentials from .env, so a probe exercises
// the same code path the panel does — the only thing faked is the runtime plumbing.
import fs from "node:fs";
import path from "node:path";

const ROOT = "/opt/workspace/codegeist";

function loadEnv(file = path.join(ROOT, ".env")) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const BASE = String(env.JIRA_BASE || "").replace(/\/$/, "");
const AUTH = `Basic ${Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64")}`;

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
