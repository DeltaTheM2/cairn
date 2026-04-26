import Anthropic from "@anthropic-ai/sdk"

import { interpolate, loadPrompt } from "@/lib/llm/load-prompt"
import { MODELS } from "@/lib/llm/pricing"
import type {
  CallResult,
  CallUsage,
  LLMProvider,
  SynthesizeChunk,
} from "@/lib/llm/provider"
import {
  coachOutputSchema,
  judgeOutputSchema,
  suggesterOutputSchema,
  type CoachInput,
  type CoachOutput,
  type JudgeInput,
  type JudgeOutput,
  type SuggestInput,
  type SuggestOutput,
  type SynthesizeInput,
} from "@/lib/llm/schemas"

const PROMPT_VERSION = "v1"

const JUDGE_MAX_TOKENS = 400
const COACH_MAX_TOKENS = 800
const SUGGEST_MAX_TOKENS = 2000
const SYNTHESIZE_MAX_TOKENS = 6000

function extractText(content: Anthropic.ContentBlock[]): string {
  for (const block of content) {
    if (block.type === "text") return block.text
  }
  throw new Error("No text block in Anthropic response")
}

function usageFrom(apiUsage: Anthropic.Usage, latencyMs: number): CallUsage {
  return {
    inputTokens: apiUsage.input_tokens,
    outputTokens: apiUsage.output_tokens,
    cacheCreationTokens: apiUsage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: apiUsage.cache_read_input_tokens ?? 0,
    latencyMs,
  }
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic"
  private client: Anthropic

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    })
  }

  async judge(input: JudgeInput): Promise<CallResult<JudgeOutput>> {
    const prompt = loadPrompt("adequacy-judge")
    const userPrompt = interpolate(prompt.userTemplate, {
      doc_type: input.doc_type,
      section_title: input.section_title,
      question_prompt: input.question_prompt,
      question_rubric: input.question_rubric,
      question_examples: input.question_examples
        .map((e, i) => `${i + 1}. ${e}`)
        .join("\n"),
      user_answer: input.user_answer,
    })

    const start = Date.now()
    // Caching the system prompt is a no-op when shorter than the
    // ~4096-token Haiku 4.5 minimum; included anyway in case the prompt
    // ever grows past the threshold.
    const response = await this.client.messages.create({
      model: MODELS.judge,
      max_tokens: JUDGE_MAX_TOKENS,
      temperature: 0,
      system: [
        {
          type: "text",
          text: prompt.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    })
    const latencyMs = Date.now() - start

    const text = extractText(response.content)
    const data = judgeOutputSchema.parse(JSON.parse(text))

    return {
      data,
      usage: usageFrom(response.usage, latencyMs),
      model: response.model,
      promptVersion: PROMPT_VERSION,
    }
  }

  async coach(input: CoachInput): Promise<CallResult<CoachOutput>> {
    const prompt = loadPrompt("coach")
    const userPrompt = interpolate(prompt.userTemplate, {
      doc_type: input.doc_type,
      section_title: input.section_title,
      question_prompt: input.question_prompt,
      user_answer: input.user_answer,
      judge_score: input.judge_score,
      judge_strengths: input.judge_strengths.join("; ") || "(none)",
      judge_weaknesses: input.judge_weaknesses.join("; ") || "(none)",
      judge_suggestions: input.judge_suggestions.join("; ") || "(none)",
      revision_count: input.revision_count,
    })

    const start = Date.now()
    const response = await this.client.messages.create({
      model: MODELS.coach,
      max_tokens: COACH_MAX_TOKENS,
      temperature: 0.4,
      system: prompt.system,
      messages: [{ role: "user", content: userPrompt }],
    })
    const latencyMs = Date.now() - start

    const text = extractText(response.content)
    const data = coachOutputSchema.parse(JSON.parse(text))

    return {
      data,
      usage: usageFrom(response.usage, latencyMs),
      model: response.model,
      promptVersion: PROMPT_VERSION,
    }
  }

  async suggest(input: SuggestInput): Promise<CallResult<SuggestOutput>> {
    const prompt = loadPrompt("suggester")
    const userPrompt = interpolate(prompt.userTemplate, {
      doc_type: input.doc_type,
      doc_name: input.doc_name,
      section_title: input.section_title,
      section_description: input.section_description,
      section_answers: input.section_answers,
      project_context: input.project_context,
    })

    const start = Date.now()
    const response = await this.client.messages.create({
      model: MODELS.suggester,
      max_tokens: SUGGEST_MAX_TOKENS,
      temperature: 0.6,
      system: prompt.system,
      messages: [{ role: "user", content: userPrompt }],
    })
    const latencyMs = Date.now() - start

    const text = extractText(response.content)
    const data = suggesterOutputSchema.parse(JSON.parse(text))

    return {
      data,
      usage: usageFrom(response.usage, latencyMs),
      model: response.model,
      promptVersion: PROMPT_VERSION,
    }
  }

  async *synthesize(
    input: SynthesizeInput,
    signal?: AbortSignal,
  ): AsyncIterable<SynthesizeChunk> {
    const prompt = loadPrompt("synthesizer")
    const userPrompt = interpolate(prompt.userTemplate, {
      doc_type: input.doc_type,
      doc_name: input.doc_name,
      timestamp_iso: input.timestamp_iso,
      synthesis_template: input.synthesis_template,
      sections_and_answers: input.sections_and_answers,
      soft_warned_summary: input.soft_warned_summary || "(none)",
    })

    const start = Date.now()
    const stream = this.client.messages.stream(
      {
        model: MODELS.synthesizer,
        max_tokens: SYNTHESIZE_MAX_TOKENS,
        temperature: 0.2,
        system: prompt.system,
        messages: [{ role: "user", content: userPrompt }],
      },
      { signal },
    )

    let buffer = ""
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        buffer += event.delta.text
        yield { type: "delta", text: event.delta.text }
      }
    }

    const final = await stream.finalMessage()
    const latencyMs = Date.now() - start

    yield {
      type: "done",
      usage: usageFrom(final.usage, latencyMs),
      model: final.model,
      promptVersion: PROMPT_VERSION,
      fullText: buffer,
    }
  }
}
