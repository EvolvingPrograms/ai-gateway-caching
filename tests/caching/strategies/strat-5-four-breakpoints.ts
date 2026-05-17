/**
 * Strategy 5 — manual placement at exactly Anthropic's 4-breakpoint
 * cap: system (ephemeral) + last 3 history messages (ephemeral via
 * `trailingEphemeral(3)`). No gateway opt-in, no per-step tail-pin.
 *
 * Demonstrates the rolling-cache prefix pattern without any
 * server-side help — and what hit rate looks like when the trailing
 * window covers the 20-block lookback consistently.
 */

import { ToolLoopAgent } from "ai"

import { makeCountingPrepareStep } from "@/src/breakpoints"
import type { ConversationStrategy } from "@/src/conversation"
import { testTools, type TestTools } from "@/src/tools"

import {
  MODEL,
  REASONING_OPTIONS,
  STOP_WHEN,
  ephemeralSystem,
  trailingEphemeral,
} from "@/tests/caching/util"


export function stratFourBreakpoints(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: true })

  return {
    label: "5. SystemModelMessage ephemeral + ephemeral on last 3 history msgs",
    agent: new ToolLoopAgent({
      model: MODEL,
      instructions: ephemeralSystem(systemPrompt),
      tools: testTools,
      stopWhen: STOP_WHEN,
      prepareStep: counter.prepareStep,
      providerOptions: { anthropic: { ...REASONING_OPTIONS } },
    }),
    lastBreakpointCount: counter.lastCount,

    // Tag the last 3 history messages with cache_control: ephemeral
    // (in addition to the system message → 4 breakpoints total,
    // exactly at Anthropic's max).
    transform: trailingEphemeral(3),
  }
}
