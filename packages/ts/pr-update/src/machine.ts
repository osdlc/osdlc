/**
 * pr-update's own directories and its machine file, under the osdlc family
 * root (the machine-files standard).
 *
 * Every path comes from `standalone('osdlc')` with `envVars('OSDLC')`, pinned
 * to the Xdg convention, then `.app('pr-update')`: `@osdlc/ecosystem`'s
 * `osdlcDirs`. So `OSDLC_ROOT` moves all of it, and on Linux and macOS with no
 * variable set the machine file is `~/.config/osdlc/pr-update/config.yaml`.
 *
 * The machine file holds facts about this machine: whether a target with no
 * checkout may be cloned, and where clones go. A repository's config cannot
 * set them, so these keys are in no project schema (`config.ts`): a cloned
 * repository cannot choose where the tool writes on a person's disk.
 *
 * The trust store (`trust.ts`) and the run worktrees, kept worktrees and
 * failed-update records of targets other than the project root
 * (`defaults.ts`) are here too. devlink's files are not yet: they keep their
 * own `pr-update` root until they move.
 */

import { isAbsolute, join } from 'node:path'

import { machineConfigFile, type MachineConfigFile, type TieredDirs } from '@osdlc/config-layers'
import { OSDLC_VENDOR_DIRS, osdlcDirs, type OsdlcDirsOptions } from '@osdlc/ecosystem'
import { z } from 'zod'

/** pr-update's directory name in each osdlc home. */
export const PR_UPDATE_APP = 'pr-update'

/**
 * The variable that moves the machine file. Its value must be an absolute
 * path to the file. Named after pr-update, not the family: the default,
 * `OSDLC_MACHINE_CONFIG`, would move every osdlc tool's file at once.
 */
export const MACHINE_CONFIG_ENV = 'PR_UPDATE_MACHINE_CONFIG'

/** The machine file's keys. Strict, so a misspelt key is reported with the file's path. */
export const machineConfigSchema = z.strictObject({
  checkout: z
    .enum(['local', 'mirror'])
    .optional()
    .describe(
      'How a `--repo` target with no checkout on this machine is served. `local` never clones: such a target is skipped. `mirror` uses a managed clone. Both use the project root and any checkout found first. Unset until the person answers.',
    ),
  mirror_dir: z
    .string()
    .trim()
    .refine((dir) => isAbsolute(dir) || dir === '~' || dir.startsWith('~/'), {
      message: "must be an absolute path, '~' or start with '~/'",
    })
    .optional()
    .describe(
      'Where managed clones go: an absolute path, or one starting `~/`, which is expanded against the home directory. Default `repos/` in the cache home.',
    ),
  mirror_max_age_days: z
    .number()
    .int()
    .min(0)
    .default(30)
    .describe(
      'A clone unused for this many days is removed, by `pr-update mirror prune` and at the end of an `update --apply` that used the cache. 0 turns that off. It applies only to whole clones.',
    ),
})

/** The machine file as read, defaults filled. */
export type MachineConfig = z.infer<typeof machineConfigSchema>

/**
 * pr-update's directories, as D-0005's table names them. The per-repository
 * paths under them (`<host>/<owner>/<name>`, lower-cased) are their users'.
 */
export interface PrUpdatePaths {
  /** The config directory, which holds the machine file. */
  config: string
  /** The cache directory. Anything in it may be deleted whole. */
  cache: string
  /** The state directory: what a person needs back. */
  state: string
  /** Managed clones: `repos/<host>/<owner>/<name>.git`. */
  repos: string
  /** Run worktrees of targets other than the project root: `worktrees/<host>/<owner>/<name>/<run>`. */
  worktrees: string
  /** Kept worktrees of targets other than the project root: `kept/<host>/<owner>/<name>/<number>`. */
  kept: string
  /** File attempt records of targets other than the project root. */
  attempts: string
}

/**
 * pr-update's directories under `dirs`: the osdlc family's, pinned to Xdg
 * (`osdlcDirs` from `@osdlc/ecosystem`). Pass `osdlcDirs({ env })` to read
 * only that environment.
 *
 * Every walk pr-update makes of these folders (listing kept trees, `mirror list` and
 * `mirror prune`, `prune.ts`) skips entries whose names start with `.`: a run's temporary probe
 * (`.pr-update-probe-*`) is one, and a hard kill can leave it. Only pruning looks at two kinds
 * of them, to remove a probe or a `.tmp-*` clone folder once it is an hour old.
 */
export function prUpdatePaths(dirs: TieredDirs = osdlcDirs()): PrUpdatePaths {
  const tier = dirs.standalone('osdlc')
  const cache = tier.cache().app(PR_UPDATE_APP).path
  const state = tier.state().app(PR_UPDATE_APP).path
  return {
    config: tier.config().app(PR_UPDATE_APP).path,
    cache,
    state,
    repos: join(cache, 'repos'),
    worktrees: join(cache, 'worktrees'),
    kept: join(state, 'kept'),
    attempts: join(state, 'attempts'),
  }
}

/** Options for {@link machineFile}. */
export interface MachineFileOptions extends OsdlcDirsOptions {
  /** The osdlc directories. Defaults to `osdlcDirs` over `env` and `home`. Tests pass a rooted one. */
  dirs?: (() => TieredDirs) | undefined
}

/**
 * A handle on the machine file, through config-layers' `machineConfigFile`:
 * tool `osdlc`, app `pr-update`, the Xdg-pinned osdlc directories and
 * {@link MACHINE_CONFIG_ENV}.
 *
 * `PR_UPDATE_MACHINE_CONFIG` is read from `process.env`, as config-layers
 * reads it, whatever `env` is given. Every method throws when it holds a
 * relative path, since runs started in different directories would read
 * different files.
 */
export function machineFile(
  opts: MachineFileOptions = {},
): MachineConfigFile<typeof machineConfigSchema> {
  const dirs = opts.dirs ?? (() => osdlcDirs(opts))
  const file = machineConfigFile({
    tool: 'osdlc',
    app: PR_UPDATE_APP,
    env: MACHINE_CONFIG_ENV,
    vendorDirs: OSDLC_VENDOR_DIRS,
    dirs,
    schema: machineConfigSchema,
  })
  // machineConfigFile uses the variable as given, so a relative value is refused here, before
  // anything is read or written.
  const checked = <A extends unknown[], R>(fn: (...args: A) => R) => {
    return (...args: A): R => {
      checkMachineConfigEnv()
      return fn(...args)
    }
  }
  return {
    ...file,
    path: checked(file.path),
    load: checked(file.load),
    loadWithIssues: checked(file.loadWithIssues),
    read: checked(file.read),
    check: checked(file.check),
    write: checked(file.write),
    migrate: checked(file.migrate),
  }
}

/** Throws when {@link MACHINE_CONFIG_ENV} is set to a relative path. */
function checkMachineConfigEnv(): void {
  const value = process.env[MACHINE_CONFIG_ENV]
  if (value !== undefined && value.trim() !== '' && !isAbsolute(value)) {
    throw new Error(`${MACHINE_CONFIG_ENV} must be an absolute path to the file; it is '${value}'`)
  }
}
