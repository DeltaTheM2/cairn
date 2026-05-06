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
  MergeInput,
  MergeOutput,
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
    const lower = trimmed.toLowerCase()

    // Heuristic per-criterion verdict: a criterion is "met" if (a) the
    // answer is reasonably long AND (b) at least one keyword from the
    // criterion's label or hint appears in the answer. Empty / very
    // short answers fail every criterion. Production replaces this
    // with a real Haiku call.
    const criteria = input.question_criteria.map((c) => {
      if (len < 30) {
        return {
          key: c.key,
          met: false,
          why_not: "Answer is too short to evaluate.",
        }
      }
      const words = (c.label + " " + c.hint)
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 5)
      const hit = words.some((w) => lower.includes(w))
      if (hit) return { key: c.key, met: true }
      return {
        key: c.key,
        met: false,
        why_not: `Answer doesn't seem to address: ${c.label.toLowerCase()}.`,
      }
    })

    const metCount = criteria.filter((c) => c.met).length
    const ratio = criteria.length > 0 ? metCount / criteria.length : 0
    const score: 1 | 2 | 3 | 4 | 5 =
      ratio >= 1
        ? 5
        : ratio >= 0.75
          ? 4
          : ratio >= 0.5
            ? 3
            : ratio >= 0.25
              ? 2
              : 1

    const data: JudgeOutput = {
      score,
      criteria,
      one_line_verdict:
        metCount === criteria.length
          ? "All criteria met."
          : `${metCount} of ${criteria.length} criteria met — revise the missing ones.`,
    }

    return {
      data,
      usage: usage(80 + Math.min(len, 500), 60),
      model: `mock:${MODELS.judge}`,
      promptVersion: PROMPT_VERSION,
    }
  }

  async coach(input: CoachInput): Promise<CallResult<CoachOutput>> {
    // One targeted question per failed criterion, derived from the
    // criterion's label. Production Haiku reads `failed_criteria.hint`
    // + `why_not` and writes a more grounded question.
    const data: CoachOutput = {
      targeted_questions: input.failed_criteria.map((c) => ({
        criterion_key: c.key,
        question: `In one sentence: ${c.label.toLowerCase()}. ${c.hint}`,
      })),
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
      encouragement:
        "You're close — fill in these specifics and the merge will pull it together.",
    }
    return {
      data,
      usage: usage(120, 200),
      model: `mock:${MODELS.coach}`,
      promptVersion: PROMPT_VERSION,
    }
  }

  async merge(input: MergeInput): Promise<CallResult<MergeOutput>> {
    // Deterministic mock: append non-empty fill-ins onto the original
    // draft as integrated sentences. Production uses Haiku.
    const integrated = input.qa_pairs
      .filter((p) => p.answer.trim().length > 0)
      .map((p) => p.answer.trim())
      .join(" ")
    const revised = integrated
      ? `${input.original_draft.trim()} ${integrated}`.trim()
      : input.original_draft
    const data: MergeOutput = {
      revised_draft: revised,
      change_summary: integrated
        ? `Integrated ${input.qa_pairs.filter((p) => p.answer.trim()).length} fill-in answer(s).`
        : "no changes — fill-ins were empty",
    }
    return {
      data,
      usage: usage(300 + input.original_draft.length / 4, 200),
      model: `mock:${MODELS.merge}`,
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
