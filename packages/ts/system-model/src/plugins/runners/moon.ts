/**
 * moon — https://moonrepo.dev
 *
 * A runner that must run its tool, like sbt and mise. moon owns a build graph
 * with task inheritance (`.moon/tasks/*.yml` applies tasks to projects by
 * language, layer, stack or tag), so a project's task is often declared far
 * from it. Reading the yml files would mean copying moon's inheritance rules
 * and getting them slightly wrong. `moon query` asks moon instead.
 *
 * That runs the repo's own toolchain configuration, so this is
 * `kind: "exec"` and is left out unless the caller opts in.
 *
 * `moonDescribe` asks moon for its projects once at detect time, when
 * execution is allowed, so a profile holds each project's id and role. The
 * runner asks again: it needs each project's source directory with its tasks,
 * and a cached profile may be older than the moon config.
 */

import { stderrOrError } from '@osdlc/command-seam'

import type { ProviderContext } from '../../contract.ts'
import {
  evidence,
  type Diagnostic,
  type ProviderResult,
  type RunnerBrand,
  type Task,
} from '../../model.ts'
import type { RunnerRole, ToolFact } from '../../tool.ts'
import { afterSeparator, looksPersistent, taskId, tierOf } from '../support/shared.ts'

const CHAIN = [
  { label: 'runner', hint: 'moon owns the build graph, its cache and task inheritance.' },
  {
    label: 'directory',
    hint: 'The directory the project sits in. A grouping this catalog adds, not part of the command — a flat list of project names does not scan.',
  },
  {
    label: 'project',
    hint: 'The moon project id — the half before the colon in `moon run <project>:<task>`.',
  },
  {
    label: 'task',
    hint: 'The task id — the half after the colon. Tasks may be inherited from .moon/tasks/ as well as declared per project.',
  },
]

interface MoonTask {
  id: string
  target?: string
  command?: string
  args?: string[]
  script?: string
  type?: string
  preset?: string
  options?: { internal?: boolean; persistent?: boolean }
}

interface MoonProject {
  id: string
  source: string
  layer?: string
  stack?: string
  language?: string
  config?: { tags?: string[] }
}

/**
 * moonrepo's moon mark, a trademark of moonrepo, used here only to identify
 * the tool. Icon path and color: simple-icons
 * v16 (CC0), slug `moonrepo`.
 */
const BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M 19.514 7.342 C 19.711 7.862 19.814 8.413 19.816 8.969 C 19.816 12.494 15.998 14.697 12.946 12.934 C 11.529 12.116 10.657 10.605 10.657 8.969 C 10.657 5.646 14.085 3.431 17.115 4.793 C 15.26 3.373 12.99 2.607 10.655 2.612 C 4.772 2.614 0.005 7.381 0 13.265 C 0.002 19.148 4.772 23.918 10.655 23.92 C 16.538 23.916 21.306 19.147 21.31 13.265 C 21.312 11.155 20.687 9.095 19.514 7.342 Z M 14.841 4.666 C 14.841 8.191 18.657 10.395 21.709 8.632 C 23.127 7.814 24 6.302 24 4.666 C 24 1.14 20.184 -1.061 17.13 0.699 C 15.714 1.519 14.841 3.03 14.841 4.666"/></svg>',
  color: '#6f53f3',
}

export const moonRunner: RunnerRole = {
  kind: 'exec',
  // A first `moon query` can install a toolchain.
  probe: { timeoutMs: 120_000, cost: 'slow' },
  chain: CHAIN,
  brand: BRAND,
  // moon merges every project's `moon.yml` and the `.moon/tasks/` layer into
  // the task list; none of them are read here.
  watch: ['moon.yml', '/.moon/tasks/'],

  async collect(ctx): Promise<ProviderResult> {
    const runner = ctx.runner('moon')
    // MOON_JSON, not `--json`: moon 2.x moved the JSON switch to the environment.
    const env = { MOON_JSON: 'true' }

    const tasksRes = await runner.run(['query', 'tasks'], {
      cwd: ctx.root,
      env,
      signal: ctx.signal,
    })
    if (tasksRes.exitCode !== 0) {
      return {
        status: 'error',
        tasks: [],
        diagnostics: [{ severity: 'error', message: probeError(stderrOrError(tasksRes)) }],
      }
    }

    let parsed: { tasks?: Record<string, Record<string, MoonTask>> }
    try {
      parsed = JSON.parse(tasksRes.stdout)
    } catch (err) {
      return {
        status: 'error',
        tasks: [],
        diagnostics: [
          { severity: 'error', message: `unparseable \`moon query tasks\` output: ${String(err)}` },
        ],
      }
    }

    const diagnostics: Diagnostic[] = []
    const meta = await projectMeta(ctx, env, diagnostics)

    const tasks: Task[] = []
    for (const [projectId, projectTasks] of Object.entries(parsed.tasks ?? {})) {
      const m = meta.get(projectId)
      const tier = tierOf(m?.source ?? '.')
      for (const task of Object.values(projectTasks)) {
        // Internal tasks exist only as dependencies; nobody types them.
        if (task.options?.internal) continue
        const target = task.target ?? `${projectId}:${task.id}`
        const argv = ['moon', 'run', target]
        tasks.push({
          id: taskId('moon', m?.source ?? '.', target),
          runner: 'moon',
          path: ['moon', tier, projectId, task.id],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: m?.source === undefined || m.source === '.' ? 'moon.yml' : `${m.source}/moon.yml`,
          origin: 'declared',
          detail: describeTask(task, ctx.root),
          tags: unique(
            [
              'moon',
              task.type,
              m?.layer,
              m?.stack,
              m?.language,
              task.preset,
              ...(m?.tags ?? []),
            ].filter((t): t is string => Boolean(t) && t !== 'unknown'),
          ),
          persistent: task.options?.persistent
            ? { value: true, declared: true }
            : { value: looksPersistent(task.id), declared: false },
          executes: 'local',
        })
      }
    }

    return {
      status: 'ok',
      tasks,
      diagnostics,
    }
  },

  // Arguments after `--` reach the task, not the tool.
  invoke: afterSeparator,
}

/** Project metadata is optional: a failure loses tags and grouping, not tasks. */
async function projectMeta(
  ctx: ProviderContext,
  env: Record<string, string>,
  diagnostics: Diagnostic[],
): Promise<
  Map<string, { source: string; layer?: string; stack?: string; language?: string; tags: string[] }>
> {
  const meta = new Map<
    string,
    { source: string; layer?: string; stack?: string; language?: string; tags: string[] }
  >()
  const res = await ctx
    .runner('moon')
    .run(['query', 'projects'], { cwd: ctx.root, env, signal: ctx.signal })
  if (res.exitCode !== 0) {
    diagnostics.push({
      severity: 'warning',
      message: 'moon project metadata unavailable; tasks are grouped without it',
    })
    return meta
  }
  try {
    const parsed = JSON.parse(res.stdout) as { projects?: MoonProject[] }
    for (const p of parsed.projects ?? []) {
      meta.set(p.id, {
        source: p.source,
        ...(p.layer !== undefined ? { layer: p.layer } : {}),
        ...(p.stack !== undefined ? { stack: p.stack } : {}),
        ...(p.language !== undefined ? { language: p.language } : {}),
        tags: p.config?.tags ?? [],
      })
    }
  } catch {
    diagnostics.push({ severity: 'warning', message: 'moon project metadata was unparseable' })
  }
  return meta
}

/**
 * What a moon task runs. moon has no task descriptions, so this is used
 * instead.
 *
 * moon expands `$workspaceRoot` before reporting, so the line holds this
 * machine's absolute path. It is made relative again. An absolute path is
 * noise in every view, and it takes fuzzy-search matches that belong to real
 * command names.
 */
function describeTask(task: MoonTask, root: string): string {
  const raw = task.script ?? [task.command ?? '', ...(task.args ?? [])].join(' ')
  return raw.split(`${root}/`).join('').split(root).join('.').trim()
}

/**
 * A moon call's stderr without its log lines: the whole diagnostic, not its
 * first line. moon reports errors through miette. The first line names only
 * the error class, and the details needed to act on it are in the lines
 * below.
 */
function probeError(stderr: string): string {
  const lines = stderr
    .split('\n')
    .filter((l) => !/^\s*\[\s*(WARN|INFO|DEBUG|TRACE)\b/.test(l))
    .map((l) => l.replace(/\s+$/, ''))
  const text = lines
    .map((l) => l.replace(/^\s*[|│╭╰─>×]+\s?/, '  '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return (text || 'unknown failure').slice(0, 2000)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

/**
 * moon's view of one project directory, from `moon query projects`.
 *
 * @experimental
 */
export interface MoonProjectFact {
  /** moon's project id, which may differ from the manifest's name. */
  id: string
  layer?: string
  stack?: string
  language?: string
}

/**
 * Each moon project's id and role. Asks moon only when execution is allowed.
 * A failure gives no facts, not an error, because detection must not fail
 * when a tool fails.
 */
export async function moonDescribe(ctx: ProviderContext): Promise<ToolFact[]> {
  if (!ctx.allowExec) return []
  const res = await ctx.runner('moon').run(['query', 'projects'], {
    cwd: ctx.root,
    env: { MOON_JSON: 'true' },
    signal: ctx.signal,
  })
  if (res.exitCode !== 0) return []
  let parsed: { projects?: MoonProject[] }
  try {
    parsed = JSON.parse(res.stdout) as { projects?: MoonProject[] }
  } catch {
    return []
  }
  return (parsed.projects ?? []).map((p) => {
    const dir = p.source === '' ? '.' : p.source
    const fact: MoonProjectFact = {
      id: p.id,
      ...(p.layer !== undefined ? { layer: p.layer } : {}),
      ...(p.stack !== undefined ? { stack: p.stack } : {}),
      ...(p.language !== undefined ? { language: p.language } : {}),
    }
    return {
      dir,
      fact,
      evidence: evidence(
        'content',
        dir === '.' ? 'moon.yml' : `${dir}/moon.yml`,
        'moon query projects',
      ),
    }
  })
}
