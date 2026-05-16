/**
 * Test-only helper that calls a Tool's `execute` and unwraps the
 * possibly-streaming return into a single value.
 *
 * AI SDK tools may stream — `execute()` is typed as
 * `Promise<T | AsyncIterable<T>>`. Our static fixture tools never
 * stream, but TS doesn't know that. This helper narrows at runtime
 * via a typed predicate so the test bodies can read `out.field`
 * without `!` non-null assertions or `as` casts.
 */


type ToolExec<I, O> = {
  execute?: (input: I, opts: ExecOpts) => PromiseLike<O> | AsyncIterable<O> | O
}

interface ExecOpts {
  toolCallId: string
  messages: never[]
}


const EXEC_OPTS: ExecOpts = { toolCallId: "test", messages: [] }


function isAsyncIterable<T>(v: unknown): v is AsyncIterable<T> {
  if (v === null || typeof v !== "object") return false
  return Symbol.asyncIterator in v
}


export async function execToolTest<I, O>(
  toolDef: ToolExec<I, O>,
  input: I,
): Promise<O> {
  if (!toolDef.execute) throw new Error("execToolTest: tool has no execute")

  const result = await toolDef.execute(input, EXEC_OPTS)
  if (isAsyncIterable<O>(result)) {
    throw new Error("execToolTest: tool returned a stream (not supported here)")
  }

  return result
}
