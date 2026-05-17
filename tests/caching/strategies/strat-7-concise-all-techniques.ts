/**
 * Strategy 7 — everything turned on, with the CONCISE toolkit.
 *
 *   - `conciseTools` so each typical tool result is small
 *   - `pinTailBreakpoint` per step so within-turn tails write cache
 *   - `trailingEphemeral(3)` so the rolling 4-breakpoint window stays
 *     anchored
 *   - gateway `caching: "auto"` + `CONTEXT_MANAGEMENT`
 *   - `mirrorTrim()` so our local prefix tracks server-side clears
 *
 * Goal: land above 90% overall cache hit rate even across the long
 * 20-turn conversation.
 */

import { ToolLoopAgent } from "ai"
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic"

import {
  makeCountingPrepareStep,
  pinTailBreakpoint,
} from "@/src/breakpoints"
import type { ConversationStrategy } from "@/src/conversation"
import { conciseTools, type ConciseTools } from "@/src/tools"

import {
  CONTEXT_MANAGEMENT,
  MODEL,
  REASONING_OPTIONS,
  STOP_WHEN,
  ephemeralSystem,
  mirrorTrim,
  trailingEphemeral,
} from "@/tests/caching/util"

export function stratSevenAllTechniques(
  systemPrompt: string,
): ConversationStrategy<ConciseTools> {
  const counter = makeCountingPrepareStep({
    inner: pinTailBreakpoint,
    systemHasEphemeral: true,
  })

  return {
    label:
      "7. all techniques: concise tools + per-step breakpoint + breakpoint chain + gateway auto + context mgmt + mirror-trim",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
      tools: conciseTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: {
        gateway: { caching: "auto" },
        anthropic: {
          ...REASONING_OPTIONS,
          contextManagement: CONTEXT_MANAGEMENT,
        } satisfies AnthropicLanguageModelOptions,
      },
    }),
    lastBreakpointCount: counter.lastCount,
    transform: trailingEphemeral(3),
    afterTurn: mirrorTrim(),
  }
}
