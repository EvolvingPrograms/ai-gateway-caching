/**
 * Strategy 1 — baseline. `instructions: <string>`, no caching opt-in
 * of any kind. Establishes the unmodified cost / cache-rate floor
 * that every other strategy is measured against.
 */

import { ToolLoopAgent } from "ai"

import { makeCountingPrepareStep } from "../../../src/breakpoints"
import type { ConversationStrategy } from "../../../src/conversation"
import { testTools, type TestTools } from "../../../src/tools"

import { MODEL, REASONING_OPTIONS, STOP_WHEN } from "../util"


export function stratStringNoOptIn(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: false })

  return {
    label: "1. instructions: STRING, no opt-in",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: systemPrompt,
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: { anthropic: { ...REASONING_OPTIONS } },
    }),
    lastBreakpointCount: counter.lastCount,
  }
}
