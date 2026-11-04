// Stand-in for @forge/llm outside Forge: there is no model credential on this box, so the
// judge takes its documented fallback (token ranking stands) and says so in the log.
export async function chat() {
  throw new Error("no LLM outside Forge — probe runs on the token-ranking fallback");
}
