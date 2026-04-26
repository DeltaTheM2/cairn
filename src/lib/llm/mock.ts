import { MODELS } from "@/lib/llm/pricing"
import type {
  CallResult,
  CallUsage,
  LLMProvider,
  SynthesizeChunk,
} from "@/lib/llm/provider"
import type {
  CoachInput,
  CoachOutput,
  JudgeInput,
  JudgeOutput,
  SuggestInput,
  SuggestOutput,
  SynthesizeInput,
} from "@/lib/llm/schemas"

const PROMPT_VERSION = "mock"

function usage(inputTokens: number, outputTokens: number): CallUsage {
  return { inputTokens, outputTokens, latencyMs: 0 }
}

/**
 * Deterministic stub provider used when ANTHROPIC_API_KEY=fake or
 * LLM_PROVIDER=mock. Output shape matches the real provider; output
 * content is heuristic so dev + tests can drive the wizard end-to-end
 * without burning tokens.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock"

  async judge(input: JudgeInput): Promise<CallResult<JudgeOutput>> {
    const trimmed = input.user_answer.trim()
    const len = trimmed.length
    const score: 1 | 2 | 3 | 4 | 5 =
      len < 30 ? 1 : len < 80 ? 2 : len < 150 ? 3 : len < 300 ? 4 : 5

    const data: JudgeOutput = {
      score,
      strengths:
        score >= 4
          ? ["Specific and grounded", "Reads as project-aware"]
          : score === 3
            ? ["Addresses the question"]
            : [],
      weaknesses:
        score < 4
          ? ["Could include more concrete detail", "Generic phrasing in places"]
          : [],
      suggestions:
        score < 4 ? ["Add a concrete example", "Quantify where possible"] : [],
      one_line_verdict:
        score >= 4
          ? "Strong, specific answer"
          : score === 3
            ? "Borderline — revise for specificity"
            : "Needs more substance",
    }

    return {
      data,
      usage: usage(80 + Math.min(len, 500), 60),
      model: `mock:${MODELS.judge}`,
      promptVersion: PROMPT_VERSION,
    }
  }

  async coach(input: CoachInput): Promise<CallResult<CoachOutput>> {
    const data: CoachOutput = {
      rephrased_question: `Take another pass at: ${input.question_prompt}`,
      examples: [
        {
          context: "B2B SaaS onboarding flow",
          answer:
            "Mid-market sales managers (10-50 person teams) currently move leads through a Slack channel; we replace the channel with a structured pipeline view.",
        },
        {
          context: "Internal dev tools",
          answer:
            "Engineering leads spend 30 minutes per release writing changelogs; the tool drafts them from merged PR titles.",
        },
      ],
      follow_up:
        "What concrete outcome would tell you this answer is precise enough?",
      encouragement:
        "You're close — one more pass with a specific example will get you over the line.",
    }
    return {
      data,
      usage: usage(120, 200),
      model: `mock:${MODELS.coach}`,
      promptVersion: PROMPT_VERSION,
    }
  }

  async suggest(input: SuggestInput): Promise<CallResult<SuggestOutput>> {
    const data: SuggestOutput = {
      missing_features: [
        {
          title: "Audit trail",
          rationale: `Anything in ${input.section_title} that mutates state usually wants a who/when/what record.`,
          suggested_question:
            "Who needs to be able to reconstruct who changed what, and over what time horizon?",
          confidence: "medium",
        },
      ],
      edge_cases: [
        {
          title: "Empty / first-run state",
          rationale:
            "What does the user see the very first time they land here?",
          suggested_question:
            "Describe the empty state and the first action the user can take.",
          confidence: "high",
        },
      ],
      risks: [
        {
          title: "Silent failure",
          rationale:
            "If a step fails partway, do users notice? What's the recovery path?",
          suggested_question:
            "How do users find out about and recover from a partial failure here?",
          confidence: "medium",
        },
      ],
    }
    return {
      data,
      usage: usage(800, 600),
      model: `mock:${MODELS.suggester}`,
      promptVersion: PROMPT_VERSION,
    }
  }

  async *synthesize(input: SynthesizeInput): AsyncIterable<SynthesizeChunk> {
    const lines = [
      "---",
      `title: ${input.doc_name}`,
      `type: ${input.doc_type}`,
      "status: draft",
      `generated_at: ${input.timestamp_iso}`,
      "generated_by: cairn-synthesizer-v1-mock",
      "---",
      "",
      `# ${input.doc_name}`,
      "",
      "_Mock synthesizer output — wire the Anthropic provider in production._",
      "",
    ]
    let buffer = ""
    for (const line of lines) {
      const chunk = line + "\n"
      buffer += chunk
      yield { type: "delta", text: chunk }
    }
    yield {
      type: "done",
      usage: usage(2000, lines.join("\n").length / 4),
      model: `mock:${MODELS.synthesizer}`,
      promptVersion: PROMPT_VERSION,
      fullText: buffer,
    }
  }
}
