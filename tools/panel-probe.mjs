// Run the REAL panel resolver against the REAL Jira site, and print its JSON.
// Forge has no `invoke` command and the panel lives behind a site login, so this is how the
// panel output gets inspected off-camera: same resolvers.js, same handlers.js, same Jira REST,
// with @forge/api and @forge/llm replaced by tools/forge-shim/*. The LLM judge therefore takes
// its documented fallback (token ranking stands) — the deploy-time radar path is where the real
// judge runs.
//
// Usage: node tools/panel-probe.mjs MOBL-69
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

const issueKey = process.argv[2];
if (!issueKey) {
  console.error("usage: node tools/panel-probe.mjs <ISSUE-KEY>");
  process.exit(1);
}

const { panelData } = await import(path.join(here, "..", "app", "src", "resolvers.js"));
const data = await panelData({ issueKey });
console.log(JSON.stringify(data, null, 2));
