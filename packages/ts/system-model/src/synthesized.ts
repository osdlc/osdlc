/**
 * Role actions offered as tasks through the runner contract: installs from
 * package managers, `mise install` and `mise trust` from tool managers, and
 * arming plus each configured hook from hook managers.
 *
 * Every task is `origin: 'synthesized'`, so a filter can hide them. Each
 * group appears only when a tool with that role was detected.
 */

import type { RunnerSpec } from './collect.ts'
import type { ChainSegment, Task } from './model.ts'
import { markersOf, type Registry } from './registry.ts'
import {
  armActions,
  frozenInstallActions,
  installActions,
  rootTools,
  type ToolAction,
} from './roles.ts'
import type { ProjectProfile, RoleName } from './tool.ts'

/**
 * The runner ids of the three synthesized groups.
 *
 * @experimental
 */
export const SYNTHESIZED_RUNNERS = {
  packageManager: 'package-manager',
  toolManager: 'tool-manager',
  hookManager: 'hook-manager',
} as const

const chain = (what: string): ChainSegment[] => [
  {
    label: 'role',
    hint: `Commands the detected ${what} offer, synthesized from the files that show them.`,
  },
  { label: 'directory', hint: 'The package the command is for. `.` is the root.' },
  { label: 'tool', hint: 'The tool that runs the command.' },
  { label: 'action', hint: 'What the command does.' },
]

export function synthesizedRunners(registry: Registry, profile: ProjectProfile): RunnerSpec[] {
  const specs: RunnerSpec[] = []
  const withRole = (role: RoleName) =>
    profile.packages.filter((p) =>
      p.tools.some((t) => registry.byId.get(t.tool)?.roles[role] !== undefined),
    )
  const patternsFor = (role: RoleName) =>
    registry.tools
      .filter((t) => t.roles[role] !== undefined)
      .flatMap((t) => markersOf(t).map((m) => m.files))

  const pmPackages = withRole('packageManager')
  const runner = SYNTHESIZED_RUNNERS.packageManager
  if (profile.packages.some((p) => installActions(registry, profile, p.dir).length > 0)) {
    specs.push({
      id: runner,
      packages: pmPackages,
      patterns: patternsFor('packageManager'),
      role: {
        kind: 'parse',
        chain: chain('package managers'),
        async collect(ctx) {
          const seen = new Set<string>()
          const tasks: Task[] = []
          for (const pkg of ctx.profile.packages) {
            const plain = installActions(registry, ctx.profile, pkg.dir)
            const frozen = frozenInstallActions(registry, ctx.profile, pkg.dir)
            for (const [name, list] of [
              ['install', plain],
              ['install-frozen', frozen],
            ] as const) {
              for (const action of list) {
                const key = `${action.dir}\0${action.argv.join('\0')}`
                if (seen.has(key)) continue
                seen.add(key)
                const inDir = registry.byId.get(action.tool)?.roles.packageManager?.inDir
                tasks.push(synthTask(runner, action, name, inDir))
              }
            }
          }
          return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics: [] }
        },
      },
    })
  }

  const tms = rootTools(registry, profile, 'toolManager')
  if (tms.length > 0) {
    const id = SYNTHESIZED_RUNNERS.toolManager
    specs.push({
      id,
      packages: withRole('toolManager'),
      patterns: patternsFor('toolManager'),
      role: {
        kind: 'parse',
        chain: chain('tool managers'),
        async collect() {
          const tasks: Task[] = []
          for (const { def, detected } of tms) {
            const role = def.roles.toolManager!
            const source = detected.evidence[0]!.source
            if (role.install)
              tasks.push(synthTask(id, act(def.id, [...role.install], source), 'install'))
            if (role.trust) tasks.push(synthTask(id, act(def.id, [...role.trust], source), 'trust'))
          }
          return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics: [] }
        },
      },
    })
  }

  const hms = rootTools(registry, profile, 'hookManager')
  if (hms.length > 0) {
    const id = SYNTHESIZED_RUNNERS.hookManager
    specs.push({
      id,
      packages: withRole('hookManager'),
      patterns: patternsFor('hookManager'),
      role: {
        kind: 'parse',
        chain: chain('hook managers'),
        async collect(ctx) {
          const tasks: Task[] = []
          // Named `arm`, not `install`, so it is not confused with a package
          // manager's install.
          for (const action of armActions(registry, ctx.profile)) {
            tasks.push(synthTask(id, action, 'arm'))
          }
          for (const { def, detected } of hms) {
            const read = def.roles.hookManager!.hooks
            if (read === undefined) continue
            const config = detected.evidence[0]!.source
            for (const hook of await read(ctx, config)) {
              tasks.push({
                ...synthTask(id, act(def.id, hook.argv, hook.source), hook.name),
                tags: [id, def.id, 'git-hook'],
              })
            }
          }
          return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics: [] }
        },
      },
    })
  }
  return specs
}

function act(tool: string, argv: string[], source: string): ToolAction {
  return { tool, dir: '.', argv, source }
}

/**
 * A role action as a task. The directory goes into `argv` through `inDir`
 * when the tool has a directory flag. Only a tool without one runs in `cwd`.
 */
function synthTask(
  runner: string,
  action: ToolAction,
  name: string,
  inDir?: (argv: readonly string[], dir: string) => string[],
): Task {
  const flagged = action.dir !== '.' && inDir !== undefined
  const argv = flagged ? inDir(action.argv, action.dir) : action.argv
  return {
    id: `${runner}:${action.source}:${action.tool}:${name}`,
    runner,
    path: [runner, action.dir, action.tool, name],
    argv,
    cwd: flagged ? '.' : action.dir,
    display: argv.join(' '),
    parameters: [],
    source: action.source,
    origin: 'synthesized',
    tags: [runner, action.tool, ...(action.ecosystem ? [action.ecosystem] : []), action.dir],
    persistent: { value: false, declared: false },
    executes: 'local',
  }
}
