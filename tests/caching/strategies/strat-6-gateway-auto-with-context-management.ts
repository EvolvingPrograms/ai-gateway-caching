/**
 * Strategy 6 — `gateway.caching = "auto"` + the shared
 * `CONTEXT_MANAGEMENT` config. No manual breakpoint placement; no
 * mirror-trim. Probes the "let the server figure it out" path.
 */

import { ToolLoopAgent } from "ai"
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic"

import { makeCountingPrepareStep } from "../../../src/breakpoints"
import type { ConversationStrategy } from "../../../src/conversation"
import { testTools, type TestTools } from "../../../src/tools"

import {
  CONTEXT_MANAGEMENT,
  MODEL,
  REASONING_OPTIONS,
  STOP_WHEN,
  ephemeralSystem,
} from "../util"


export function stratGatewayAutoWithContextManagement(
  systemPrompt: string,
): ConversationStrategy<TestTools> {
  const counter = makeCountingPrepareStep({ systemHasEphemeral: true })

  return {
    label: "6. gateway caching:'auto' + context management defaults",
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
  }
}
