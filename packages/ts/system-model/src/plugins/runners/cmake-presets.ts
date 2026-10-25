/**
 * CMake presets: the configure, build and test presets of a
 * `CMakePresets.json` and a `CMakeUserPresets.json`, with the files their
 * `include` lists.
 *
 * `CMakeUserPresets.json` includes `CMakePresets.json` without saying so, as
 * CMake does. An include path is relative to the file that names it, after
 * `${sourceDir}` and `${fileDir}` are expanded; one outside the repository is
 * not read, and one with any other macro is skipped with a diagnostic. A
 * `hidden` preset exists only to be inherited and is not a task. A preset
 * whose `condition` is false on this host is not listed; a condition this
 * runner cannot evaluate leaves the preset listed and tagged `conditional`.
 * Package and workflow presets are not read.
 *
 * An `inherits` walk visits each preset once per field. It stops at
 * {@link MAX_INHERIT_DEPTH} levels or {@link MAX_INHERIT_NODES} presets, with
 * a diagnostic, so an untrusted file cannot stall detection. A preset's own
 * value is always read, even past the cap.
 *
 * Commands: `cmake --preset <name>` configures, `cmake --build --preset
 * <name>` builds and `ctest --preset <name>` tests. Configure names its
 * source directory with `-S`. The build and test commands have no such flag
 * and read the presets of the directory they run in, so `cwd` is the
 * presets' directory. A build or test preset depends on its
 * `configurePreset`, its own or inherited.
 */

import { posix } from 'node:path'

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dependencies, dirOf, isTable, joinRel, taskId } from '../support/shared.ts'

export const PRESETS_FILE = 'CMakePresets.json'
export const USER_PRESETS_FILE = 'CMakeUserPresets.json'

const CHAIN = [
  {
    label: 'runner',
    hint: 'CMake configures, builds and tests from the presets a project declares.',
  },
  { label: 'project', hint: 'The directory holding the presets files. `.` is the root.' },
  { label: 'kind', hint: 'The preset kind: configure, build or test.' },
  { label: 'preset', hint: "The preset's `name`." },
]

/** CMake's mark. Icon path and color: simple-icons v16 (CC0-1.0), slug `cmake`. */
export const CMAKE_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.769.066L.067 23.206l12.76-10.843zM23.207 23.934L7.471 17.587 0 23.934zM24 23.736L12.298.463l1.719 19.24zM12.893 12.959l-5.025 4.298 5.62 2.248z"/></svg>',
  color: '#064f8c',
}

const KINDS = [
  { kind: 'configure', key: 'configurePresets' },
  { kind: 'build', key: 'buildPresets' },
  { kind: 'test', key: 'testPresets' },
] as const

type Kind = (typeof KINDS)[number]['kind']

/** The deepest `inherits` chain followed. */
export const MAX_INHERIT_DEPTH = 32

/** The most presets one directory's `inherits` walks visit in total, per field. */
export const MAX_INHERIT_NODES = 10_000

/** CMake's `${hostSystemName}`: the value `uname -s` gives, `Windows` on Windows. */
const HOST_SYSTEM =
  process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'Darwin' : 'Linux'

interface Preset {
  def: Record<string, unknown>
  source: string
}

export const cmakePresetsRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const tasks: Task[] = []
    const diagnostics: Diagnostic[] = []
    const files = [...(await ctx.files(PRESETS_FILE)), ...(await ctx.files(USER_PRESETS_FILE))]

    for (const dir of [...new Set(files.map(dirOf))].sort()) {
      const presets = new Map<Kind, Map<string, Preset>>(KINDS.map((k) => [k.kind, new Map()]))
      const seen = new Set<string>()
      // CMakePresets.json first: CMakeUserPresets.json includes it.
      for (const name of [PRESETS_FILE, USER_PRESETS_FILE]) {
        const file = joinRel(dir, name)
        if (files.includes(file)) await load(ctx, dir, file, seen, presets, diagnostics)
      }

      const budget: InheritBudget = { nodes: 0, reported: false }
      const configureOf = new Map<Kind, (name: string) => unknown>(
        KINDS.filter((k) => k.kind !== 'configure').map((k) => [
          k.kind,
          inheritance(presets.get(k.kind)!, 'configurePreset', budget),
        ]),
      )
      // CMake inherits `condition` like any other field. Its walk has its own
      // budget, so it does not halve the cap of the `configurePreset` walk.
      const conditionBudget: InheritBudget = { nodes: 0, reported: false }
      const conditionOf = new Map<Kind, (name: string) => unknown>(
        KINDS.map((k) => [k.kind, inheritance(presets.get(k.kind)!, 'condition', conditionBudget)]),
      )
      // One evaluation per condition object, however many presets inherit it.
      const evaluated = new Map<unknown, boolean | undefined>()
      const ids = new Map<string, string>()
      for (const [kind, byName] of presets) {
        for (const [name, p] of byName)
          ids.set(`${kind}:${name}`, taskId('cmake-presets', p.source, `${kind}:${name}`))
      }
      for (const { kind } of KINDS) {
        for (const [name, p] of presets.get(kind)!) {
          if (p.def['hidden'] === true) continue
          const raw = conditionOf.get(kind)!(name)
          if (!evaluated.has(raw)) evaluated.set(raw, evaluate(raw))
          const condition = evaluated.get(raw)
          if (condition === false) continue
          const argv =
            kind === 'configure'
              ? dir === '.'
                ? ['cmake', '--preset', name]
                : ['cmake', '-S', dir, '--preset', name]
              : kind === 'build'
                ? ['cmake', '--build', '--preset', name]
                : ['ctest', '--preset', name]
          const configure = configureOf.get(kind)?.(name)
          const doc = [p.def['displayName'], p.def['description']].find(
            (d): d is string => typeof d === 'string' && d !== '',
          )
          tasks.push({
            id: ids.get(`${kind}:${name}`)!,
            runner: 'cmake-presets',
            path: ['cmake-presets', dir, kind, name],
            argv,
            cwd: kind === 'configure' ? '.' : dir,
            display: argv.join(' '),
            parameters: [],
            source: p.source,
            origin: 'declared',
            ...(doc === undefined ? {} : { doc }),
            ...dependencies(typeof configure === 'string' ? [configure] : [], (dep) => {
              const target = presets.get('configure')!.get(dep)
              return target === undefined || target.def['hidden'] === true
                ? undefined
                : ids.get(`configure:${dep}`)
            }),
            tags: ['cmake-presets', dir, kind, ...(condition === undefined ? ['conditional'] : [])],
            persistent: { value: false, declared: false },
            executes: 'local',
          })
        }
      }
      if (budget.reported || conditionBudget.reported) {
        diagnostics.push({
          severity: 'warning',
          message: `a preset's inherits chain is deeper than ${MAX_INHERIT_DEPTH} levels or visits more than ${MAX_INHERIT_NODES} presets, so it was cut short`,
          source: joinRel(dir, PRESETS_FILE),
        })
      }
    }
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics }
  },
}

/** Read `file` and every file it includes, once each, into `presets`. */
async function load(
  ctx: ProviderContext,
  sourceDir: string,
  file: string,
  seen: Set<string>,
  presets: Map<Kind, Map<string, Preset>>,
  diagnostics: Diagnostic[],
): Promise<void> {
  if (seen.has(file)) return
  seen.add(file)
  const doc = await ctx.readJson(file)
  if (!isTable(doc)) {
    const message = (await ctx.exists(file))
      ? 'unparseable CMake presets file'
      : 'an included presets file does not exist'
    diagnostics.push({ severity: 'warning', message, source: file })
    return
  }
  for (const inc of Array.isArray(doc['include']) ? doc['include'] : []) {
    if (typeof inc !== 'string') continue
    // `${sourceDir}` and `${fileDir}` are absolute in CMake. Here they stand
    // for root-relative directories, so the root check below still applies.
    const expanded = inc
      .replaceAll('${sourceDir}', sourceDir === '.' ? '' : sourceDir)
      .replaceAll('${fileDir}', dirOf(file) === '.' ? '' : dirOf(file))
    // An expanded macro makes the path root-relative.
    const fromRoot = expanded !== inc
    const relative = fromRoot ? expanded.replace(/^\/+/, '') : expanded
    if (relative.includes('$')) {
      diagnostics.push({
        severity: 'warning',
        message: `include ${inc} uses a macro this runner does not expand, so it was not read`,
        source: file,
      })
      continue
    }
    const target = posix.normalize(posix.join(fromRoot ? '.' : dirOf(file), relative))
    if (posix.isAbsolute(relative) || target === '..' || target.startsWith('../')) {
      diagnostics.push({
        severity: 'warning',
        message: `include ${inc} is outside the repository and was not read`,
        source: file,
      })
      continue
    }
    await load(ctx, sourceDir, target, seen, presets, diagnostics)
  }
  for (const { kind, key } of KINDS) {
    const byName = presets.get(kind)!
    for (const def of Array.isArray(doc[key]) ? doc[key] : []) {
      if (!isTable(def) || typeof def['name'] !== 'string') continue
      const name = def['name']
      if (byName.has(name)) {
        diagnostics.push({
          severity: 'warning',
          message: `${kind} preset ${name} is declared twice; the first was kept`,
          source: file,
        })
        continue
      }
      byName.set(name, { def, source: file })
    }
  }
}

interface InheritBudget {
  nodes: number
  reported: boolean
}

/**
 * A lookup of `field` for a preset name: its own value, or that of the first
 * preset it inherits from that sets it, depth first in `inherits` order.
 * Each preset's answer is computed once, so a diamond-shaped graph is walked
 * in linear time. A cycle gives no value. `budget` caps the depth and the
 * total presets visited.
 */
function inheritance(
  byName: Map<string, Preset>,
  field: string,
  budget: InheritBudget,
): (name: string) => unknown {
  const memo = new Map<string, unknown>()
  const active = new Set<string>()
  const visit = (at: string, depth: number): unknown => {
    if (memo.has(at)) return memo.get(at)
    if (active.has(at)) return undefined
    const def = byName.get(at)?.def
    // A preset's own value needs no walk, so the cap never hides it.
    if (def !== undefined && def[field] !== undefined) {
      memo.set(at, def[field])
      return def[field]
    }
    if (depth > MAX_INHERIT_DEPTH || budget.nodes >= MAX_INHERIT_NODES) {
      budget.reported = true
      return undefined
    }
    budget.nodes++
    let found: unknown
    if (def !== undefined) {
      active.add(at)
      const parents = def['inherits']
      for (const parent of typeof parents === 'string'
        ? [parents]
        : Array.isArray(parents)
          ? parents
          : []) {
        if (typeof parent !== 'string') continue
        found = visit(parent, depth + 1)
        if (found !== undefined) break
      }
      active.delete(at)
    }
    memo.set(at, found)
    return found
  }
  return (name) => visit(name, 0)
}

/**
 * A preset `condition`: `true`, `false`, or `undefined` when it uses a form
 * or a macro this runner cannot evaluate. No condition is `true`. Macros
 * other than `${hostSystemName}` are not expanded.
 */
export function evaluate(condition: unknown, depth = 0): boolean | undefined {
  if (condition === undefined || condition === null) return true
  if (typeof condition === 'boolean') return condition
  if (!isTable(condition) || depth > MAX_INHERIT_DEPTH) return undefined
  const str = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined
    const out = v.replaceAll('${hostSystemName}', HOST_SYSTEM)
    return out.includes('$') ? undefined : out
  }
  const not = (v: boolean | undefined) => (v === undefined ? undefined : !v)
  switch (condition['type']) {
    case 'const':
      return typeof condition['value'] === 'boolean' ? condition['value'] : undefined
    case 'equals':
    case 'notEquals': {
      const lhs = str(condition['lhs'])
      const rhs = str(condition['rhs'])
      if (lhs === undefined || rhs === undefined) return undefined
      return condition['type'] === 'equals' ? lhs === rhs : lhs !== rhs
    }
    case 'inList':
    case 'notInList': {
      const value = str(condition['string'])
      const list = Array.isArray(condition['list']) ? condition['list'].map(str) : undefined
      if (value === undefined || list === undefined || list.includes(undefined)) return undefined
      const hit = list.includes(value)
      return condition['type'] === 'inList' ? hit : !hit
    }
    case 'not':
      return not(evaluate(condition['condition'], depth + 1))
    case 'anyOf':
    case 'allOf': {
      if (!Array.isArray(condition['conditions'])) return undefined
      const results = condition['conditions'].map((c) => evaluate(c, depth + 1))
      if (condition['type'] === 'anyOf') {
        if (results.includes(true)) return true
        return results.includes(undefined) ? undefined : false
      }
      if (results.includes(false)) return false
      return results.includes(undefined) ? undefined : true
    }
    default:
      return undefined
  }
}
