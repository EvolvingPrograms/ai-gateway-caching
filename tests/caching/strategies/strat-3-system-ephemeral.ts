/**
 * Strategy 3 — `instructions: SystemModelMessage` with
 * `cache_control: ephemeral` set manually on the system message.
 *
 * No gateway opt-in. Isolates the value of placing the breakpoint
 * ourselves (vs letting the gateway add an auto one) for a static
 * system prefix.
 */

import { ToolLoopAgent } from "ai"

import { makeCountingPrepareStep } from "@/src/breakpoints"
import type { ConversationStrategy } from "@/src/conversation"
import { testTools, type TestTools } from "@/src/tools"

import { MODEL, REASONING_OPTIONS, STOP_WHEN, ephemeralSystem } from "@/tests/caching/util"

export function stratSystemMessageEphemeral(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: true })

  return {
    label: "3. instructions: SystemModelMessage + manual ephemeral",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: { anthropic: { ...REASONING_OPTIONS } },
    }),
    lastBreakpointCount: counter.lastCount,
  }
}
