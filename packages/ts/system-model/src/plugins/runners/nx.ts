/**
 * Nx: the targets a workspace declares, read from files.
 *
 * A project is a directory with a `project.json`, or a `package.json` with an
 * `nx` field. Its targets are `project.json`'s `targets` and `package.json`'s
 * `nx.targets`; for a name in both, project.json wins. Its name is the
 * `name` in project.json, then in package.json, then the directory's name.
 * `nx.json`'s `targetDefaults` give a target its `dependsOn` when it declares
 * none, matched by target name and then by executor.
 *
 * Targets that Nx plugins infer (from a `vite.config.ts`, a package.json
 * script, ...) are not listed: only Nx's project graph knows them, and
 * building it runs the workspace's plugins and the Nx daemon.
 */

import type { RunnerContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import {
  afterSeparator,
  dependencies,
  dirOf,
  isTable,
  joinRel,
  looksPersistent,
  taskId,
} from '../support/shared.ts'

export const NX_JSON = 'nx.json'

const CHAIN = [
  { label: 'runner', hint: 'Nx runs the targets its projects declare.' },
  { label: 'project', hint: 'The Nx project name.' },
  { label: 'target', hint: "A key under the project's `targets`." },
]

/** Nx's mark. Icon path and color: simple-icons v16 (CC0-1.0), slug `nx`. */
export const NX_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.987 14.138l-3.132 4.923-5.193-8.427-.012 8.822H0V4.544h3.691l5.247 8.833.005-3.998 3.044 4.759zm.601-5.761c.024-.048 0-3.784.008-3.833h-3.65c.002.059-.005 3.776-.003 3.833h3.645zm5.634 4.134a2.061 2.061 0 0 0-1.969 1.336 1.963 1.963 0 0 1 2.343-.739c.396.161.917.422 1.33.283a2.1 2.1 0 0 0-1.704-.88zm3.39 1.061c-.375-.13-.8-.277-1.109-.681-.06-.08-.116-.17-.176-.265a2.143 2.143 0 0 0-.533-.642c-.294-.216-.68-.322-1.18-.322a2.482 2.482 0 0 0-2.294 1.536 2.325 2.325 0 0 1 4.002.388.75.75 0 0 0 .836.334c.493-.105.46.36 1.203.518v-.133c-.003-.446-.246-.55-.75-.733zm2.024 1.266a.723.723 0 0 0 .347-.638c-.01-2.957-2.41-5.487-5.37-5.487a5.364 5.364 0 0 0-4.487 2.418c-.01-.026-1.522-2.39-1.538-2.418H8.943l3.463 5.423-3.379 5.32h3.54l1.54-2.366 1.568 2.366h3.541l-3.21-5.052a.7.7 0 0 1-.084-.32 2.69 2.69 0 0 1 2.69-2.691h.001c1.488 0 1.736.89 2.057 1.308.634.826 1.9.464 1.9 1.541a.707.707 0 0 0 1.066.596zm.35.133c-.173.372-.56.338-.755.639-.176.271.114.412.114.412s.337.156.538-.311c.104-.231.14-.488.103-.74z"/></svg>',
  color: '#143055',
}

interface Target {
  name: string
  def: Record<string, unknown>
  source: string
}

interface Project {
  name: string
  dir: string
  targets: Target[]
}

export const nxRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: RunnerContext): Promise<ProviderResult> {
    const diagnostics: Diagnostic[] = []
    const nxJson = await ctx.readJson(NX_JSON)
    if (nxJson === null) {
      if (await ctx.exists(NX_JSON)) {
        diagnostics.push({ severity: 'warning', message: 'unparseable nx.json', source: NX_JSON })
      }
      return { status: 'absent', tasks: [], diagnostics }
    }
    const defaults =
      isTable(nxJson) && isTable(nxJson['targetDefaults']) ? nxJson['targetDefaults'] : {}
    const projects = await readProjects(ctx, diagnostics)

    const ids = new Map<string, string>()
    for (const p of projects) {
      for (const t of p.targets) ids.set(`${p.name}:${t.name}`, taskId('nx', t.source, t.name))
    }

    const tasks: Task[] = []
    for (const p of projects) {
      for (const t of p.targets) {
        const argv = ['nx', 'run', `${p.name}:${t.name}`]
        const executor = typeof t.def['executor'] === 'string' ? t.def['executor'] : undefined
        const fallback = [t.name, executor].map((k) => (k === undefined ? undefined : defaults[k]))
        const declared =
          t.def['dependsOn'] ??
          fallback
            .map((d) => (isTable(d) ? d['dependsOn'] : undefined))
            .find((d) => d !== undefined)
        const continuous = t.def['continuous'] === true
        tasks.push({
          id: taskId('nx', t.source, t.name),
          runner: 'nx',
          path: ['nx', p.name, t.name],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: t.source,
          origin: 'declared',
          ...detailOf(t.def, executor),
          ...dependencies(depNames(declared, p.name), (dep) => ids.get(dep)),
          tags: ['nx', p.dir],
          persistent: {
            value: continuous || looksPersistent(t.name),
            declared: continuous,
          },
          executes: 'local',
        })
      }
    }
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics }
  },

  // Arguments after `--` reach the target, not nx.
  invoke: afterSeparator,
}

/** Every project with declared targets, sorted by directory. */
async function readProjects(ctx: RunnerContext, diagnostics: Diagnostic[]): Promise<Project[]> {
  const files = [...(await ctx.files('project.json')), ...(await ctx.files('package.json'))]
  const dirs = [...new Set(files.map(dirOf))].sort()
  const out: Project[] = []
  for (const dir of dirs) {
    const projectFile = joinRel(dir, 'project.json')
    const packageFile = joinRel(dir, 'package.json')
    const project = files.includes(projectFile)
      ? await readTable(ctx, projectFile, diagnostics)
      : undefined
    const pkg = files.includes(packageFile) ? await ctx.readJson(packageFile) : null
    const nx = isTable(pkg) && isTable(pkg['nx']) ? pkg['nx'] : undefined
    if (project === undefined && nx === undefined) continue

    const targets = new Map<string, Target>()
    const add = (table: unknown, source: string): void => {
      if (!isTable(table)) return
      for (const [name, def] of Object.entries(table)) {
        if (!targets.has(name) && isTable(def)) targets.set(name, { name, def, source })
      }
    }
    add(project?.['targets'], projectFile)
    add(nx?.['targets'], packageFile)
    if (targets.size === 0) continue

    const name = [project?.['name'], nx?.['name'], isTable(pkg) ? pkg['name'] : undefined].find(
      (n): n is string => typeof n === 'string' && n !== '',
    )
    out.push({
      name: name ?? (dir === '.' ? baseName(ctx.root) : baseName(dir)),
      dir,
      targets: [...targets.values()],
    })
  }
  return out
}

async function readTable(
  ctx: RunnerContext,
  file: string,
  diagnostics: Diagnostic[],
): Promise<Record<string, unknown> | undefined> {
  const value = await ctx.readJson(file)
  if (isTable(value)) return value
  diagnostics.push({ severity: 'warning', message: 'unparseable project.json', source: file })
  return undefined
}

/**
 * `dependsOn` entries as `project:target` names, or as written when they name
 * no one task: `build` is the same project's, `^build` is every dependency's,
 * and `{ target, projects }` names projects outright.
 */
function depNames(dependsOn: unknown, project: string): string[] {
  if (!Array.isArray(dependsOn)) return []
  const out: string[] = []
  for (const dep of dependsOn) {
    if (typeof dep === 'string') {
      if (dep.startsWith('^')) out.push(dep)
      else out.push(dep.includes(':') ? dep : `${project}:${dep}`)
      continue
    }
    if (!isTable(dep) || typeof dep['target'] !== 'string') continue
    const target = dep['target']
    const projects = dep['projects']
    if (dep['dependencies'] === true) out.push(`^${target}`)
    else if (projects === undefined || projects === 'self') out.push(`${project}:${target}`)
    else if (typeof projects === 'string') out.push(`${projects}:${target}`)
    else if (Array.isArray(projects)) {
      for (const p of projects) if (typeof p === 'string') out.push(`${p}:${target}`)
    }
  }
  return out
}

function detailOf(def: Record<string, unknown>, executor: string | undefined): { detail?: string } {
  const options = isTable(def['options']) ? def['options'] : {}
  const command = def['command'] ?? options['command']
  if (typeof command === 'string') return { detail: command }
  const commands = options['commands']
  if (Array.isArray(commands)) {
    const text = commands
      .map((c) => (typeof c === 'string' ? c : isTable(c) ? c['command'] : undefined))
      .filter((c): c is string => typeof c === 'string')
    if (text.length > 0) return { detail: text.join('; ') }
  }
  return executor === undefined ? {} : { detail: executor }
}

function baseName(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .filter((s) => s !== '')
      .pop() ?? path
  )
}
