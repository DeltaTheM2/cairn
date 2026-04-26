import { AnthropicProvider } from "@/lib/llm/anthropic"
import { MockProvider } from "@/lib/llm/mock"
import type { LLMProvider } from "@/lib/llm/provider"

let cached: LLMProvider | null = null

export function getLLMProvider(): LLMProvider {
  if (cached) return cached

  const apiKey = process.env.ANTHROPIC_API_KEY
  const explicit = process.env.LLM_PROVIDER

  if (explicit === "mock" || apiKey === "fake") {
    cached = new MockProvider()
  } else if (!explicit || explicit === "anthropic") {
    cached = new AnthropicProvider(apiKey)
  } else {
    throw new Error(
      `Unknown LLM_PROVIDER: "${explicit}" (expected "anthropic" or "mock")`,
    )
  }

  return cached
}

// Test-only — let tests reset between runs.
export function resetLLMProvider() {
  cached = null
}

export type { LLMProvider } from "@/lib/llm/provider"
