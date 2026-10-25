/**
 * `way clean`: the data wayfinder keeps outside your repositories. Bare
 * `clean` only reports what each store is, where it is, and whether anything
 * is in it. A flag names what to remove; with no flag nothing is removed.
 *
 * | flag | store |
 * |---|---|
 * | `--cache` | stored probe results: derived, costs one slow probe |
 * | `--trust` | the repositories you trusted: consent, asked again |
 * | `--user-config` | your user config: the only store a person wrote, so it needs `--yes` |
 * | `--dev` | `way dev` link state, and the `way dev install` shims on PATH |
 * | `--legacy` | files kept under the tool's name before its first release |
 *
 * `--everything` is every one of them, and needs `--yes`. A store that is only
 * listed when it holds something (shims, old files) is left out of the report
 * when it is empty. Once a store is gone, the directories above it are removed
 * while they are empty, up to the base directory (`~/.config`, say).
 *
 * Nothing inside a repository is touched: `wayfinder.config.json` belongs to
 * the project. A user config that `WAYFINDER_CONFIG` names is named with the
 * variable in the report and again before it is removed, since it may live in
 * a dotfiles repository.
 *
 * Clean removes only what it owns. A file store must be a file (a symbolic
 * link is removed, not its target), a directory store a directory, and no
 * store may be the home directory, a directory above it or a filesystem root.
 * A store whose path is, holds or sits in another flag's store is removed
 * only with `--yes`.
 * A file `WAYFINDER_CONFIG` names is removed only when its `$schema` names
 * wayfinder's config schema, which every file wayfinder writes has.
 */

import { lstat, readFile, readdir, rm, rmdir, stat } from 'node:fs/promises'
import { dirname, join, relative, isAbsolute, resolve } from 'node:path'

import { z } from 'zod'

import {
  UsageError,
  commandKit,
  outcome,
  type CommandContext,
  type DataCommand,
} from '@osdlc/cli-tool/command'
import type { FlagSpec } from '@osdlc/cli-tool/define-cli'
import { defaultBinDir, readShimTarget, stateDir } from '@osdlc/cli-tool/devlink'
import { EXIT } from '@osdlc/cli-tool/exit'

import { APP, BIN, CONFIG_ENV_VAR } from './app.ts'
import { commandEnv, type CommandEnvOptions } from './config-command.ts'
import { configLocations } from './config.ts'
import { WAYFINDER_SPEC } from './devlink.ts'
import { terminalSafe } from './terminal-text.ts'
import { appDirs, appTieredDirs, pre08Bases } from './xdg.ts'

/** The tool's name before its first release. Used only to find and remove its files. */
const OLD_NAME = 'waypost'

/** What a flag removes. */
export type StoreKey = 'cache' | 'trust' | 'config' | 'dev' | 'legacy'

const KEYS: readonly StoreKey[] = ['cache', 'trust', 'config', 'dev', 'legacy']

/**
 * The flag that names a store. The user config's is `--user-config`, since
 * the app's global `--config` loads tool modules.
 */
const FLAG_OF: Record<StoreKey, keyof typeof FLAGS> = {
  cache: 'cache',
  trust: 'trust',
  config: 'userConfig',
  dev: 'dev',
  legacy: 'legacy',
}

/** One removable store. */
interface Store {
  key: StoreKey
  what: string
  path: string
  /** A file rather than a directory. */
  file: boolean
  /** Empty parents are removed up to this directory. Null: none are. */
  base: string | null
  /** The variable that named the path, when one did. */
  envVar?: string
  /** Listed only when something is there. */
  optional?: boolean
}

const StoreReportSchema = z.object({
  key: z.enum(KEYS as [StoreKey, ...StoreKey[]]),
  flag: z.string(),
  what: z.string(),
  path: z.string(),
  /** Bytes stored, or null when nothing is. A failed removal keeps its size, with `removed: false`. */
  bytes: z.number().nullable(),
  removed: z.boolean(),
  /** The variable that named the path, when one did. */
  envVar: z.string().optional(),
})

/** `way clean`'s output. */
export const CleanOutputSchema = z.object({
  /** `report` for a bare `clean`, `remove` when a flag named something to remove. */
  mode: z.enum(['report', 'remove']),
  stores: z.array(StoreReportSchema),
})

type StoreReport = z.infer<typeof StoreReportSchema>

/**
 * Bytes under a path, or null when it does not exist. Symbolic links are not
 * followed. With `shallow`, a directory is not walked: a file store's path
 * may name one by mistake.
 */
async function weigh(path: string, shallow = false): Promise<number | null> {
  const info = await lstat(path).catch(() => null)
  if (info === null) return null
  if (!info.isDirectory() || shallow) return info.size
  let total = 0
  for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
    total += (await weigh(join(path, entry.name))) ?? 0
  }
  return total
}

/** The largest user config clean reads to look for the `$schema` marker. */
const MARKER_READ_LIMIT = 1024 * 1024

/** True when the JSON file at `path` has a `$schema` naming wayfinder's config schema. */
async function writtenByWayfinder(path: string): Promise<boolean> {
  const info = await stat(path).catch(() => null)
  if (info === null || !info.isFile() || info.size > MARKER_READ_LIMIT) return false
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    const schema = (value as { $schema?: unknown } | null)?.$schema
    return typeof schema === 'string' && SCHEMA_MARKER.test(schema)
  } catch {
    return false
  }
}

/** A `$schema` URL for any release of wayfinder's config schema. */
const SCHEMA_MARKER = /\/@osdlc\/wayfinder@[^/]+\/schema\/config\.json$/

/** Why clean will not remove `store`, which exists, or null when it may. */
async function refusal(store: Store, home: string): Promise<string | null> {
  const path = resolve(store.path)
  const up = relative(path, resolve(home))
  if (dirname(path) === path || up === '' || (!up.startsWith('..') && !isAbsolute(up))) {
    return 'it is the home directory, a directory above it or a filesystem root'
  }
  const info = await lstat(path)
  if (store.file) {
    if (!info.isFile() && !info.isSymbolicLink()) return 'it is not a file'
    if (store.envVar !== undefined && !(await writtenByWayfinder(path))) {
      return `its "$schema" does not name ${APP}'s config schema, so ${APP} did not write it; remove it yourself`
    }
  } else if (!info.isDirectory()) {
    return 'it is not a directory'
  }
  return null
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Remove the empty directories above `path`, up to and not including `base`. */
async function pruneEmptyParents(path: string, base: string): Promise<void> {
  let dir = dirname(path)
  for (;;) {
    const rel = relative(base, dir)
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return
    const entries = await readdir(dir).catch(() => null)
    if (entries === null || entries.length > 0) return
    await rmdir(dir).catch(() => undefined)
    dir = dirname(dir)
  }
}

/** True when `a` and `b` are the same path or one is inside the other. */
function overlaps(a: string, b: string): boolean {
  const inside = (outer: string, inner: string): boolean => {
    const rel = relative(resolve(outer), resolve(inner))
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  }
  return inside(a, b) || inside(b, a)
}

/**
 * The first chosen store whose path is, holds or sits in another flag's
 * store, with that store. Stores under one flag are removed together, so
 * they are not compared.
 */
function overlapOf(stores: Store[], chosen: Set<StoreKey>): [Store, Store] | undefined {
  for (const store of stores) {
    if (!chosen.has(store.key)) continue
    const other = stores.find((o) => o.key !== store.key && overlaps(o.path, store.path))
    if (other !== undefined) return [store, other]
  }
  return undefined
}

/** Every store, in report order. */
function storesFor(
  env: Record<string, string | undefined>,
  home: string,
  platform?: string,
): Store[] {
  const at = { env, home, ...(platform !== undefined ? { platform } : {}) }
  const dirs = appDirs(at)
  const user = configLocations(home, env, home)
  const devDirs = appTieredDirs(at)
  const stores: Store[] = [
    {
      key: 'cache',
      what: 'stored probe results',
      path: dirs.cache,
      file: false,
      base: dirs.bases.cache,
    },
    {
      key: 'trust',
      what: 'repositories you have trusted',
      path: dirs.trustStore,
      file: false,
      base: dirs.bases.state,
    },
    {
      key: 'config',
      what: 'your user configuration',
      // `dirs` and not `user.user`, so an injected platform moves this store too.
      path: user.userFromEnv ? user.user : dirs.userConfig,
      file: true,
      // A file the variable names is not under wayfinder's directories, so
      // nothing above it is removed.
      base: user.userFromEnv ? null : dirs.bases.config,
      ...(user.userEnvVar !== null ? { envVar: user.userEnvVar } : {}),
    },
    {
      key: 'dev',
      what: `${BIN} dev link state`,
      path: stateDir(WAYFINDER_SPEC, { dirs: devDirs, legacyDirs: null }),
      file: false,
      base: devDirs.bases.config,
    },
  ]
  // Only a file `way dev install` wrote: one with devlink's shim marker.
  const binDir = defaultBinDir({ ...env, HOME: home })
  for (const name of [WAYFINDER_SPEC.name, ...(WAYFINDER_SPEC.aliases ?? [])]) {
    const path = join(binDir, name)
    if (readShimTarget(path) === null) continue
    stores.push({
      key: 'dev',
      what: `the ${name} shim`,
      path,
      file: true,
      base: null,
      optional: true,
    })
  }
  // Old releases' paths come from the rules those releases used, never from
  // the current `WAYFINDER_*` overrides, which could point them at a live store.
  const old = pre08Bases(env, home)
  const legacy: Store[] = []
  for (const [base, what] of [
    [old.config, 'config'],
    [old.state, 'trust store'],
    [old.cache, 'cache'],
  ] as const) {
    legacy.push({
      key: 'legacy',
      what: `the ${what} from before the rename`,
      path: join(base, OLD_NAME),
      file: false,
      base,
      optional: true,
    })
  }
  const os = platform ?? process.platform
  // Link state before 0.8, on macOS only: the native convention's config home.
  if (os === 'darwin') {
    const base = join(home, 'Library', 'Application Support')
    legacy.push({
      key: 'legacy',
      what: `${BIN} dev link state from before 0.8`,
      path: join(base, WAYFINDER_SPEC.name),
      file: false,
      base,
      optional: true,
    })
  }
  // Windows before 0.8 used the XDG paths; 0.8 uses %APPDATA% and %LOCALAPPDATA%.
  if (os === 'win32') {
    for (const [base, what] of [
      [old.config, 'user config'],
      [old.state, 'trust store'],
      [old.cache, 'cache'],
    ] as const) {
      legacy.push({
        key: 'legacy',
        what: `the ${what} from before 0.8`,
        path: join(base, APP),
        file: false,
        base,
        optional: true,
      })
    }
  }
  // An old path that is, holds or sits in a current store is not old.
  const live = stores.map((s) => s.path)
  for (const store of legacy) {
    if (!live.some((path) => overlaps(path, store.path))) stores.push(store)
  }
  return stores
}

function reportOf(store: Store, bytes: number | null, removed: boolean): StoreReport {
  return {
    key: store.key,
    flag: store.key === 'config' ? '--user-config' : `--${store.key}`,
    what: store.what,
    path: store.path,
    bytes,
    removed,
    ...(store.envVar !== undefined ? { envVar: store.envVar } : {}),
  }
}

const FLAGS = {
  cache: { kind: 'boolean', help: 'remove stored probe results (derived; costs one slow probe)' },
  trust: { kind: 'boolean', help: 'forget which repositories you have trusted' },
  userConfig: { kind: 'boolean', help: 'remove your user configuration file (needs --yes)' },
  dev: {
    kind: 'boolean',
    help: `remove ${BIN} dev link state and the shims ${BIN} dev install put on PATH`,
  },
  legacy: {
    kind: 'boolean',
    help: "remove files kept under the tool's name before its first release",
  },
  everything: { kind: 'boolean', help: 'every store above (needs --yes)' },
  yes: { kind: 'boolean', help: 'confirm removing something that cannot be regenerated' },
} as const satisfies FlagSpec

/** What {@link cleanCommand} takes, beside the app's global flags. */
export interface CleanCommandOptions extends CommandEnvOptions {
  /** The platform the paths are for. Defaults to `process.platform`. */
  platform?: string
}

/**
 * The `clean` command. Mount it as `clean: cleanCommand({ globals })`.
 * A call with a flag that removes something is `cli-only`: the MCP and HTTP
 * adapters refuse it. A bare `clean`, the report, is open to them.
 */
export function cleanCommand<G extends FlagSpec = Record<never, never>>(
  options: CleanCommandOptions & { globals?: G } = {},
): DataCommand {
  const { globals, platform, ...rest } = options
  const env = commandEnv(rest)
  const kit = commandKit({ globals: globals ?? ({} as G) })
  const chosenOf = (flags: Record<string, unknown>): Set<StoreKey> =>
    new Set(flags['everything'] === true ? KEYS : KEYS.filter((k) => flags[FLAG_OF[k]] === true))

  return kit.command({
    summary: 'remove the data this tool stores outside your repositories',
    description:
      'With no flag, clean reports each store, where it is and what it holds, and removes ' +
      'nothing. Nothing inside a repository is touched: a project config file belongs to the ' +
      `project. A user config that ${CONFIG_ENV_VAR} names is named before it is removed.`,
    flags: FLAGS,
    output: CleanOutputSchema,
    kind: 'clean',
    destructive: true,
    exits: { 1: 'a store could not be removed' },
    exposureOf: ({ flags }) => (chosenOf(flags).size > 0 ? 'cli-only' : 'all'),
    async run({ flags }, ctx: CommandContext) {
      const chosen = chosenOf(flags)
      const home = env.home(ctx)
      const stores = storesFor(ctx.env, home, platform)

      if (chosen.size === 0) {
        const reports: StoreReport[] = []
        for (const store of stores) {
          const bytes = await weigh(store.path, store.file)
          if (store.optional === true && bytes === null) continue
          reports.push(reportOf(store, bytes, false))
        }
        return { mode: 'report' as const, stores: reports }
      }

      // An override can put one store inside another, such as the cache at
      // `~/.config`. Removing the outer one would remove the inner one too.
      const overlap = flags.yes === true ? undefined : overlapOf(stores, chosen)
      if (overlap !== undefined) {
        const [a, b] = overlap
        throw new UsageError(
          `not removing ${a.what} (${a.path}): it overlaps ${b.what} (${b.path}), ` +
            'since one path is or holds the other. Check the WAYFINDER_* and XDG_* variables, ' +
            'or pass --yes to remove it anyway',
        )
      }

      const config = stores.find((s) => s.key === 'config')
      if (chosen.has('config') && flags.yes !== true) {
        throw new UsageError(
          `removing your user configuration (${config?.path ?? ''}${config?.envVar !== undefined ? `, named by ${config.envVar}` : ''}) needs --yes`,
        )
      }

      const reports: StoreReport[] = []
      for (const store of stores) {
        if (!chosen.has(store.key)) continue
        const size = await weigh(store.path, store.file)
        if (size === null) {
          if (store.optional !== true) reports.push(reportOf(store, null, false))
          continue
        }
        const refused = await refusal(store, home)
        if (refused !== null) {
          ctx.warn(`not removing ${store.path}: ${refused}`)
          reports.push(reportOf(store, size, false))
          return outcome({ mode: 'remove' as const, stores: reports }, EXIT.error)
        }
        if (store.envVar !== undefined) {
          ctx.note(`removing ${store.path}, which ${store.envVar} names`)
        }
        try {
          await rm(store.path, store.file ? { force: true } : { recursive: true, force: true })
        } catch (err) {
          ctx.warn(
            `could not remove ${store.path}: ${err instanceof Error ? err.message : String(err)}`,
          )
          // A store that would not delete is a reason to stop deleting the others.
          reports.push(reportOf(store, size, false))
          return outcome({ mode: 'remove' as const, stores: reports }, EXIT.error)
        }
        if (store.base !== null) await pruneEmptyParents(store.path, store.base)
        reports.push(reportOf(store, size, true))
      }
      if (chosen.has('trust') && reports.some((r) => r.key === 'trust' && r.removed)) {
        ctx.note('trusted repositories will ask again the next time you read them')
      }
      return { mode: 'remove' as const, stores: reports }
    },
    text: (output) => cleanText(output),
  }) as DataCommand
}

function cleanText(output: z.infer<typeof CleanOutputSchema>): string {
  const from = (r: StoreReport): string => (r.envVar !== undefined ? `, from ${r.envVar}` : '')
  if (output.mode === 'report') {
    const lines = [`${APP} stores these outside your repositories:`, '']
    const width = Math.max(0, ...output.stores.map((r) => r.flag.length))
    for (const r of output.stores) {
      const held = r.bytes === null ? 'nothing stored' : humanBytes(r.bytes)
      lines.push(`  ${r.flag.padEnd(width)}  ${r.what}`)
      lines.push(`  ${' '.repeat(width)}  ${terminalSafe(r.path)}  (${held}${from(r)})`)
    }
    lines.push(
      '',
      'Pass a flag above to remove one, or --everything for every one.',
      'Nothing was removed.',
      '',
    )
    return lines.join('\n')
  }
  return output.stores
    .map((r) =>
      r.removed
        ? `removed ${r.what} (${humanBytes(r.bytes ?? 0)}) from ${terminalSafe(r.path)}\n`
        : r.bytes === null
          ? `${r.what}: nothing stored at ${terminalSafe(r.path)}\n`
          : `${r.what}: not removed: ${terminalSafe(r.path)}\n`,
    )
    .join('')
}
