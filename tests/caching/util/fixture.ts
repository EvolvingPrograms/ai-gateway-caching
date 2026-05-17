/**
 * Static fixture inputs shared by every strategy in this suite.
 *
 *   - `LONG_KNOWLEDGE` pads the system prompt above the 1024-token
 *     Anthropic cache-eligibility floor so EVERY run is cache-eligible.
 *   - `freshSystemPrompt()` returns the system text with a unique
 *     nonce per call, guaranteeing each strategy starts COLD against
 *     Anthropic's prompt cache (otherwise an earlier strategy's prefix
 *     would leak into the next one's measurements).
 *   - `USER_TURNS` is the 20-turn research conversation every strategy
 *     drives through, so cross-strategy comparisons are apples-to-apples.
 */


export const MODEL = "anthropic/claude-opus-4.7"


// Pad the system to ~2.5k tokens so we're well above Anthropic's
// 1024-token cache-eligibility floor.
const LONG_KNOWLEDGE = Array.from(
  { length: 220 },
  (_, i) =>
    `Note ${i + 1}: This is a synthetic knowledge-base paragraph used purely to push the system prompt past the Anthropic prompt-cache minimum so the test can observe a real cache hit. The content is intentionally repetitive and content-free.`,
).join("\n\n")


export function freshSystemPrompt(): string {
  const nonce = crypto.randomUUID()
  return [
    `[run-nonce ${nonce}]`,
    "You are a curt research assistant. Be brief — one or two short sentences per reply.",
    "You have three tools: `search_knowledge_base`, `fetch_document`, `list_recent_changes`. Use them aggressively — don't reason about knowledge-base contents without searching and fetching first.",
    "When the user asks you to research a topic, do at least one search and fetch the top 2 documents before answering.",
    "",
    "Below is a knowledge base for this run; ignore it unless the user explicitly references it.",
    "",
    LONG_KNOWLEDGE,
  ].join("\n")
}


// Long, research-heavy conversation: each turn asks for several
// fetches, so input grows past the `clear_tool_uses` trigger
// multiple times across the run and we can observe repeated
// context edits.
export const USER_TURNS = [
  "Research 'cache invalidation patterns' — search the KB, fetch the top 5 hits, and give me a 2-sentence synthesis pulling from all five.",
  "Now do the same workflow for 'rate limiting': search, fetch the top 5, synthesize.",
  "And once more for 'distributed locks': search, fetch the top 5, synthesize.",
  "Same workflow for 'consensus algorithms': search, fetch the top 5, synthesize.",
  "Same workflow for 'event sourcing': search, fetch the top 5, synthesize.",
  "Same workflow for 'circuit breakers': search, fetch the top 5, synthesize.",
  "Same workflow for 'message queues': search, fetch the top 5, synthesize.",
  "Same workflow for 'service mesh': search, fetch the top 5, synthesize.",
  "Same workflow for 'sharding strategies': search, fetch the top 5, synthesize.",
  "Same workflow for 'leader election': search, fetch the top 5, synthesize.",
  "Same workflow for 'eventual consistency': search, fetch the top 5, synthesize.",
  "Same workflow for 'CRDTs': search, fetch the top 5, synthesize.",
  "Same workflow for 'gossip protocols': search, fetch the top 5, synthesize.",
  "Same workflow for 'vector clocks': search, fetch the top 5, synthesize.",
  "Same workflow for 'bloom filters': search, fetch the top 5, synthesize.",
  "Same workflow for 'log-structured storage': search, fetch the top 5, synthesize.",
  "Same workflow for 'write-ahead logs': search, fetch the top 5, synthesize.",
  "Same workflow for 'two-phase commit': search, fetch the top 5, synthesize.",
  "List the 8 most recent knowledge-base changes, then pick the two most relevant to the topics we've covered and fetch their full documents.",
  "Recap every topic we explored today, in one sentence each, citing one source per topic.",
] as const
