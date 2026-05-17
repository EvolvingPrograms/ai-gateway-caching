/**
 * Strategy 8 — strategy 7 but with the VERBOSE toolkit.
 *
 * Same provider options, same hooks, same `trailingEphemeral(3)` +
 * `mirrorTrim()` — the only swap is `testTools` (verbose) instead of
 * `conciseTools`. Isolates how much of strategy 7's hit rate comes
 * from concise-tool sizing versus the rest of the technique stack.
 */

import { ToolLoopAgent } from "ai"
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic"

import {
  makeCountingPrepareStep,
  pinTailBreakpoint,
} from "@/src/breakpoints"
import type { ConversationStrategy } from "@/src/conversation"
import { testTools, type TestTools } from "@/src/tools"

import {
  CONTEXT_MANAGEMENT,
  MODEL,
  REASONING_OPTIONS,
  STOP_WHEN,
  ephemeralSystem,
  mirrorTrim,
  trailingEphemeral,
} from "@/tests/caching/util"


export function stratEightVerboseAllTechniques(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({
    inner: pinTailBreakpoint,
    systemHasEphemeral: true,
  })

  return {
    label:
      "8. verbose tools + per-step breakpoint + breakpoint chain + gateway auto + context mgmt + mirror-trim",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
      tools: testTools,
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
