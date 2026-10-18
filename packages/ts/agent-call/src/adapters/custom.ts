import type { CapabilityNote, PlannedCall } from '../plan.js'
import { note } from '../plan.js'
import type { AgentCallSpec } from '../spec.js'
import { buildEffectivePrompt } from './shared.js'
import type { AgentAdapter, ParsedOutput } from './types.js'

/** Options for {@link customAdapter}. */
export interface CustomAdapterOptions {
  /** Adapter name, reported as `PlannedCall.agent`. */
  name: string
  /** Binary to spawn. */
  binary: string
  /**
   * Build the args (after the binary) for a spec. The effective prompt —
   * spec.prompt with context/system/schema folded in — is provided so simple
   * CLIs get the emulation layer for free. Place it in the returned args, or
   * set `promptVia: 'stdin'` to send it on stdin instead. Whatever `args`
   * throws propagates out of planning.
   */
  args: (spec: AgentCallSpec, effectivePrompt: string) => string[]
  /** How the prompt travels. Default: `"argv"` (your `args` must place it). */
  promptVia?: 'argv' | 'stdin'
  /**
   * Optional custom parse; default returns trimmed stdout as text. If it
   * throws, `callAgent` resolves `ok: false` with reason `agent-error`.
   */
  parse?: (stdout: string, stderr: string) => ParsedOutput
}

/**
 * Escape hatch for agents this package has no adapter for: aider, goose,
 * anything with a one-shot CLI. Context, system prompt and schema are folded
 * into the prompt, and `permissions.mode` is noted as dropped. Any other spec
 * field is the `args` builder's to handle; it is not noted if left out.
 */
export function customAdapter(options: CustomAdapterOptions): AgentAdapter {
  return {
    name: options.name,
    binary: options.binary,
    plan(spec): PlannedCall {
      const notes: CapabilityNote[] = []
      const effectivePrompt = buildEffectivePrompt(spec, {}, notes)
      if (spec.permissions?.mode !== undefined) {
        note(
          notes,
          'permissions.mode',
          'dropped',
          `custom adapter "${options.name}" defines no permission mapping`,
        )
      }
      const argv = [
        options.binary,
        ...options.args(spec, effectivePrompt),
        ...(spec.extraArgs ?? []),
      ]
      return {
        agent: options.name,
        argv,
        stdin: options.promptVia === 'stdin' ? effectivePrompt : undefined,
        env: { ...spec.env },
        cwd: spec.cwd,
        outputFormat: spec.output?.format ?? 'text',
        tempFiles: [],
        notes,
        spec,
      }
    },
    parseResult(_planned, raw): ParsedOutput {
      if (options.parse) return options.parse(raw.stdout, raw.stderr)
      return { text: raw.stdout.trim() }
    },
  }
}
