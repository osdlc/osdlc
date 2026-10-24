/**
 * deno.json / deno.jsonc `tasks` — Deno's built-in task runner.
 *
 * `kind: "parse"`: the `tasks` map is data, not code, so this reads it
 * directly rather than shelling out to `deno task`.
 *
 * Deno config files may be named `deno.json` but still carry JSONC comments
 * (`//` and `/* … *\/`) — this is common in the wild and Deno's own parser
 * tolerates it regardless of extension. `ctx.readJson` (`collect.ts`'s
 * `safeParse`) does a strict `JSON.parse` and returns `null` on failure, which
 * would silently drop every commented config. So this runner reads the raw
 * text via `ctx.readText` and strips comments itself before parsing.
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

// No `brand`: simple-icons' `deno` entry carries a per-icon `license: MIT`
// override (Deno's own logo license), not the aggregate package's CC0-1.0 —
// same situation `cargo.ts` documents for the `rust` icon. A runner is
// complete without a brand (see `contract.ts`), so this omits one rather than
// ship a non-CC0 mark or invent a substitute glyph.

interface DenoTaskObject {
  command?: unknown
  description?: unknown
}

/** A `tasks` entry: either the raw command string, or `{ command, description? }`. */
type DenoTaskValue = string | DenoTaskObject

/**
 * Strip `//` line comments and `/* … *\/` block comments from JSONC text,
 * without touching either sequence when it appears inside a `"..."` string
 * literal. Scans char-by-char tracking string state (respecting `\"`
 * escapes) so `"echo http://example.com"` survives untouched.
 *
 * Minimal on purpose — no dependency, no support for JSON5 extras (trailing
 * commas, single quotes) beyond comments, which is all Deno's config format
 * needs.
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
    // Both extensions are valid Deno config names. A directory carrying both
    // is a real-world edge case (Deno itself picks one); this runner does
    // not try to dedupe cleverly and just processes each file it finds.
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
