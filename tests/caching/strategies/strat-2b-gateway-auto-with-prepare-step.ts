/**
 * Strategy 2b — strategy 2 + `pinTailBreakpoint` via `prepareStep`.
 *
 * Same provider options as strategy 2; isolates whether adding a
 * per-step tail breakpoint *on top of* the gateway's auto marker
 * recovers any within-turn cache write that strategy 2 misses.
 */

import { ToolLoopAgent } from "ai"

import { makeCountingPrepareStep, pinTailBreakpoint } from "../../../src/breakpoints"
import type { ConversationStrategy } from "../../../src/conversation"
import { testTools, type TestTools } from "../../../src/tools"

import { MODEL, REASONING_OPTIONS, STOP_WHEN } from "../util"


export function stratStringGatewayAutoPlusPrepareStep(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({
    inner: pinTailBreakpoint,
    systemHasEphemeral: false,
  })

  return {
    label: "2b. instructions: STRING, gateway caching:'auto' + prepareStep",
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
