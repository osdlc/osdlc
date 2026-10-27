/**
 * Devbox: the `shell.scripts` of each `devbox.json`.
 *
 * devbox.json accepts comments and trailing commas. A script is a command or
 * a list of commands, run in the Devbox shell by `devbox run <name>`. A
 * devbox.json below the root is named with `--config <dir>`. Extra arguments
 * are appended.
 */

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { readJsonc } from '../support/jsonc.ts'
import { commandList, dirOf, isTable, looksPersistent, taskId } from '../support/shared.ts'

export const DEVBOX_JSON = 'devbox.json'

const CHAIN = [
  { label: 'runner', hint: 'Devbox runs the scripts under `shell.scripts` in a devbox.json.' },
  { label: 'project', hint: 'The directory holding the devbox.json. `.` is the root.' },
  { label: 'script', hint: 'The key under `shell.scripts`.' },
]

/** Devbox's mark. Icon path and color: simple-icons v16 (CC0-1.0), slug `devbox`. */
export const DEVBOX_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m19.546 7.5726-1.531-1.5703c-.4881.4371-.965.8647-1.442 1.2922l-.959.8596c1.3076 1.3446 2.5887 2.6624 3.8756 3.987l-2.4261 2.4956-1.4508 1.4924c.55.4988 1.0916.9897 1.6397 1.4864l.765.6933 2.209-2.2773c1.2588-1.2976 2.5141-2.5916 3.7736-3.8905v-.001a20797.5906 20797.5906 0 0 1-4.454-4.5674ZM2.992 9.0716A16808.14 16808.14 0 0 1 0 12.141c2.0108 2.0727 3.9927 4.1152 5.9838 6.1666l.5111-.4635c.638-.5786 1.2616-1.144 1.8924-1.715l-1.447-1.4888c-.8134-.8368-1.6208-1.6676-2.431-2.5015 1.0462-1.075 2.0745-2.132 3.1094-3.1959l.7674-.7888c-.4342-.3892-.861-.7718-1.2883-1.1546l-1.114-.9983v.0011c-.9996 1.0251-1.9958 2.0472-2.992 3.0694Zm12.585-6.0372c-1.317 6.199-2.6283 12.3689-3.9453 18.5656l-.1962-.0387a2911.4317 2911.4317 0 0 0-3.0284-.5957c.8529-4.0118 1.7034-8.0133 2.5549-12.0196L12.3533 2.4z"/></svg>',
  color: '#280459',
}

export const devboxRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const tasks: Task[] = []
    const diagnostics: Diagnostic[] = []
    for (const file of (await ctx.files(DEVBOX_JSON)).sort()) {
      const read = await readJsonc(ctx, file)
      if (read === null) continue
      if ('error' in read) {
        const message = `unparseable devbox.json: ${read.error}`
        diagnostics.push({ severity: 'warning', message, source: file })
        continue
      }
      const doc = read.value
      const shell = isTable(doc) ? doc['shell'] : undefined
      const scripts = isTable(shell) && isTable(shell['scripts']) ? shell['scripts'] : {}
      const dir = dirOf(file)
      for (const [name, body] of Object.entries(scripts)) {
        const commands = commandList(body)
        if (commands === null) {
          diagnostics.push({
            severity: 'warning',
            message: `devbox script ${name} is not a command or a list of commands, so it was skipped`,
            source: file,
          })
          continue
        }
        const argv =
          dir === '.' ? ['devbox', 'run', name] : ['devbox', 'run', '--config', dir, name]
        tasks.push({
          id: taskId('devbox', file, name),
          runner: 'devbox',
          path: ['devbox', dir, name],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'declared',
          detail: commands.join('; '),
          tags: ['devbox', dir],
          persistent: { value: looksPersistent(name), declared: false },
          executes: 'local',
        })
      }
    }
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics }
  },
}
