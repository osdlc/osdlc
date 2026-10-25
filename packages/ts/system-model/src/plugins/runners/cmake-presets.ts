/**
 * CMake presets: the configure, build and test presets of a
 * `CMakePresets.json` and a `CMakeUserPresets.json`, with the files their
 * `include` lists.
 *
 * `CMakeUserPresets.json` includes `CMakePresets.json` without saying so, as
 * CMake does. An include path is relative to the file that names it; one
 * outside the repository is not read. A `hidden` preset exists only to be
 * inherited and is not a task. Package and workflow presets are not read.
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
        if (files.includes(file)) await load(ctx, file, seen, presets, diagnostics)
      }

      const ids = new Map<string, string>()
      for (const [kind, byName] of presets) {
        for (const [name, p] of byName)
          ids.set(`${kind}:${name}`, taskId('cmake-presets', p.source, `${kind}:${name}`))
      }
      for (const { kind } of KINDS) {
        for (const [name, p] of presets.get(kind)!) {
          if (p.def['hidden'] === true) continue
          const argv =
            kind === 'configure'
              ? dir === '.'
                ? ['cmake', '--preset', name]
                : ['cmake', '-S', dir, '--preset', name]
              : kind === 'build'
                ? ['cmake', '--build', '--preset', name]
                : ['ctest', '--preset', name]
          const configure =
            kind === 'configure'
              ? undefined
              : inherited(presets.get(kind)!, name, 'configurePreset')
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
            tags: ['cmake-presets', dir, kind],
            persistent: { value: false, declared: false },
            executes: 'local',
          })
        }
      }
    }
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics }
  },
}

/** Read `file` and every file it includes, once each, into `presets`. */
async function load(
  ctx: ProviderContext,
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
    const target = posix.normalize(posix.join(dirOf(file), inc))
    if (posix.isAbsolute(inc) || target === '..' || target.startsWith('../')) {
      diagnostics.push({
        severity: 'warning',
        message: `include ${inc} is outside the repository and was not read`,
        source: file,
      })
      continue
    }
    await load(ctx, target, seen, presets, diagnostics)
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

/** `field` of preset `name`, or of the first preset it inherits from that sets it. */
function inherited(byName: Map<string, Preset>, name: string, field: string): unknown {
  const visit = (at: string, path: Set<string>): unknown => {
    if (path.has(at)) return undefined
    const def = byName.get(at)?.def
    if (def === undefined) return undefined
    if (def[field] !== undefined) return def[field]
    const parents = def['inherits']
    for (const parent of typeof parents === 'string'
      ? [parents]
      : Array.isArray(parents)
        ? parents
        : []) {
      if (typeof parent !== 'string') continue
      const found = visit(parent, new Set([...path, at]))
      if (found !== undefined) return found
    }
    return undefined
  }
  return visit(name, new Set())
}
