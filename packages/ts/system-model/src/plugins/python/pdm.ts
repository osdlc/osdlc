/**
 * PDM: the scripts under `[tool.pdm.scripts]` in a pyproject.toml.
 *
 * A script is a string (a `cmd`) or a table with one of `cmd`, `shell`,
 * `call` or `composite`, and an optional `help`. The `_` key holds options
 * shared by every script, and a name starting with `_` is internal; neither
 * is listed. `pre_<name>` runs before `<name>`, so it fills `dependsOn`.
 * Extra arguments are appended, which is how `pdm run` passes them.
 */

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dependencies, dirOf, isTable, looksPersistent, taskId } from '../support/shared.ts'
import { PYPROJECT_TOML } from './ecosystem.ts'
import { readConfig, tableAt } from './read-config.ts'

const CHAIN = [
  { label: 'runner', hint: 'PDM runs the scripts under `tool.pdm.scripts`.' },
  { label: 'project', hint: 'The directory holding the pyproject.toml. `.` is the root.' },
  { label: 'script', hint: 'The key under `tool.pdm.scripts`.' },
]

/** PDM's mark. Icon path and color: simple-icons v16 (CC0-1.0), slug `pdm`. */
export const PDM_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.44.418a3.12 3.12 0 0 1 3.12 0l7.69 4.44a3.12 3.12 0 0 1 1.56 2.702v8.88a3.12 3.12 0 0 1-1.56 2.702l-7.69 4.44a3.12 3.12 0 0 1-3.12 0l-7.69-4.44a3.12 3.12 0 0 1-1.56-2.702V7.56a3.12 3.12 0 0 1 1.56-2.702Zm3.87 3.315L12.311 2.58a.624.624 0 0 0-.624 0l-7.69 4.44a.624.624 0 0 0-.312.54v3.774l10.623-6.133Zm2.496 13.643 1.255.725 1.941-1.12a.624.624 0 0 0 .312-.541V7.56a.624.624 0 0 0-.312-.54l-3.196-1.845Zm-2.497-1.441V8.083l-6.8 3.926ZM3.686 14.217v2.223c0 .223.119.429.312.54l7.69 4.44a.624.624 0 0 0 .624 0l3.252-1.878-10.55-6.091Z"/></svg>',
  color: '#ac75d7',
}

const KINDS = ['cmd', 'shell', 'call', 'composite']

export const pdmRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const tasks: Task[] = []
    const diagnostics: Diagnostic[] = []
    for (const file of (await ctx.files(PYPROJECT_TOML)).sort()) {
      const read = await readConfig(ctx, file)
      // The python runner reports a broken pyproject.toml.
      if (read === null || 'error' in read) continue
      const scripts = tableAt(read.doc, 'tool', 'pdm', 'scripts')
      if (scripts === undefined) continue
      const dir = dirOf(file)
      const names = Object.keys(scripts).filter((name) => !name.startsWith('_'))
      for (const name of names) {
        const def = scripts[name]
        const shape = describeScript(def)
        if (shape === null) {
          diagnostics.push({
            severity: 'warning',
            message: `pdm script ${name} is not a string or a table with cmd, shell, call or composite, so it was skipped`,
            source: file,
          })
          continue
        }
        const argv = dir === '.' ? ['pdm', 'run', name] : ['pdm', 'run', '-p', dir, name]
        const pre = `pre_${name}`
        tasks.push({
          id: taskId('pdm', file, name),
          runner: 'pdm',
          path: ['pdm', dir, name],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'declared',
          ...(shape.doc === undefined ? {} : { doc: shape.doc }),
          detail: shape.detail,
          ...dependencies(names.includes(pre) ? [pre] : [], (dep) => taskId('pdm', file, dep)),
          tags: ['pdm', dir, shape.kind],
          persistent: { value: looksPersistent(name), declared: false },
          executes: 'local',
        })
      }
    }
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics }
  },
}

function describeScript(def: unknown): { kind: string; doc?: string; detail: string } | null {
  if (typeof def === 'string') return { kind: 'cmd', detail: def }
  if (!isTable(def)) return null
  const kind = KINDS.find((k) => def[k] !== undefined)
  if (kind === undefined) return null
  const body = def[kind]
  const detail = Array.isArray(body)
    ? body.map(String).join(kind === 'composite' ? '; ' : ' ')
    : String(body)
  return { kind, ...(typeof def['help'] === 'string' ? { doc: def['help'] } : {}), detail }
}
