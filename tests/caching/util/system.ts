/**
 * Build a `SystemModelMessage` carrying the run's system prompt plus
 * an Anthropic `cache_control: ephemeral` marker. Used by every
 * strategy that opts in to system-prompt caching, so the marker
 * shape is identical across strategies and changes to it propagate
 * everywhere by editing this one file.
 */

import type { SystemModelMessage } from "ai"


export function ephemeralSystem(systemPrompt: string): SystemModelMessage {
  return {
    role: "system",
    content: systemPrompt,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" } },
    },
  }
}
