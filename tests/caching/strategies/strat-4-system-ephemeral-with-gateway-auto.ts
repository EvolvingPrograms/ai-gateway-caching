/**
 * Strategy 4 — strategy 3 + `gateway.caching = "auto"`.
 *
 * Both a manual ephemeral on the system message AND the gateway's
 * auto-marker. Tests whether the two compose or fight.
 */

import { ToolLoopAgent } from "ai"

import { makeCountingPrepareStep } from "../../../src/breakpoints"
import type { ConversationStrategy } from "../../../src/conversation"
import { testTools, type TestTools } from "../../../src/tools"

import { MODEL, REASONING_OPTIONS, STOP_WHEN, ephemeralSystem } from "../util"


export function stratSystemMessageEphemeralPlusGatewayAuto(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: true })

  return {
    label: "4. SystemModelMessage ephemeral + gateway caching:'auto'",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
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
