// The judge is unavailable in unit tests: handlers must fall back to token ranking, not fail.
export async function chat() {
  throw new Error("no LLM in tests");
}
