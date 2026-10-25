/**
 * dotnet: the conventional verbs of each solution and project file.
 *
 * Synthesized, as for cargo and SwiftPM: nothing in a `.csproj` declares
 * `dotnet build`. A solution (`.sln`, `.slnx`) gets build, test, restore and
 * publish. A project (`.csproj`, `.fsproj`, `.vbproj`) gets those and run.
 * Each names its file, so `cwd` stays `.`.
 */

import type { ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { Package, RunnerRole } from '../../tool.ts'
import { afterSeparator, taskId } from '../support/shared.ts'

const CHAIN = [
  { label: 'runner', hint: 'dotnet builds, tests and runs solutions and projects.' },
  { label: 'file', hint: 'The solution or project file, root-relative.' },
  { label: 'verb', hint: 'A conventional dotnet verb. Synthesized, not declared in the file.' },
]

const SOLUTION_VERBS = ['build', 'test', 'restore', 'publish']
const PROJECT_VERBS = ['build', 'test', 'run', 'restore', 'publish']

/** .NET's mark. Icon path and color: simple-icons v16 (CC0-1.0), slug `dotnet`. */
export const DOTNET_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 8.77h-2.468v7.565h-1.425V8.77h-2.462V7.53H24zm-6.852 7.565h-4.821V7.53h4.63v1.24h-3.205v2.494h2.953v1.234h-2.953v2.604h3.396zm-6.708 0H8.882L4.78 9.863a2.896 2.896 0 0 1-.258-.51h-.036c.032.189.048.592.048 1.21v5.772H3.157V7.53h1.659l3.965 6.32c.167.261.275.442.323.54h.024c-.04-.233-.06-.629-.06-1.185V7.529h1.372zm-8.703-.693a.868.829 0 0 1-.869.829.868.829 0 0 1-.868-.83.868.829 0 0 1 .868-.828.868.829 0 0 1 .869.829Z"/></svg>',
  color: '#512bd4',
}

const SOLUTION = /\.slnx?$/
const PROJECT = /\.(cs|fs|vb)proj$/

export const dotnetRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(_ctx, packages: readonly Package[]): Promise<ProviderResult> {
    const tasks: Task[] = []
    const files = packages.flatMap((p) => p.manifestFiles)
    for (const file of [...new Set(files)].sort()) {
      const solution = SOLUTION.test(file)
      if (!solution && !PROJECT.test(file)) continue
      for (const verb of solution ? SOLUTION_VERBS : PROJECT_VERBS) {
        // `dotnet run` takes a project only through `--project`.
        const argv = verb === 'run' ? ['dotnet', 'run', '--project', file] : ['dotnet', verb, file]
        tasks.push({
          id: taskId('dotnet', file, verb),
          runner: 'dotnet',
          path: ['dotnet', file, verb],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'synthesized',
          tags: ['dotnet', solution ? 'solution' : 'project'],
          persistent: { value: false, declared: false },
          executes: 'local',
        })
      }
    }
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics: [] }
  },

  /** `dotnet run` passes its own flags up to `--`, and the program's after it. */
  invoke(task, args) {
    return task.argv[1] === 'run' ? afterSeparator(task, args) : [...task.argv, ...args]
  },
}
