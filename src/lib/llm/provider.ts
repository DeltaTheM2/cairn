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

export type CallUsage = {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
  latencyMs: number
}

export type CallResult<T> = {
  data: T
  usage: CallUsage
  model: string
  promptVersion: string
}

export type SynthesizeChunk =
  | { type: "delta"; text: string }
  | {
      type: "done"
      usage: CallUsage
      model: string
      promptVersion: string
      fullText: string
    }

export interface LLMProvider {
  readonly name: string

  judge(input: JudgeInput): Promise<CallResult<JudgeOutput>>
  coach(input: CoachInput): Promise<CallResult<CoachOutput>>
  suggest(input: SuggestInput): Promise<CallResult<SuggestOutput>>
  merge(input: MergeInput): Promise<CallResult<MergeOutput>>
  synthesize(
    input: SynthesizeInput,
    signal?: AbortSignal,
  ): AsyncIterable<SynthesizeChunk>
}
