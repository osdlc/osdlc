import type { CapabilityNote, Support } from '../plan.js'
import { note } from '../plan.js'
import type { AgentCallSpec, PermissionMode } from '../spec.js'

/** `--model <model>`: the flag claude, codex, antigravity and pi all take. */
export function modelFlag(model: string): string[] {
  return ['--model', model]
}

export interface PermissionModeEntry {
  argv: string[]
  support: Extract<Support, 'native' | 'approximated'>
  detail: string
}
export type PermissionModeTable = Partial<
  Record<Exclude<PermissionMode, 'default'>, PermissionModeEntry>
>

/** permissions.mode → argv tokens, shared by adapters that express modes as CLI flags. */
export function applyPermissionMode(
  argv: string[],
  notes: CapabilityNote[],
  mode: PermissionMode | undefined,
  table: PermissionModeTable,
): void {
  if (mode === undefined || mode === 'default') return
  const entry = table[mode]
  if (entry === undefined) return
  argv.push(...entry.argv)
  note(notes, 'permissions.mode', entry.support, entry.detail)
}

/** Which spec fields the target CLI handles natively (everything else gets emulated in the prompt). */
export interface PromptEmulation {
  /** CLI attaches context files natively; skip the file preamble. */
  filesNative?: boolean | undefined
  /** Prefix file entries with `@` for agents with @-inclusion syntax. */
  filesAtSyntax?: boolean | undefined
  /** CLI enforces an output schema natively; skip the JSON instruction. */
  schemaNative?: boolean | undefined
  /** CLI takes system prompts natively; skip the system preamble. */
  systemNative?: boolean
  /** CLI takes appended system prompts natively; skip the instructions preamble. */
  appendSystemNative?: boolean
}

/**
 * Build the prompt actually sent, folding in every spec field the target CLI
 * cannot express natively. Each fold is recorded as an `emulated` note.
 */
export function buildEffectivePrompt(
  spec: AgentCallSpec,
  emulation: PromptEmulation,
  notes: CapabilityNote[],
): string {
  const sections: string[] = []

  if (spec.systemPrompt !== undefined && !emulation.systemNative) {
    sections.push(`<system>\n${spec.systemPrompt}\n</system>`)
    note(
      notes,
      'systemPrompt',
      'emulated',
      'no system-prompt flag; prepended to the prompt in a <system> block',
    )
  }
  if (spec.appendSystemPrompt !== undefined && !emulation.appendSystemNative) {
    sections.push(`<instructions>\n${spec.appendSystemPrompt}\n</instructions>`)
    note(
      notes,
      'appendSystemPrompt',
      'emulated',
      'no append-system-prompt flag; prepended to the prompt in an <instructions> block',
    )
  }

  if (spec.context?.text !== undefined) {
    sections.push(`<context>\n${spec.context.text}\n</context>`)
  }

  const files = spec.context?.files ?? []
  if (files.length > 0 && !emulation.filesNative) {
    const listed = files.map((f) => (emulation.filesAtSyntax ? `@${f}` : `- ${f}`)).join('\n')
    sections.push(`Relevant files (read them before answering):\n${listed}`)
    note(
      notes,
      'context.files',
      'emulated',
      emulation.filesAtSyntax
        ? 'no attach flag; referenced with @path syntax in the prompt'
        : 'no attach flag; listed in a prompt preamble for the agent to read',
    )
  }

  sections.push(spec.prompt)

  if (spec.output?.schema !== undefined && !emulation.schemaNative) {
    sections.push(
      'Respond with ONLY a JSON value (no prose, no markdown fences) that ' +
        `validates against this JSON Schema:\n${JSON.stringify(spec.output.schema)}`,
    )
    note(
      notes,
      'output.schema',
      'emulated',
      'no schema flag; appended a respond-only-with-JSON instruction to the prompt',
    )
  }

  return sections.join('\n\n')
}

/** Strip one surrounding markdown code fence, if present. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed
  const lines = trimmed.split('\n')
  if (lines[0]?.startsWith('```')) lines.shift()
  if (lines[lines.length - 1]?.trim().startsWith('```')) lines.pop()
  return lines.join('\n').trim()
}

/** Parse JSON, tolerating a surrounding code fence. Returns undefined on failure. */
export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(stripCodeFence(text))
  } catch {
    return undefined
  }
}

/** Parse line-delimited JSON, skipping lines that aren't JSON objects. */
export function parseJsonLines(stdout: string): unknown[] {
  const events: unknown[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      events.push(JSON.parse(trimmed))
    } catch {
      // Interleaved log noise is expected on some CLIs; skip it.
    }
  }
  return events
}

/** Type-tolerant object field access for parsing loosely specified payloads. */
export function get(value: unknown, ...path: string[]): unknown {
  let current: unknown = value
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
