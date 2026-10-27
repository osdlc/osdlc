/**
 * deno.json / deno.jsonc `tasks` — Deno's built-in task runner.
 *
 * `kind: "parse"`: the `tasks` map is data, not code, so this reads it
 * directly instead of running `deno task`.
 *
 * A file named `deno.json` can still hold JSONC comments (`//` and
 * `/* … *\/`) and trailing commas. This is common, and Deno's own parser
 * accepts them whatever the extension. `ctx.readJson` (`context.ts`'s
 * `safeParse`) runs a strict `JSON.parse` and returns `null` on failure, so it
 * would silently drop every such config. This runner parses the raw text as
 * JSONC instead, and reports a file that still does not parse.
 */

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { readJsonc } from '../support/jsonc.ts'
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
    const diagnostics: Diagnostic[] = []

    for (const file of configs) {
      const read = await readJsonc(ctx, file)
      if (read === null) continue
      if ('error' in read) {
        diagnostics.push({
          severity: 'warning',
          message: `unparseable ${file}: ${read.error}`,
          source: file,
        })
        continue
      }
      const parsed = read.value
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
      diagnostics,
    }
  },
}
