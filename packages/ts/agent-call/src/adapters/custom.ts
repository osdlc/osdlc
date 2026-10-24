import type { CapabilityNote, PlannedCall } from '../plan.js'
import { note } from '../plan.js'
import type { AgentCallSpec } from '../spec.js'
import { buildEffectivePrompt, commandPrefix, type CommandOptions } from './shared.js'
import type { AgentAdapter, ParsedOutput } from './types.js'

/** Options for {@link customAdapter}. */
export interface CustomAdapterOptions extends CommandOptions {
  /** Adapter name, reported as `PlannedCall.agent`. */
  name: string
  /**
   * Binary to spawn. Default: `name`. A `command` with at least one element
   * replaces it, as on the built-in adapters.
   */
  binary?: string
  /**
   * Build the args for a spec. They follow the binary, or the whole `command`.
   * `effectivePrompt` is `spec.prompt` with the context, system prompts and
   * schema folded in, so a simple CLI gets the same prompt emulation as the
   * built-in adapters. Place it in the returned args, or set
   * `promptVia: 'stdin'` to send it on stdin instead. Whatever `args` throws
   * passes out of planning.
   */
  args: (spec: AgentCallSpec, effectivePrompt: string) => string[]
  /** How the prompt travels. Default: `"argv"` (your `args` must place it). */
  promptVia?: 'argv' | 'stdin'
  /**
   * Optional custom parser. The default returns trimmed stdout as text. If it
   * throws, `callAgent` resolves `ok: false` with reason `agent-error`.
   */
  parse?: (stdout: string, stderr: string) => ParsedOutput
}

/**
 * An adapter for agents this package has no built-in adapter for: aider,
 * goose, anything with a one-shot CLI. Context, system prompts and schema are
 * folded into the prompt, and `permissions.mode` is noted as dropped. The
 * `args` builder handles any other spec field, and a field it leaves out is
 * not noted. `planned.argv` starts with `command` (or `[binary]`), and the
 * adapter's `command` is set to it, so `detectAgents` runs the whole prefix.
 */
export function customAdapter(options: CustomAdapterOptions): AgentAdapter {
  const command = commandPrefix(options, options.name)
  return {
    name: options.name,
    binary: command[0]!,
    command,
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
      const argv = [...command, ...options.args(spec, effectivePrompt), ...(spec.extraArgs ?? [])]
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
