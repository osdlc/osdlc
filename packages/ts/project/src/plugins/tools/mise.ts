/**
 * mise — https://mise.jdx.dev
 *
 * `kind: "exec"`. mise tasks come from several places at
 * once — `[tasks.*]` tables across `mise.toml`, `.mise.toml`, `mise.local.toml`
 * and `.config/mise/config.toml`, plus executable file tasks under
 * `mise-tasks/` and `.mise/tasks/` — and mise merges, layers and templates them
 * before you see the result. Reading one TOML file would report a fraction of
 * the truth. `mise tasks --json` asks the tool that knows.
 *
 * That does mean evaluating the target repository's mise configuration, which
 * can carry `[hooks]` that run commands. Correctly classified as `exec`, and so
 * withheld unless the caller opts in.
 *
 * Unlike `just`, there is no parse fallback: nothing depends on reading mise
 * without running it, and a partial answer assembled from one config file would
 * be worse than an honest absence.
 */

import { relative } from 'node:path'

import { firstLine, stderrOrError } from '@osdlc/command-seam'

import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { dirOf, looksPersistent, taskId } from '../support/shared.ts'

const CHAIN = [
  { label: 'runner', hint: 'mise runs tasks declared in its config, plus executable file tasks.' },
  {
    label: 'source',
    hint: 'The config file or task directory that declares it. `.` is the project root.',
  },
  { label: 'task', hint: 'The task name — the argument to `mise run`.' },
]

/** mise's config files at the root. A config deeper down is read by mise but not watched here. */
export const MISE_CONFIGS = [
  '/mise.toml',
  '/.mise.toml',
  '/mise.local.toml',
  '/.mise.local.toml',
  '/.config/mise/config.toml',
  '/.tool-versions',
]

/** Directories of file tasks. Any one makes a mise project with no config. */
export const MISE_TASK_DIRS = ['/mise-tasks/', '/.mise/tasks/', '/.config/mise/tasks/']

interface MiseTask {
  name: string
  description?: string
  /** Absolute path of the declaring config file, or of the file task itself. */
  source?: string
  /** Set for a file task; the script mise will execute. */
  file?: string | null
  /** Commands the task runs, one per line in the config. */
  run?: string[]
  depends?: string[]
  /** Hidden from listings — mise's equivalent of a private recipe. */
  hide?: boolean
  /** From the user's global config rather than this project. */
  global?: boolean
  /** Working directory the task declares, if any. */
  dir?: string | null
}

/**
 * Three narrowing layers, for how mise merges config files and task dirs into
 * one task set — an original glyph, kept because simple-icons has no `mise`
 * icon. Color is `--vp-c-brand-1` from mise.jdx.dev's stylesheet.
 */
const BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3.5" y="4.2" width="17" height="4" rx="1.6"/><rect x="5.5" y="10" width="13" height="4" rx="1.6"/><rect x="7.5" y="15.8" width="9" height="4" rx="1.6"/></svg>',
  color: '#8b2252',
}

export const miseRunner: RunnerRole = {
  kind: 'exec',
  chain: CHAIN,
  brand: BRAND,
  watch: [...MISE_CONFIGS, ...MISE_TASK_DIRS],

  async collect(ctx): Promise<ProviderResult> {
    const res = await ctx.runner('mise').run(['tasks', '--json'], { cwd: ctx.root })
    if (res.exitCode !== 0) {
      // An untrusted config is the common case, and it is a diagnostic rather
      // than a failure: mise declines to read a config it has not been told to
      // trust, which is the tool working correctly.
      const message = firstLine(stderrOrError(res), 'unknown failure')
      return {
        status: 'error',
        tasks: [],
        diagnostics: [
          {
            severity: 'error',
            message: /trust/i.test(message)
              ? `${message} — run \`mise trust\` in this directory to allow it`
              : message,
          },
        ],
      }
    }

    let parsed: MiseTask[]
    try {
      parsed = JSON.parse(res.stdout) as MiseTask[]
    } catch (err) {
      return {
        status: 'error',
        tasks: [],
        diagnostics: [
          {
            severity: 'error',
            message: `unparseable \`mise tasks --json\` output: ${String(err)}`,
          },
        ],
      }
    }

    const diagnostics: Diagnostic[] = []
    const tasks: Task[] = []
    let skippedGlobal = 0

    for (const task of parsed) {
      if (task.hide) continue
      // A global task lives in the user's own config and follows them between
      // repositories. It is real, but it is not this project's, and listing it
      // as though it were would make the catalog a description of the machine.
      if (task.global) {
        skippedGlobal++
        continue
      }
      const source = sourceOf(task, ctx.root)
      // `-C <dir>` rather than a cwd, per the policy on Task.cwd: `mise run`
      // finds tasks by walking up from where it starts, so a nested task's
      // command fails outright when pasted at the repository root. The task's
      // own `dir` is NOT what goes here — mise applies that itself, relative
      // to the config it loaded — this is the directory the config lives in.
      const dir = dirOf(source)
      const argv = dir === '.' ? ['mise', 'run', task.name] : ['mise', '-C', dir, 'run', task.name]
      tasks.push({
        id: taskId('mise', source, task.name),
        runner: 'mise',
        path: ['mise', dirOf(source), task.name],
        argv,
        cwd: '.',
        display: argv.join(' '),
        parameters: [],
        source,
        origin: 'declared',
        ...(task.description ? { doc: task.description } : {}),
        ...(task.run?.length ? { detail: task.run.join(' && ') } : {}),
        tags: unique(['mise', dirOf(source), ...(task.file ? ['file-task'] : [])]),
        persistent: { value: looksPersistent(task.name), declared: false },
        executes: 'local',
      })
    }

    if (skippedGlobal > 0) {
      diagnostics.push({
        severity: 'info',
        message: `${skippedGlobal} global mise task(s) omitted — they belong to your config, not this project`,
      })
    }

    return {
      status: 'ok',
      tasks,
      diagnostics,
    }
  },
}

/**
 * Where a task is declared, root-relative. `file` wins for a file task — that
 * is the script itself, which is more useful than the directory that collected
 * it. mise reports absolute paths; anything outside the root stays absolute so
 * a global config does not masquerade as a local file.
 */
function sourceOf(task: MiseTask, root: string): string {
  const absolute = task.file ?? task.source
  if (absolute === undefined || absolute === null) return 'mise.toml'
  const rel = relative(root, absolute)
  return rel.startsWith('..') ? absolute : rel.split('\\').join('/')
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
