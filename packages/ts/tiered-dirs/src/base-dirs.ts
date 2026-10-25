import { homedir, tmpdir, userInfo } from 'node:os'
import { join, win32 } from 'node:path'

import { TieredDirsError } from './errors.ts'

/**
 * How long a piece of state must last. The other axis, who shares it, is the
 * tier (see `tiered-dirs.ts`).
 *
 * A caller names both: `suite('notes').cache()`.
 *
 * Exhaustive on purpose, as in the Rust crate: a new home changes every
 * caller's layout, so adding one is a breaking (0.x minor) release.
 *
 * Stable in 0.x.
 */
export type Home = 'durable' | 'config' | 'cache' | 'state' | 'logs' | 'runtime'

/**
 * Every {@link Home}, in table order.
 *
 * Stable in 0.x.
 */
export const HOMES: readonly Home[] = ['durable', 'config', 'cache', 'state', 'logs', 'runtime']

/**
 * Which per-OS table the homes come from when no override moves them. The two
 * differ on macOS only: `native` is Apple's locations, `xdg` is the XDG Base
 * Directory rules. Linux uses XDG under both, and on Windows `xdg` means
 * `native`. A CLI or developer tool uses `xdg`. A GUI app uses `native`. The
 * Rust crate's `Convention` has the same two.
 *
 * A minor release may add a convention, as the Rust `Convention` is
 * `#[non_exhaustive]`. A `switch` over it needs a `default` arm.
 *
 * Stable in 0.x.
 */
export type Convention = 'native' | 'xdg'

/**
 * Every {@link Convention}. The first is the default.
 *
 * Stable in 0.x.
 */
export const CONVENTIONS: readonly Convention[] = ['native', 'xdg']

/** The {@link Convention} named exactly `value`, if any. */
function findConvention(value: string): Convention | undefined {
  return CONVENTIONS.find((convention) => convention === value)
}

/**
 * Parse a {@link Convention}: exactly `native` or `xdg`, in lower case,
 * untrimmed. The Rust crate's `Convention::from_str` is the same rule.
 *
 * Throws {@link TieredDirsError} with code `INVALID_CONVENTION` for any other
 * value. {@link EnvVars.convention} is read differently: it is trimmed first.
 *
 * Stable in 0.x.
 */
export function parseConvention(value: string): Convention {
  const convention = findConvention(value)
  if (convention !== undefined) return convention
  throw new TieredDirsError(
    'INVALID_CONVENTION',
    `convention must be "native" or "xdg", got ${JSON.stringify(value)}`,
  )
}

/**
 * The per-OS roots the whole package is built on.
 *
 * A caller can build this value itself and pass it in. Nothing below it reads
 * the environment. A `TieredDirs` resolves its roots once, at construction, and
 * every path after that is pure string work. So a server that cannot read the
 * environment can pass roots from its own configuration, while a command-line
 * program builds them from the environment.
 *
 * Every field is `readonly`. Build a new value to change a root, as
 * {@link rootedBaseDirs} and the `overrides` option do.
 *
 * Stable in 0.x.
 */
export interface BaseDirs {
  /** Long-lived state that must survive a cache purge. */
  readonly durable: string
  /** User-editable configuration. */
  readonly config: string
  /** Regenerable data. The OS may delete this at any time. */
  readonly cache: string
  /** State that should outlive a restart but is not user data: history, trust markers. */
  readonly state: string
  /** Log files. Never under `cache`, because the OS purges cache. */
  readonly logs: string
  /** Pidfiles, sockets, locks. Never under `cache`; see {@link systemBaseDirs}. */
  readonly runtime: string
  /**
   * The platform temp directory. Not a {@link Home}. Nothing here outlives the
   * call that wrote it, so it has no tier. Reach it through `TieredDirs.scratch()`.
   */
  readonly scratch: string
}

/** `T` with its `readonly` modifiers removed, for building a value before returning it. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] }

/** Every key of {@link BaseDirs}: the six homes plus `scratch`. */
const BASE_DIR_KEYS: readonly (keyof BaseDirs)[] = [...HOMES, 'scratch']

/** Directory name for runtime state where the platform offers none (see {@link systemBaseDirs}). */
const RUNTIME_FALLBACK_SEGMENT = 'run'

/**
 * The names of the environment variables that move base directories. Build one
 * with {@link envVars}, which derives every name from a prefix.
 *
 * A minor release may add a name, as the Rust `EnvVars` is
 * `#[non_exhaustive]`. An object built by hand would then miss it, so build
 * one with {@link envVars}. `dirs[home]` is the Rust `EnvVars::dir`.
 *
 * Stable in 0.x.
 */
export interface EnvVars {
  /**
   * Moves every base directory not moved by its own variable into the
   * {@link rootedBaseDirs} layout under the named root.
   */
  readonly root: string
  /** The variable that moves one base directory. */
  readonly dirs: Readonly<Record<keyof BaseDirs, string>>
  /**
   * When set (non-empty), {@link systemBaseDirs} throws instead of falling back
   * to an OS home. A test runner sets it, and a child process inherits it.
   */
  readonly requireOverride: string
  /**
   * Picks the {@link Convention}, over the one the caller passed: `native` or
   * `xdg`. Moves no directory itself.
   */
  readonly convention: string
}

/**
 * {@link EnvVars} named from one prefix: `<P>_ROOT`, `<P>_DURABLE_DIR`,
 * `<P>_CONFIG_DIR`, `<P>_CACHE_DIR`, `<P>_STATE_DIR`, `<P>_LOGS_DIR`,
 * `<P>_RUNTIME_DIR`, `<P>_SCRATCH_DIR`, `<P>_REQUIRE_OVERRIDE` and
 * `<P>_CONVENTION`. The Rust crate's `env_vars!` derives the same names.
 *
 * Stable in 0.x.
 */
export function envVars(prefix: string): EnvVars {
  return Object.freeze({
    root: `${prefix}_ROOT`,
    dirs: Object.freeze({
      durable: `${prefix}_DURABLE_DIR`,
      config: `${prefix}_CONFIG_DIR`,
      cache: `${prefix}_CACHE_DIR`,
      state: `${prefix}_STATE_DIR`,
      logs: `${prefix}_LOGS_DIR`,
      runtime: `${prefix}_RUNTIME_DIR`,
      scratch: `${prefix}_SCRATCH_DIR`,
    }),
    requireOverride: `${prefix}_REQUIRE_OVERRIDE`,
    convention: `${prefix}_CONVENTION`,
  })
}

/**
 * Every variable that moves a base directory: the root and the seven
 * per-directory names. Excludes {@link EnvVars.requireOverride} and
 * {@link EnvVars.convention}, which move nothing.
 *
 * Stable in 0.x.
 */
export function overrideVars(vars: EnvVars): readonly string[] {
  return [vars.root, ...BASE_DIR_KEYS.map((key) => vars.dirs[key])]
}

/**
 * Whether `env` sets any of {@link overrideVars} to a non-empty value. The
 * Rust crate's `EnvVars::is_overridden` is the same test.
 *
 * Stable in 0.x.
 */
export function isOverridden(
  vars: EnvVars,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return overrideVars(vars).some((name) => Boolean(env[name]))
}

/**
 * Every base directory under one stub root: `<root>/durable`, `<root>/config`,
 * `<root>/cache`, `<root>/state`, `<root>/logs`, `<root>/scratch`, and runtime
 * at `<root>/durable/run`.
 *
 * Tests and the parity fixture use this layout, and {@link EnvVars.root}
 * selects it. The Rust crate's `BaseDirs::rooted` has the same layout, so a
 * fixture row checks identical absolute paths in both languages.
 *
 * Stable in 0.x.
 */
export function rootedBaseDirs(root: string): BaseDirs {
  const durable = join(root, 'durable')
  return {
    durable,
    config: join(root, 'config'),
    cache: join(root, 'cache'),
    state: join(root, 'state'),
    logs: join(root, 'logs'),
    runtime: join(durable, RUNTIME_FALLBACK_SEGMENT),
    scratch: join(root, 'scratch'),
  }
}

/**
 * How {@link systemBaseDirs} and `TieredDirs.fromEnv` resolve. Every input is
 * optional and injectable. The Rust crate's `ResolveOptions` has `convention`
 * and `testRoot`. `platform`, `env`, `home`, `overrides` and
 * `conventionFromEnv` exist only in this package.
 *
 * Stable in 0.x.
 */
export interface ResolveOptions {
  /** Defaults to `process.platform`. */
  platform?: string
  /**
   * The per-OS table to use. Defaults to `native`. {@link EnvVars.convention}
   * overrides it when set, unless `conventionFromEnv` is `false`.
   */
  convention?: Convention
  /**
   * Whether {@link EnvVars.convention} may override `convention`. Defaults to
   * `true`. Pass `false` for a file another program also reads at a fixed
   * path, such as a shell launcher that reads `~/.config/<tool>`: the
   * variable would move the file away from where that program looks.
   */
  conventionFromEnv?: boolean
  /**
   * Defaults to `process.env`. When given, it is the only environment read.
   * The host's real home directory is not used. The override variables are
   * read from it too.
   */
  env?: Record<string, string | undefined>
  /** Home directory. Overrides `HOME` / `USERPROFILE` when given. */
  home?: string
  /**
   * Replace individual roots. These take precedence over the environment. An
   * overridden root is used as-is and needs no home directory. It is not a base for the others:
   * overriding `durable` here leaves `runtime` and `logs` where the
   * environment and the per-OS table put them.
   */
  overrides?: Partial<BaseDirs>
  /**
   * Whether an unset root variable reads as {@link testRoot} in a test runner
   * process. Defaults to `true`. With `false`, resolution runs as it would
   * outside a test runner: {@link EnvVars.root} and
   * {@link EnvVars.requireOverride} still apply. Has no effect when `env` or
   * `home` is injected, since neither test rule runs then.
   */
  testRoot?: boolean
}

/**
 * Resolve the base directories. Each root takes the first value set, in this
 * order:
 *
 * 1. `opts.overrides`.
 * 2. The root's own variable, `vars.dirs[key]` ({@link EnvVars.dirs}).
 * 3. `vars.root` ({@link EnvVars.root}), with the {@link rootedBaseDirs} layout.
 * 4. The per-OS table below, for the convention: {@link EnvVars.convention}
 *    when set (and `opts.conventionFromEnv` is not `false`), else
 *    `opts.convention`, else `native`. The variable is trimmed, then must be
 *    exactly `native` or `xdg`; anything else throws.
 *
 * Runtime follows durable: when the runtime variable is unset but durable is
 * moved by step 2 or 3, runtime is `<durable>/run`, never the OS runtime
 * directory. An empty variable counts as unset. A relative one throws. The
 * Rust crate's `BaseDirs::from_env` resolves steps 2–4 the same way. The parity
 * fixture's `env_cases` check that.
 *
 * The per-OS table follows. Linux, and macOS under `xdg`, use the XDG column.
 * Windows uses its column under both conventions.
 *
 * | home    | macOS, `native`                | XDG (Linux/other; macOS `xdg`)  | Windows              |
 * |---------|--------------------------------|---------------------------------|----------------------|
 * | durable | `~/Library/Application Support`| `$XDG_DATA_HOME`, `~/.local/share` | `%APPDATA%`, `<home>/AppData/Roaming` |
 * | config  | `~/Library/Application Support`| `$XDG_CONFIG_HOME`, `~/.config` | `%APPDATA%`, `<home>/AppData/Roaming` |
 * | cache   | `~/Library/Caches`             | `$XDG_CACHE_HOME`, `~/.cache`   | `%LOCALAPPDATA%`, `<home>/AppData/Local` |
 * | state   | `~/Library/Application Support`| `$XDG_STATE_HOME`, `~/.local/state` | `<local>/state`, where `<local>` is the cache entry |
 * | logs    | `~/Library/Logs`               | `$XDG_STATE_HOME`, `~/.local/state` | `<durable>/logs` |
 * | runtime | `<durable>/run`                | `$XDG_RUNTIME_DIR`, `<durable>/run` | `<durable>/run`  |
 * | scratch | `$TMPDIR`, `/tmp`              | `$TMPDIR`, `/tmp`               | `%TEMP%`, `%TMP%`, `<home>/AppData/Local/Temp` |
 *
 * A relative `XDG_*` value is ignored, as the XDG spec says, and `~` is not
 * expanded. Under XDG, logs and state share one directory.
 *
 * Two of those entries need care:
 *
 * - `logs` has no cross-platform library equivalent. macOS uses
 *   `~/Library/Logs`. Where the OS has no logs directory, logs go to
 *   `<durable>/logs`. They are never under `cache`.
 * - `runtime` is an OS directory only under the XDG table (Linux, and macOS
 *   under `xdg`), and only when `XDG_RUNTIME_DIR` is set. Everywhere else it
 *   is `<durable>/run`. It is not under cache on purpose, because the OS may
 *   purge cache while the process a pidfile describes is still alive.
 *   State is never cache either. On Windows it is `<local>/state`, beside
 *   each tier's cache folder. The reserved segment names keep them apart.
 *
 * `scratch` is read from the injected environment, not from `os.tmpdir()`.
 * `os.tmpdir()` reads the real `process.env`, so an injected environment
 * would no longer be the only one read. The Rust crate asks its own platform.
 * The two roots need not match, because parity checks only the paths below a
 * root.
 *
 * Throws {@link TieredDirsError}. Its `code` is `MISSING_BASE_DIR` when a
 * root falls back to the home directory and none can be found,
 * `RELATIVE_OVERRIDE` when an override variable is not absolute,
 * `INVALID_CONVENTION` when {@link EnvVars.convention} names no convention,
 * and `OVERRIDE_REQUIRED` as the second test rule below says. Headless CI and
 * sandboxes do not always have a home directory.
 *
 * Two test rules run first, and only when neither `env` nor `home` is
 * injected (an injected environment is the only one read):
 *
 * - In a test runner process with the root variable unset and `HOME` not
 *   moved, the root reads as {@link testRoot}:
 *   `<tmp>/tiered-dirs-test-<pid>-<start ms>`, unique per process and
 *   cached per module instance (per test file under Vitest's default isolation).
 *   `opts.testRoot: false` turns this rule off. The next one still applies.
 *   A test runner process is one of two kinds. The first has a test file as
 *   its entry point and runs under `NODE_ENV=test`, `NODE_TEST_CONTEXT` (set
 *   by `node --test`) or Bun. Bun counts on its own because `bun test` keeps a
 *   `NODE_ENV` that is already set. The second is a Vitest worker: it has
 *   `VITEST_WORKER_ID` or `VITEST_POOL_ID` set, and its entry point is a file
 *   in the `vitest` package's `dist/workers` folder (Vitest 4 and later) or
 *   tinypool's `dist/entry/process.js` or `dist/entry/worker.js` (Vitest 3 and
 *   earlier). A child a test spawns inherits the Vitest variables but has a
 *   different entry point, so it gets no default. A test that points `HOME` at
 *   a fixture, in-process or for a child, keeps that `HOME`.
 * - With {@link EnvVars.requireOverride} set, a root that would fall back to
 *   the per-OS table throws a {@link TieredDirsError} naming the fix.
 *
 * The Rust crate's `BaseDirs::from_env` applies the same two rules, with two
 * differences. It detects a test by its cargo test binary, not by the
 * environment. And the "`HOME` not moved" condition exists only here. A
 * TypeScript test can point `HOME` at a fixture to move the home, which a Rust
 * test cannot do through `dirs`, so the TypeScript rule gives way to it.
 * The cost is that a CI job whose `HOME` differs from the passwd home, such as
 * a GitHub Actions container job (`HOME=/github/home`, passwd home `/root`),
 * gets no test-root default. Set `<P>_ROOT` there.
 *
 * Stable in 0.x.
 */
export function systemBaseDirs(vars: EnvVars, opts: ResolveOptions = {}): BaseDirs {
  const platform = opts.platform ?? process.platform
  const over = stripUndefined(opts.overrides ?? {})
  const env =
    opts.env === undefined && opts.home === undefined
      ? guardedEnv(vars, process.env, over, opts.testRoot ?? true)
      : (opts.env ?? process.env)

  let cachedHome: string | undefined
  const home = (): string => (cachedHome ??= resolveHome(opts, platform, env))

  const fromVar = opts.conventionFromEnv === false ? undefined : envConvention(vars, env)
  const convention = fromVar ?? opts.convention ?? 'native'
  const fromEnv = envOverrides(vars, env, platform)
  const table = platformTable(platform, convention, env, home)
  const roots: Mutable<BaseDirs> = {
    durable: '',
    config: '',
    cache: '',
    state: '',
    logs: '',
    runtime: '',
    scratch: '',
  }
  for (const key of BASE_DIR_KEYS) {
    roots[key] = over[key] ?? fromEnv[key] ?? table[key]()
  }
  return roots
}

/**
 * The process environment with the test rules of {@link systemBaseDirs}
 * applied: the root variable filled in for a test, or a throw when
 * {@link EnvVars.requireOverride} forbids an OS fallback.
 */
function guardedEnv(
  vars: EnvVars,
  env: Record<string, string | undefined>,
  overrides: Partial<BaseDirs>,
  useTestRoot: boolean,
): Record<string, string | undefined> {
  if (env[vars.root]) return env
  const root = useTestRoot ? testRoot() : undefined
  if (root !== undefined && !homeMoved(env)) {
    return { ...env, [vars.root]: root }
  }
  if (env[vars.requireOverride]) {
    // Runtime follows a moved durable, so it needs no variable of its own.
    const required = BASE_DIR_KEYS.filter((key) => key !== 'runtime' && !overrides[key])
    const missing = required.find((key) => !env[vars.dirs[key]])
    if (missing !== undefined) {
      throw new TieredDirsError(
        'OVERRIDE_REQUIRED',
        `${vars.requireOverride} is set but neither ${vars.root} nor ${vars.dirs[missing]} is: ` +
          `set ${vars.root} to a scratch directory, or build from rootedBaseDirs`,
      )
    }
  }
  return env
}

/** The cached result of {@link testRoot}. */
let processTestRoot: { root: string | undefined } | undefined

/**
 * `<tmp>/tiered-dirs-test-<pid>-<start ms>` when this process is a test runner
 * process, else `undefined`. Resolved once per module instance: once per test
 * file under Vitest's default isolation, and once per installed copy of the
 * package.
 *
 * A test runner process is the one {@link systemBaseDirs} describes: a test
 * file as its entry point under `NODE_ENV=test`, `NODE_TEST_CONTEXT` or Bun,
 * or a Vitest worker. A child a test spawns is not one.
 *
 * The start time stops a later process with the same pid from using this
 * one's leftover files. Callers that read the environment themselves, such as
 * a product-tier layer, use this to apply the same default. The Rust crate's
 * `test_root()` is the same per-process root, detected by its cargo test
 * binary.
 *
 * Stable in 0.x.
 */
export function testRoot(): string | undefined {
  if (!processTestRoot) {
    processTestRoot = {
      root: isTestRunnerProcess(process.env)
        ? join(tmpdir(), `tiered-dirs-test-${process.pid}-${Date.now()}`)
        : undefined,
    }
  }
  return processTestRoot.root
}

/** A test file name: `*.test.ts`, `*_spec.mjs`, and the like. */
const TEST_FILE = /[._](test|spec)\.[cm]?[jt]sx?$/

/**
 * A Vitest worker's entry point: a file in the `vitest` package's
 * `dist/workers` folder (Vitest 4+), or tinypool's `dist/entry/process.js` or
 * `dist/entry/worker.js` (Vitest 3 and earlier).
 */
const VITEST_WORKER_ENTRY =
  /[\\/]vitest[\\/]dist[\\/]workers[\\/]|[\\/]tinypool[\\/]dist[\\/]entry[\\/](process|worker)\.[cm]?js$/

/** Whether this process is a test runner running a test file (see {@link systemBaseDirs}). */
export function isTestRunnerProcess(
  env: Record<string, string | undefined>,
  entry: string = process.argv[1] ?? '',
): boolean {
  // Vitest sets its variables in the worker's environment, so a child a test
  // spawns inherits them; its entry point is what tells it apart.
  if (
    Boolean(env['VITEST_WORKER_ID'] || env['VITEST_POOL_ID']) &&
    VITEST_WORKER_ENTRY.test(entry)
  ) {
    return true
  }
  const runner =
    process.versions.bun !== undefined ||
    env['NODE_ENV'] === 'test' ||
    Boolean(env['NODE_TEST_CONTEXT'])
  return runner && TEST_FILE.test(entry)
}

/**
 * Whether `HOME` differs from the user's home as the runtime reports it: the
 * passwd entry under node, the `HOME` the process started with under bun.
 */
function homeMoved(env: Record<string, string | undefined>): boolean {
  const home = env['HOME']
  if (!home) return false
  try {
    return home !== userInfo().homedir
  } catch {
    return false
  }
}

/** {@link EnvVars.convention}, parsed: trimmed, then exactly `native` or `xdg`. */
function envConvention(
  vars: EnvVars,
  env: Record<string, string | undefined>,
): Convention | undefined {
  const value = env[vars.convention]
  if (!value) return undefined
  const trimmed = value.trim()
  const convention = findConvention(trimmed)
  if (convention !== undefined) return convention
  throw new TieredDirsError(
    'INVALID_CONVENTION',
    `${vars.convention} must be "native" or "xdg", got ${JSON.stringify(value)}`,
  )
}

/** Steps 2 and 3 of {@link systemBaseDirs}: the roots the environment moves. */
function envOverrides(
  vars: EnvVars,
  env: Record<string, string | undefined>,
  platform: string,
): Partial<BaseDirs> {
  const read = (name: string): string | undefined => {
    const value = env[name]
    if (!value) return undefined
    if (!isAbsolutePath(value, platform)) {
      throw new TieredDirsError('RELATIVE_OVERRIDE', `${name} must be an absolute path`)
    }
    return value
  }
  const rootValue = read(vars.root)
  const rooted = rootValue === undefined ? undefined : rootedBaseDirs(rootValue)
  const out: Mutable<Partial<BaseDirs>> = {}
  for (const key of BASE_DIR_KEYS) {
    if (key === 'runtime') continue
    const value = read(vars.dirs[key]) ?? rooted?.[key]
    if (value !== undefined) out[key] = value
  }
  const runtime =
    read(vars.dirs.runtime) ??
    (out.durable === undefined ? undefined : join(out.durable, RUNTIME_FALLBACK_SEGMENT))
  if (runtime !== undefined) out.runtime = runtime
  return out
}

/**
 * The XDG layout under `home`, with the `XDG_*` variables read from `env`: the
 * `xdg` table, on any host. Each home is its `XDG_*` variable when that holds
 * an absolute path, else its default under `home`. Logs share the state home.
 * Scratch is `$TMPDIR`, else `/tmp`.
 *
 * The Rust crate's `BaseDirs::xdg` builds the same layout. The parity
 * fixture's `convention_cases` check that.
 *
 * Stable in 0.x.
 */
export function xdgBaseDirs(home: string, env: Record<string, string | undefined>): BaseDirs {
  const table = xdgTable(env, () => home, 'linux')
  return {
    durable: table.durable(),
    config: table.config(),
    cache: table.cache(),
    state: table.state(),
    logs: table.logs(),
    runtime: table.runtime(),
    scratch: table.scratch(),
  }
}

type Table = Record<keyof BaseDirs, () => string>

/**
 * The per-OS table, one function per root. Each runs only when called, so an
 * overridden root skips its entry and the home lookup that entry would make.
 */
function platformTable(
  platform: string,
  convention: Convention,
  env: Record<string, string | undefined>,
  home: () => string,
): Table {
  if (platform === 'darwin' && convention === 'native') {
    const support = (): string => join(home(), 'Library', 'Application Support')
    return {
      durable: support,
      config: support,
      cache: () => join(home(), 'Library', 'Caches'),
      state: support,
      logs: () => join(home(), 'Library', 'Logs'),
      runtime: () => join(support(), RUNTIME_FALLBACK_SEGMENT),
      scratch: () => posixScratch(env, platform),
    }
  }

  // Windows uses its own places under both conventions: `xdg` means `native`.
  if (platform === 'win32') {
    const roaming = (): string =>
      absoluteEnv(env, 'APPDATA', platform) ?? join(home(), 'AppData', 'Roaming')
    const local = (): string =>
      absoluteEnv(env, 'LOCALAPPDATA', platform) ?? join(home(), 'AppData', 'Local')
    return {
      durable: roaming,
      config: roaming,
      cache: local,
      state: () => join(local(), 'state'),
      logs: () => join(roaming(), 'logs'),
      runtime: () => join(roaming(), RUNTIME_FALLBACK_SEGMENT),
      scratch: () =>
        absoluteEnv(env, 'TEMP', platform) ??
        absoluteEnv(env, 'TMP', platform) ??
        join(home(), 'AppData', 'Local', 'Temp'),
    }
  }

  return xdgTable(env, home, platform)
}

/** The XDG table: Linux and other Unix systems, and macOS under `xdg`. */
function xdgTable(
  env: Record<string, string | undefined>,
  home: () => string,
  platform: string,
): Table {
  const durable = (): string =>
    absoluteEnv(env, 'XDG_DATA_HOME', platform) ?? join(home(), '.local', 'share')
  const state = (): string =>
    absoluteEnv(env, 'XDG_STATE_HOME', platform) ?? join(home(), '.local', 'state')
  return {
    durable,
    config: () => absoluteEnv(env, 'XDG_CONFIG_HOME', platform) ?? join(home(), '.config'),
    cache: () => absoluteEnv(env, 'XDG_CACHE_HOME', platform) ?? join(home(), '.cache'),
    state,
    logs: state,
    runtime: () =>
      absoluteEnv(env, 'XDG_RUNTIME_DIR', platform) ?? join(durable(), RUNTIME_FALLBACK_SEGMENT),
    scratch: () => posixScratch(env, platform),
  }
}

function posixScratch(env: Record<string, string | undefined>, platform: string): string {
  return absoluteEnv(env, 'TMPDIR', platform) ?? '/tmp'
}

function resolveHome(
  opts: ResolveOptions,
  platform: string,
  env: Record<string, string | undefined>,
): string {
  if (opts.home !== undefined) {
    if (opts.home === '') {
      throw new TieredDirsError('MISSING_BASE_DIR', 'home must be a non-empty path')
    }
    return opts.home
  }

  // Rust's `dirs` ignores HOME on Windows, and under Cygwin or MSYS it can be
  // a POSIX-style path, so Windows reads USERPROFILE only. A relative value
  // counts as unset: every path built on it would land in the cwd.
  const fromEnv = platform === 'win32' ? env['USERPROFILE'] : env['HOME']
  if (fromEnv && isRootedHome(fromEnv, platform)) return fromEnv

  // With an injected environment, do not fall back to the host's real home.
  // That would make a test's paths depend on the machine running it.
  if (opts.env !== undefined) {
    throw new TieredDirsError(
      'MISSING_BASE_DIR',
      'no home directory: the supplied environment sets neither HOME nor USERPROFILE to an absolute path',
    )
  }

  // `os.homedir()` returns HOME as given, so the account's home comes first.
  for (const read of [() => userInfo().homedir, homedir]) {
    let host = ''
    try {
      host = read()
    } catch {
      host = ''
    }
    if (host && isRootedHome(host, platform)) return host
  }

  throw new TieredDirsError(
    'MISSING_BASE_DIR',
    'no home directory: HOME is unset or relative and the OS reports none — pass `home` or `overrides`',
  )
}

/**
 * An environment variable, honoured only when it names an absolute path.
 * The XDG spec says a relative value is invalid and must be ignored.
 */
function absoluteEnv(
  env: Record<string, string | undefined>,
  key: string,
  platform: string,
): string | undefined {
  const value = env[key]
  if (!value) return undefined
  return isAbsolutePath(value, platform) ? value : undefined
}

/**
 * A home that does not depend on the cwd. Looser than {@link isAbsolutePath}
 * on Windows, where a home such as `/h` or `\h` is on the current drive.
 */
function isRootedHome(value: string, platform: string): boolean {
  return platform === 'win32' ? win32.isAbsolute(value) : value.startsWith('/')
}

/** `path.isAbsolute` for a named platform rather than the host's. */
function isAbsolutePath(value: string, platform: string): boolean {
  if (platform === 'win32') {
    return /^[a-z]:[\\/]/i.test(value) || value.startsWith('\\\\') || value.startsWith('//')
  }
  return value.startsWith('/')
}

/** Drop explicit `undefined` entries so an override cannot blank out a root. */
function stripUndefined(overrides: Partial<BaseDirs>): Partial<BaseDirs> {
  const out: Mutable<Partial<BaseDirs>> = {}
  for (const key of BASE_DIR_KEYS) {
    const value = overrides[key]
    if (value !== undefined) out[key] = value
  }
  return out
}
