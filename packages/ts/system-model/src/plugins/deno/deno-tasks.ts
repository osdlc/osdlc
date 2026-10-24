/**
 * deno.json / deno.jsonc `tasks` — Deno's built-in task runner.
 *
 * `kind: "parse"`: the `tasks` map is data, not code, so this reads it
 * directly instead of running `deno task`.
 *
 * A file named `deno.json` can still hold JSONC comments (`//` and
 * `/* … *\/`). This is common, and Deno's own parser accepts them whatever the
 * extension. `ctx.readJson` (`context.ts`'s `safeParse`) runs a strict
 * `JSON.parse` and returns `null` on failure, so it would silently drop every
 * config with comments. This runner reads the raw text with `ctx.readText`
 * and strips the comments itself before parsing.
 */

import type { ProviderContext } from '../../contract.ts'
import type { ProviderResult, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dirOf, looksPersistent, taskId } from '../support/shared.ts'
import { DENO_JSON, DENO_JSONC } from './ecosystem.ts'

const CHAIN = [
  { label: 'runner', hint: "Deno runs tasks declared in a deno.json's `tasks` map." },
  { label: 'project', hint: 'The directory holding the deno.json/deno.jsonc. `.` is the root.' },
  { label: 'task', hint: 'The key under `tasks`.' },
]

// No `brand`: simple-icons' `deno` icon has its own `license: MIT` (Deno's
// logo license), not the set's CC0-1.0. `cargo.ts` notes the same problem for
// the `rust` icon. `brand` is optional (see `RunnerRole` in `tool.ts`), so this
// omits it rather than ship a non-CC0 mark or make up a substitute glyph.

interface DenoTaskObject {
  command?: unknown
  description?: unknown
}

/** A `tasks` entry: either the raw command string, or `{ command, description? }`. */
type DenoTaskValue = string | DenoTaskObject

/**
 * Strip `//` line comments and `/* … *\/` block comments from JSONC text.
 * Either sequence inside a `"..."` string is left alone. The scan goes char by
 * char and tracks string state (including `\"` escapes), so
 * `"echo http://example.com"` stays intact.
 *
 * Minimal on purpose: no dependency, and only comments are handled. JSON5
 * extras (trailing commas, single quotes) are not supported. Deno's config
 * format needs only comments.
 */
export function stripJsonComments(text: string): string {
  let out = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inString) {
      out += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      out += ch
      continue
    }

    if (ch === '/' && next === '/') {
      // Line comment: skip to (but not past) the newline.
      i++
      while (i + 1 < text.length && text[i + 1] !== '\n') i++
      continue
    }

    if (ch === '/' && next === '*') {
      // Block comment: skip past the closing `*/`, or to EOF if unterminated.
      i += 2
      while (i + 1 < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
      continue
    }

    out += ch
  }

  return out
}

async function readDenoConfig(ctx: ProviderContext, file: string): Promise<unknown> {
  const text = await ctx.readText(file)
  if (text === null) return null
  try {
    return JSON.parse(stripJsonComments(text))
  } catch {
    return null
  }
}

export const denoTasksRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    // Both names are valid Deno configs. A directory with both is a rare case
    // (Deno itself picks one). This runner does not dedupe; it reads each file.
    const [jsonFiles, jsoncFiles] = await Promise.all([ctx.files(DENO_JSON), ctx.files(DENO_JSONC)])
    const configs = [...jsonFiles, ...jsoncFiles].sort()
    if (configs.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    const tasks: Task[] = []

    for (const file of configs) {
      const parsed = await readDenoConfig(ctx, file)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue

      const config = parsed as { tasks?: unknown }
      const rawTasks = config.tasks
      if (rawTasks === null || typeof rawTasks !== 'object' || Array.isArray(rawTasks)) continue

      const dir = dirOf(file)

      for (const [name, value] of Object.entries(rawTasks as Record<string, unknown>)) {
        const entry = value as DenoTaskValue
        let command: string | undefined
        let doc: string | undefined

        if (typeof entry === 'string') {
          command = entry
        } else if (
          entry !== null &&
          typeof entry === 'object' &&
          typeof entry.command === 'string'
        ) {
          command = entry.command
          if (typeof entry.description === 'string') doc = entry.description
        }
        if (command === undefined) continue

        const argv = dir === '.' ? ['deno', 'task', name] : ['deno', 'task', '--cwd', dir, name]

        tasks.push({
          id: taskId('deno-tasks', file, name),
          runner: 'deno-tasks',
          path: ['deno-tasks', dir, name],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'declared',
          ...(doc ? { doc } : {}),
          detail: command,
          tags: ['deno-tasks', 'deno', dir],
          persistent: {
            value: looksPersistent(name) || /--watch\b/.test(command),
            declared: false,
          },
          executes: 'local',
        })
      }
    }

    return {
      status: tasks.length > 0 ? 'ok' : 'absent',
      tasks,
      diagnostics: [],
    }
  },
}
