/**
 * Turborepo — `turbo.json` (v1 `pipeline`, v2 `tasks`).
 *
 * Turborepo 2.0 renamed the top-level `pipeline` key to `tasks`. The values
 * under each key have the same shape. Both are read here. If a file has both,
 * `tasks` wins and a diagnostic says so.
 *
 * `kind: "parse"`: turbo.json is plain data, so there is no need to run
 * turbo.
 */

import type { ProviderContext } from '../../contract.ts'
import type { Diagnostic, ProviderResult, RunnerBrand, Task } from '../../model.ts'
import type { RunnerRole } from '../../tool.ts'
import { parseJsonc } from '../support/jsonc.ts'
import { afterSeparator, dependencies, dirOf, looksPersistent, taskId } from '../support/shared.ts'

const CHAIN = [
  {
    label: 'runner',
    hint: "turbo runs tasks declared in turbo.json's `tasks` (v2) or `pipeline` (v1) map.",
  },
  { label: 'project', hint: 'The directory holding the turbo.json. `.` is the workspace root.' },
  {
    label: 'task',
    hint: 'The key under `tasks`/`pipeline` — often `workspace#task` for a package-scoped override, or a bare task name applying to every workspace.',
  },
]

/**
 * Turborepo's mark. Turborepo is a trademark of Vercel, used here only to
 * identify the tool. Icon path and color: simple-icons
 * (CC0-1.0), slug `turborepo`, fetched from
 * cdn.jsdelivr.net/npm/simple-icons@latest/icons/turborepo.svg and its data
 * file (hex `#EF4444`).
 */
export const TURBO_BRAND: RunnerBrand = {
  icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.9906 4.1957c-4.2998 0-7.7981 3.501-7.7981 7.8043s3.4983 7.8043 7.7981 7.8043c4.2999 0 7.7982-3.501 7.7982-7.8043s-3.4983-7.8043-7.7982-7.8043m0 11.843c-2.229 0-4.0356-1.8079-4.0356-4.0387s1.8065-4.0387 4.0356-4.0387S16.0262 9.7692 16.0262 12s-1.8065 4.0388-4.0356 4.0388m.6534-13.1249V0C18.9726.3386 24 5.5822 24 12s-5.0274 11.66-11.356 12v-2.9139c4.7167-.3372 8.4516-4.2814 8.4516-9.0861s-3.735-8.749-8.4516-9.0861M5.113 17.9586c-1.2502-1.4446-2.0562-3.2845-2.2-5.3046H0c.151 2.8266 1.2808 5.3917 3.051 7.3668l2.0606-2.0622zM11.3372 24v-2.9139c-2.02-.1439-3.8584-.949-5.3019-2.2018l-2.0606 2.0623c1.975 1.773 4.538 2.9022 7.361 3.0534z"/></svg>',
  color: '#ef4444',
}

interface TurboTaskConfig {
  dependsOn?: unknown
  outputs?: unknown
  cache?: unknown
  persistent?: unknown
}

export const TURBO_JSON = 'turbo.json'
export const TURBO_JSONC = 'turbo.jsonc'

export const turboRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: ProviderContext): Promise<ProviderResult> {
    const jsonFiles = await ctx.files(TURBO_JSON)
    // turbo.jsonc may hold comments and trailing commas, which `ctx.readJson`
    // does not accept, so it is parsed as JSONC. A file that still fails to
    // parse becomes a diagnostic.
    const jsoncFiles = await ctx.files(TURBO_JSONC)
    const files = [...jsonFiles, ...jsoncFiles].sort()
    if (files.length === 0) return { status: 'absent', tasks: [], diagnostics: [] }

    const diagnostics: Diagnostic[] = []
    const tasks: Task[] = []

    for (const file of files) {
      const parsed = await readTurboConfig(ctx, file)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        diagnostics.push({ severity: 'warning', message: 'unparseable turbo.json', source: file })
        continue
      }

      const config = parsed as { tasks?: unknown; pipeline?: unknown }
      let map: Record<string, unknown> | null = null
      if (
        config.tasks !== null &&
        typeof config.tasks === 'object' &&
        !Array.isArray(config.tasks)
      ) {
        map = config.tasks as Record<string, unknown>
        if (config.pipeline !== undefined) {
          diagnostics.push({
            severity: 'info',
            message:
              'turbo.json declares both `tasks` and `pipeline` — `tasks` (v2) was read, `pipeline` ignored',
            source: file,
          })
        }
      } else if (
        config.pipeline !== null &&
        typeof config.pipeline === 'object' &&
        !Array.isArray(config.pipeline)
      ) {
        map = config.pipeline as Record<string, unknown>
        diagnostics.push({
          severity: 'info',
          message: 'turbo.json uses the v1 pipeline key',
          source: file,
        })
      }
      if (map === null) continue

      const dir = dirOf(file)

      for (const [key, value] of Object.entries(map)) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
        const task = value as TurboTaskConfig

        // A bare key runs in every workspace: `["turbo", "run", key]`. A
        // `workspace#task` key is split. turbo's `--filter` flag limits a run
        // to one workspace, so `web#build` becomes
        // `turbo run build --filter web`. The part before `#` is assumed to be
        // a valid turbo package name or filter; it is not checked.
        //
        // A turbo.json below the root is reached with turbo's global
        // working-directory flag, `--cwd <path>`, which goes before the
        // command (`turbo --skip-infer --cwd ../.. get-mfe-port`, turborepo.dev
        // microfrontends guide). So `cwd` stays ".". Without the flag, argv
        // would run the root turbo project instead of the declaring one. Turbo
        // limits a run to the package it is run inside
        // (turborepo.dev/docs/crafting-your-repository/running-tasks,
        // "Automatic Package Scoping"). So this is right both for a package
        // config that extends a root turbo.json and for a separate nested
        // turbo project.
        const head = dir === '.' ? ['turbo'] : ['turbo', '--cwd', dir]
        const hashAt = key.indexOf('#')
        const argv =
          hashAt === -1
            ? [...head, 'run', key]
            : [...head, 'run', key.slice(hashAt + 1), '--filter', key.slice(0, hashAt)]
        const taskName = hashAt === -1 ? key : key.slice(hashAt + 1)

        const detailParts: string[] = []
        if (Array.isArray(task.dependsOn) && task.dependsOn.length > 0) {
          detailParts.push(`depends on: ${task.dependsOn.join(', ')}`)
        }
        if (Array.isArray(task.outputs) && task.outputs.length > 0) {
          detailParts.push(`outputs: ${task.outputs.join(', ')}`)
        }

        // A dependency resolves to a key in the same file: `lint`, or
        // `web#lint` from a `web#build` key. A `^build` runs in the package's
        // dependencies, so it names no single task.
        const scope = hashAt === -1 ? undefined : key.slice(0, hashAt)
        const deps = dependencies(
          Array.isArray(task.dependsOn)
            ? task.dependsOn.filter((d): d is string => typeof d === 'string')
            : [],
          (dep) => {
            if (dep.startsWith('^')) return undefined
            const scoped = scope === undefined || dep.includes('#') ? undefined : `${scope}#${dep}`
            const hit = [scoped, dep].find((k) => k !== undefined && Object.hasOwn(map!, k))
            return hit === undefined ? undefined : taskId('turbo', file, hit)
          },
        )

        const declaredPersistent = task.persistent === true
        const cacheDisabled = task.cache === false

        tasks.push({
          id: taskId('turbo', file, key),
          runner: 'turbo',
          path: ['turbo', dir, key],
          argv,
          cwd: '.',
          display: argv.join(' '),
          parameters: [],
          source: file,
          origin: 'declared',
          ...(detailParts.length > 0 ? { detail: detailParts.join('; ') } : {}),
          ...deps,
          tags: ['turbo', dir, ...(cacheDisabled ? ['cache-disabled'] : [])],
          persistent: {
            value: declaredPersistent || (cacheDisabled && looksPersistent(taskName)),
            declared: declaredPersistent,
          },
          executes: 'local',
        })
      }
    }

    return {
      status: tasks.length > 0 ? 'ok' : 'absent',
      tasks,
      diagnostics,
    }
  },

  // Arguments after `--` reach the task, not the tool.
  invoke: afterSeparator,
}

/**
 * Reads a turbo config file. `.json` files go straight through
 * `ctx.readJson`. `.jsonc` files may hold comments and trailing commas, and
 * `ctx.readJson` parses strict JSON, so they are parsed as JSONC.
 */
async function readTurboConfig(ctx: ProviderContext, file: string): Promise<unknown> {
  if (!file.endsWith('.jsonc')) return ctx.readJson(file)

  const text = await ctx.readText(file)
  if (text === null) return null
  try {
    return parseJsonc(text)
  } catch {
    return null
  }
}
