/**
 * Tolerant JSON extractor for LLM responses.
 *
 * The judge / coach / suggester prompts explicitly tell the model
 * "no markdown, no backticks, no preamble." Haiku and Sonnet usually
 * comply but sometimes wrap output in a ```json fence anyway, and
 * Sonnet occasionally adds a one-line preamble. Calling JSON.parse on
 * the raw response then explodes with a misleading "Unexpected token
 * '`'" error and the whole call fails closed.
 *
 * This helper tries three strategies in order:
 *   1. Raw parse — covers the well-behaved case
 *   2. Strip the first ```...``` fenced block (with or without a
 *      `json` tag) — covers the most common deviation
 *   3. Pull out the first {...}-bracketed substring — covers
 *      preamble-style deviations like "Here's the verdict:\n{...}"
 *
 * If all three fail, the original parse error is thrown so the call
 * still surfaces a meaningful failure to logs.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim()

  try {
    return JSON.parse(trimmed)
  } catch (firstErr) {
    const fence = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (fence) {
      try {
        return JSON.parse(fence[1].trim())
      } catch {
        // fall through
      }
    }

    const objMatch = trimmed.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0])
      } catch {
        // fall through
      }
    }

    throw firstErr
  }
}
