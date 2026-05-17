/**
 * Strategy 2 — `instructions: <string>` + `gateway.caching = "auto"`.
 *
 * Isolates the value of the gateway's server-side auto breakpoint
 * against the no-opt-in baseline (strategy 1). Same string-style
 * system prompt; the ONLY difference is the gateway flag.
 */

import { ToolLoopAgent } from "ai"

import { makeCountingPrepareStep } from "@/src/breakpoints"
import type { ConversationStrategy } from "@/src/conversation"
import { testTools, type TestTools } from "@/src/tools"

import { MODEL, REASONING_OPTIONS, STOP_WHEN } from "@/tests/caching/util"

export function stratStringGatewayAuto(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: false })

  return {
    label: "2. instructions: STRING, gateway caching:'auto'",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: systemPrompt,
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: {
        gateway: { caching: "auto" },
        anthropic: { ...REASONING_OPTIONS },
      },
    }),
    lastBreakpointCount: counter.lastCount,
  }
}
