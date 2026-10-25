/**
 * Hatch: each environment's scripts, from `[tool.hatch.envs.<env>.scripts]`
 * in a pyproject.toml or `[envs.<env>.scripts]` in a hatch.toml.
 *
 * When both files define `envs`, hatch.toml's wins, as Hatch gives its top
 * level keys precedence. A script in the `default` environment is named
 * plainly (`test`); any other is `env:script` (`lint:check`), the form
 * `hatch run` takes. A script is a command or a list of commands. Scripts an
 * environment inherits from its template are listed once, under the
 * environment that declares them.
 *
 * Hatch has no flag that points it at another project directory, so a task
 * below the root runs in that directory (`cwd`).
 */

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { commandList, dirOf, looksPersistent, taskId } from '../support/shared.ts'
import { PYPROJECT_TOML } from './ecosystem.ts'
import { readConfig, tableAt } from './read-config.ts'

export const HATCH_TOML = 'hatch.toml'

const CHAIN = [
  { label: 'runner', hint: 'Hatch runs the scripts each environment declares.' },
  { label: 'project', hint: 'The directory holding the config. `.` is the root.' },
  { label: 'script', hint: 'The script name, `env:script` outside the default environment.' },
]

/** A plain glyph: an egg. Hatch has no mark in a CC0 icon set. Color: Hatch's docs indigo. */
export const HATCH_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5c-3.9 0-7 6.3-7 11.5a7 7 0 0 0 14 0c0-5.2-3.1-11.5-7-11.5Z"/><path d="m8 13 2 2 2-2 2 2 2-2"/></svg>',
  color: '#4051b5',
}

export const hatchRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const tasks: Task[] = []
    const diagnostics: Diagnostic[] = []
    const files = [...(await ctx.files(PYPROJECT_TOML)), ...(await ctx.files(HATCH_TOML))]
    const dirs = [...new Set(files.map(dirOf))].sort()

    for (const dir of dirs) {
      const envs = await envsIn(ctx, dir, files, diagnostics)
      if (envs === null) continue
      for (const [env, def] of Object.entries(envs.table)) {
        const scripts = tableAt(def, 'scripts')
        if (scripts === undefined) continue
        for (const [script, body] of Object.entries(scripts)) {
          const commands = commandList(body)
          if (commands === null) {
            diagnostics.push({
              severity: 'warning',
              message: `hatch script ${env}:${script} is not a command or a list of commands, so it was skipped`,
              source: envs.file,
            })
            continue
          }
          const name = env === 'default' ? script : `${env}:${script}`
          const argv = ['hatch', 'run', name]
          tasks.push({
            id: taskId('hatch', envs.file, name),
            runner: 'hatch',
            path: ['hatch', dir, name],
            argv,
            cwd: dir,
            display: argv.join(' '),
            parameters: [],
            source: envs.file,
            origin: 'declared',
            detail: commands.join('; '),
            tags: ['hatch', dir, env],
            persistent: { value: looksPersistent(script), declared: false },
            executes: 'local',
          })
        }
      }
    }
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics }
  },
}

/** The `envs` table Hatch uses in `dir`: hatch.toml's, else pyproject.toml's `tool.hatch`. */
async function envsIn(
  ctx: ProviderContext,
  dir: string,
  files: readonly string[],
  diagnostics: Diagnostic[],
): Promise<{ file: string; table: Record<string, unknown> } | null> {
  const at = (name: string): string => (dir === '.' ? name : `${dir}/${name}`)
  if (files.includes(at(HATCH_TOML))) {
    const read = await readConfig(ctx, at(HATCH_TOML))
    if (read !== null && 'error' in read) {
      diagnostics.push({ severity: 'warning', message: read.error, source: at(HATCH_TOML) })
      return null
    }
    const envs = read === null ? undefined : tableAt(read.doc, 'envs')
    if (envs !== undefined) return { file: at(HATCH_TOML), table: envs }
  }
  if (!files.includes(at(PYPROJECT_TOML))) return null
  const read = await readConfig(ctx, at(PYPROJECT_TOML))
  // The python runner reports a broken pyproject.toml.
  if (read === null || 'error' in read) return null
  const envs = tableAt(read.doc, 'tool', 'hatch', 'envs')
  return envs === undefined ? null : { file: at(PYPROJECT_TOML), table: envs }
}
