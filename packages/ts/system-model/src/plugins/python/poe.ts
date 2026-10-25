/**
 * Poe the Poet: the tasks under `[tool.poe.tasks]` in a pyproject.toml, or in
 * a `poe_tasks.toml`, `.yaml`, `.yml` or `.json` beside it.
 *
 * Poe looks in `pyproject.toml` first and uses it when it has a `tool.poe`
 * table. Otherwise it takes the first `poe_tasks.*` file in that order, where
 * the `tool.poe` prefix is optional. This runner reads the same file per
 * directory.
 *
 * A task name starting with `_` is private and not listed. A task's `args`
 * become parameters: an option argument is a `flag` (`--host value`), a
 * `positional` one is positional, and `multiple` makes it variadic. A
 * `boolean` argument is a flag with no value, which a parameter cannot
 * express, so it is not listed. `deps` fill `dependsOn`. `include` files are
 * not read.
 */

import type { RunnerContext } from '../../contract.ts'
import type { Diagnostic, Param, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dependencies, dirOf, isTable, looksPersistent, taskId } from '../support/shared.ts'
import { PYPROJECT_TOML } from './ecosystem.ts'
import { readConfig, tableAt } from './read-config.ts'
import { inPythonEnv } from './run-through.ts'

/** The files poe reads when `pyproject.toml` has no `tool.poe`, in its search order. */
export const POE_FILES = ['poe_tasks.toml', 'poe_tasks.yaml', 'poe_tasks.yml', 'poe_tasks.json']

const CHAIN = [
  { label: 'runner', hint: 'Poe the Poet runs the tasks under `tool.poe.tasks`.' },
  { label: 'project', hint: 'The directory holding the config. `.` is the root.' },
  { label: 'task', hint: 'The key under `tasks`.' },
]

/**
 * A plain glyph: a list with a run mark. Poe the Poet has no mark in a CC0
 * icon set. Color: the Python blue.
 */
export const POE_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h11M4 12h8M4 18h6"/><path d="M15 14.5 20 17l-5 2.5Z"/></svg>',
  color: '#3776ab',
}

const TASK_TYPES = ['cmd', 'shell', 'script', 'sequence', 'ref', 'expr', 'switch', 'parallel']

export const poeRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: RunnerContext): Promise<ProviderResult> {
    const tasks: Task[] = []
    const diagnostics: Diagnostic[] = []
    const found = await Promise.all([PYPROJECT_TOML, ...POE_FILES].map((name) => ctx.files(name)))
    const byDir = new Map<string, string[]>()
    for (const file of found.flat()) {
      const list = byDir.get(dirOf(file)) ?? []
      list.push(file)
      byDir.set(dirOf(file), list)
    }

    for (const dir of [...byDir.keys()].sort()) {
      const config = await configFor(ctx, dir, byDir.get(dir)!, diagnostics)
      if (config === null) continue
      const { file, poe } = config
      if (poe['include'] !== undefined) {
        diagnostics.push({
          severity: 'info',
          message: 'poe `include` files are not read, so tasks they declare are missing',
          source: file,
        })
      }
      const table = tableAt(poe, 'tasks')
      if (table === undefined) continue

      const names = Object.keys(table).filter((name) => !name.startsWith('_'))
      for (const name of names) {
        const def = table[name]
        const shape = describeTask(def)
        if (shape === null) {
          diagnostics.push({
            severity: 'warning',
            message: `poe task ${name} is not a string, a list or a table, so it was skipped`,
            source: file,
          })
          continue
        }
        const head = dir === '.' ? ['poe'] : ['poe', '-C', dir]
        const argv = inPythonEnv(ctx, dir, [...head, name])
        const deps = isTable(def) && Array.isArray(def['deps']) ? def['deps'] : []
        tasks.push({
          id: taskId('poe', file, name),
          runner: 'poe',
          path: ['poe', dir, name],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: isTable(def) ? paramsOf(def['args']) : [],
          source: file,
          origin: 'declared',
          ...(shape.doc === undefined ? {} : { doc: shape.doc }),
          ...(shape.detail === undefined ? {} : { detail: shape.detail }),
          ...dependencies(
            deps
              .filter((d): d is string => typeof d === 'string')
              .map((d) => d.trim().split(/\s+/)[0]!),
            (dep) => (names.includes(dep) ? taskId('poe', file, dep) : undefined),
          ),
          tags: ['poe', dir, shape.type],
          persistent: { value: looksPersistent(name), declared: false },
          executes: 'local',
        })
      }
    }
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics }
  },
}

/** The `tool.poe` table poe reads in `dir`, and the file it came from. */
async function configFor(
  ctx: RunnerContext,
  dir: string,
  files: string[],
  diagnostics: Diagnostic[],
): Promise<{ file: string; poe: Record<string, unknown> } | null> {
  const ordered = [PYPROJECT_TOML, ...POE_FILES]
    .map((name) => (dir === '.' ? name : `${dir}/${name}`))
    .filter((path) => files.includes(path))
  for (const file of ordered) {
    const read = await readConfig(ctx, file)
    if (read === null) continue
    if ('error' in read) {
      // A broken file stops poe. The python runner already reports a broken
      // pyproject.toml, so only a poe_tasks file gets a diagnostic here.
      if (!file.endsWith(PYPROJECT_TOML)) {
        diagnostics.push({ severity: 'warning', message: read.error, source: file })
      }
      return null
    }
    const poe = tableAt(read.doc, 'tool', 'poe')
    if (file.endsWith(PYPROJECT_TOML)) {
      if (poe !== undefined) return { file, poe }
      continue
    }
    return { file, poe: poe ?? read.doc }
  }
  return null
}

/** The task's type, help and what it runs, or `null` for a shape poe does not accept. */
function describeTask(def: unknown): { type: string; doc?: string; detail?: string } | null {
  if (typeof def === 'string') return { type: 'cmd', detail: def }
  if (Array.isArray(def)) return { type: 'sequence', detail: def.map(itemText).join('; ') }
  if (!isTable(def)) return null
  const type = TASK_TYPES.find((t) => def[t] !== undefined) ?? 'cmd'
  const body = def[type]
  const detail =
    typeof body === 'string'
      ? body
      : Array.isArray(body)
        ? body.map(itemText).join('; ')
        : undefined
  return {
    type,
    ...(typeof def['help'] === 'string' ? { doc: def['help'] } : {}),
    ...(detail === undefined ? {} : { detail }),
  }
}

function itemText(item: unknown): string {
  if (typeof item === 'string') return item
  if (isTable(item)) {
    const type = TASK_TYPES.find((t) => typeof item[t] === 'string')
    if (type !== undefined) return item[type] as string
  }
  return '...'
}

/**
 * A task's `args` as parameters. The forms are a list of names, a list of
 * tables with `name`, and a table of tables keyed by name.
 */
function paramsOf(args: unknown): Param[] {
  const entries: Array<[string, Record<string, unknown>]> = []
  if (Array.isArray(args)) {
    for (const arg of args) {
      if (typeof arg === 'string') entries.push([arg, {}])
      else if (isTable(arg) && typeof arg['name'] === 'string') entries.push([arg['name'], arg])
    }
  } else if (isTable(args)) {
    for (const [name, arg] of Object.entries(args)) entries.push([name, isTable(arg) ? arg : {}])
  }
  const out: Param[] = []
  for (const [name, arg] of entries) {
    if (arg['type'] === 'boolean') continue
    const options = Array.isArray(arg['options'])
      ? arg['options'].filter((o): o is string => typeof o === 'string')
      : []
    const flag =
      options.find((o) => o.startsWith('--')) ?? options[0] ?? `--${name.replace(/^_/, '')}`
    const scalar = (v: unknown): string | undefined =>
      typeof v === 'string' || typeof v === 'number' ? String(v) : undefined
    const choices = Array.isArray(arg['choices'])
      ? arg['choices'].map(scalar).filter((c): c is string => c !== undefined)
      : []
    const fallback = scalar(arg['default'])
    out.push({
      name,
      required: arg['required'] === true,
      variadic: arg['multiple'] === true || typeof arg['multiple'] === 'number',
      ...(fallback === undefined ? {} : { default: fallback }),
      ...(arg['positional'] === true ? {} : { binding: { kind: 'flag' as const, flag } }),
      ...(typeof arg['help'] === 'string' ? { doc: arg['help'] } : {}),
      ...(choices.length > 0 ? { choices } : {}),
    })
  }
  return out
}
