/**
 * Strategy 9 — like strategy 8, but WE own every cache_control
 * marker and deliberately sit at exactly the 4-breakpoint Anthropic
 * cap:
 *
 *   1.   system (ephemeral)
 *   2-3. last 2 history messages (via `trailingEphemeral(2)`)
 *   4.   tail of the current step (via `pinTailBreakpoint`)
 *
 * Differences vs strategy 8:
 *   - `gateway: { caching: "auto" }` is REMOVED so the gateway can't
 *     add a 5th server-side marker that competes with ours and
 *     forces the API to silently drop one of our markers.
 *   - `trailingEphemeral(2)` (not 3) so the total stays at exactly
 *     4 even with the per-step tail pin.
 *
 * Hypothesis: post-edit "write" collapse in strategy 8 is caused by
 * the tail-pin marker being the one dropped when we exceed the cap.
 * If true, this strategy should keep healthy per-step writes after
 * each `clear_tool_uses` edit.
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

export function stratNineManualBreakpoints(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({
    inner: pinTailBreakpoint,
    systemHasEphemeral: true,
  })

  return {
    label:
      "9. verbose tools + manual 4-bp budget (system + last-2 history + tail-pin) + context mgmt + mirror-trim, NO gateway auto",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: {
        anthropic: {
          ...REASONING_OPTIONS,
          contextManagement: CONTEXT_MANAGEMENT,
        } satisfies AnthropicLanguageModelOptions,
      },
    }),
    lastBreakpointCount: counter.lastCount,
    transform: trailingEphemeral(2),
    afterTurn: mirrorTrim(),
  }
}
