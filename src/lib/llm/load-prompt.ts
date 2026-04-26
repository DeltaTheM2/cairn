import { readFileSync } from "node:fs"
import path from "node:path"

export type ParsedPrompt = {
  system: string
  userTemplate: string
}

const cache = new Map<string, ParsedPrompt>()

const SYSTEM_RE = /##\s*System prompt\s*\n([\s\S]*?)\n---/m
const USER_RE = /##\s*User prompt template\s*\n```[a-zA-Z]*\n([\s\S]*?)\n```/m

/**
 * Reads `prompts/<name>.md`, parses out the system and user-template
 * sections, and caches the result. Throws if either section is missing.
 *
 * The convention (codified in `prompts/*.md`):
 *   ## System prompt
 *   <body>
 *   ---
 *   ## User prompt template
 *   ```
 *   <body with {{vars}}>
 *   ```
 */
export function loadPrompt(name: string): ParsedPrompt {
  const cached = cache.get(name)
  if (cached) return cached

  const filePath = path.join(process.cwd(), "prompts", `${name}.md`)
  const raw = readFileSync(filePath, "utf-8")

  const systemMatch = raw.match(SYSTEM_RE)
  const userMatch = raw.match(USER_RE)
  const system = systemMatch?.[1]?.trim()
  const userTemplate = userMatch?.[1]?.trim()
  if (!system || !userTemplate) {
    throw new Error(
      `loadPrompt: failed to parse "${name}". Looked for "## System prompt" / "---" and "## User prompt template" code fence in ${filePath}.`,
    )
  }

  const parsed = { system, userTemplate }
  cache.set(name, parsed)
  return parsed
}

/**
 * Replaces `{{name}}` placeholders with the matching value. Throws on any
 * placeholder that isn't supplied — better to fail loudly than silently
 * send "{{user_answer}}" verbatim to the model.
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key]
    if (value === undefined) {
      throw new Error(`interpolate: missing value for {{${key}}}`)
    }
    return String(value)
  })
}

// Test-only: clear the prompt cache between test runs.
export function clearPromptCache() {
  cache.clear()
}
