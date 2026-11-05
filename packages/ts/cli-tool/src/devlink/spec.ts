/**
 * What devlink needs to know about one tool: how to recognise a checkout of
 * it, what to run inside one, and which environment variables steer it.
 *
 * A spec is data the tool itself declares once and passes to every devlink
 * call. Nothing here touches the filesystem.
 */

import { envStem as stemOf, type VendorDirs } from '@osdlc/config-layers/dirs'

/**
 * What describes a tool that is run from a development checkout: its name,
 * launcher, marker file and vendor directories.
 * @experimental
 */
export interface ToolSpec {
  /**
   * The command name, such as `tooly`. It is the PATH name `install` writes,
   * the standalone segment the state lives under (`<config>/<name>/`, unless
   * {@link stateDir} moves it), and the stem of every environment variable.
   */
  name: string
  /**
   * A path, relative to a checkout root, that exists in every checkout of this
   * tool and in nothing else. It is the test for "is this directory a checkout".
   * Usually the source entry itself, e.g. `src/cli.ts`.
   */
  marker: string
  /**
   * The `name` a checkout's `package.json` must have. When set, a directory
   * is a checkout only when it has both the marker and this name. A common
   * marker such as `src/cli.ts` alone matches many unrelated projects.
   * `renderLauncher` rejects a spec that sets it, because the bash launcher
   * cannot read JSON.
   */
  packageName?: string
  /**
   * Turns on the cwd layer: a checkout above the working directory runs
   * instead of the install. Off by default. When on, standing in any
   * directory that passes the checkout test runs that directory's code, so
   * turn it on only when the marker (with {@link packageName}) cannot match a
   * project you did not choose.
   */
  cwdLayer?: boolean
  /**
   * The project layer: a copy of this package installed in a project's
   * `node_modules` above the working directory runs instead of this one, so
   * a project can pin the version it uses, as `npx` would run it. On by
   * default when {@link packageName} is set, and only then: it names the
   * package to look for. Set false to turn it off for this tool.
   */
  projectLayer?: boolean
  /**
   * The source entry a selected checkout runs, relative to the checkout
   * root, under {@link runtime}. Defaults to {@link marker}.
   */
  entry?: string
  /**
   * What runs a selected checkout's {@link entry}: `bun` (the default) runs
   * it with `bun run`, `node` runs it with `node <entry>`. Under node a
   * TypeScript entry (`.ts`, `.mts`, `.cts`) runs from source through
   * Node's type stripping, which needs Node 22.18 or later; a `.js` entry
   * runs as it is. `dev link` and `dev use` check that the entry can run.
   * The bash launcher runs its own checkout's source the same way. A
   * project's copy is not affected: it runs under the runtime its bin's
   * `#!` line names.
   */
  runtime?: 'bun' | 'node'
  /**
   * The executable the PATH shim from `install` runs, relative to the checkout
   * root. It is the tool's own launcher: a bash script that resolves before any
   * runtime is chosen, or a shebang JavaScript shim that calls
   * {@link execSelection}.
   */
  launcher: string
  /**
   * Extra PATH names `install` also writes, each a shim for the same
   * launcher. `tooly` can install as both `ty` and `tooly`.
   */
  aliases?: readonly string[]
  /**
   * Environment variables whose presence turns off the cwd, link and project
   * layers. The explicit `<NAME>_HOME` override still applies. A tool that is
   * run by a host program names that host's root variable here, so a
   * machine-wide link never changes which code the host runs.
   */
  suppressors?: readonly string[]
  /**
   * Whose config home the state lives in: the vendor and its override
   * variables. The bash launcher reads the same path: the vendor's
   * `<P>_CONFIG_DIR`, then `<P>_ROOT`, then {@link stateDir} when set, else
   * the `xdg` default (it always uses the `xdg` convention and ignores
   * `<P>_CONVENTION`). A relative value of the one in use reads no link.
   * The launcher reads only those two: a
   * relative override of another kind (such as `<P>_CACHE_DIR`), or
   * `<P>_REQUIRE_OVERRIDE`, makes `dev link` throw but does not stop the
   * launcher following a link written before.
   */
  vendorDirs: VendorDirs
  /**
   * Where the state lives when no override variable moves it, in place of
   * the `xdg` default: a directory under the user's home, written `~/` and
   * then one or more segments, such as `~/.tooly`. It is the directory that
   * holds the `home` and `history.jsonl` files; `<name>` is not appended. The
   * vendor's `<P>_CONFIG_DIR` and `<P>_ROOT` still win and still place the
   * state at `<dir>/<name>` and `<root>/config/<name>`. `XDG_CONFIG_HOME` is
   * not read when this is set. The bash launcher bakes the same path in.
   *
   * Each segment is letters, digits, `.`, `_` and `-`, and not `.` or `..`.
   * `validateSpec` and `renderLauncher` refuse anything else. A function of
   * the home directory is not accepted, because the launcher could not run it.
   */
  stateDir?: string
}

/**
 * `tooly` → `TOOLY`; `pr-updater` → `PR_UPDATER`. config-layers' `envStem` of
 * the name, so the machine file's variable and devlink's never disagree.
 *
 * @experimental
 */
export function envStem(spec: ToolSpec): string {
  return stemOf(spec.name)
}

/**
 * The explicit override: an absolute checkout path that always wins. A
 * relative value is ignored.
 *
 * @experimental
 */
export function homeVar(spec: ToolSpec): string {
  return `${envStem(spec)}_HOME`
}

/**
 * Set to `0` to turn the cwd layer off for a shell. It has no effect unless
 * the spec sets `cwdLayer`.
 *
 * @experimental
 */
export function cwdDevVar(spec: ToolSpec): string {
  return `${envStem(spec)}_CWD_DEV`
}

/**
 * Whether the cwd layer is on: the spec sets `cwdLayer`, no suppressor is set
 * (`isSuppressed`), and `<NAME>_CWD_DEV` is not `0`. `resolve` and `status`
 * both ask this.
 * @internal
 */
export function cwdLayerActive(
  spec: ToolSpec,
  env: Record<string, string | undefined>,
  isSuppressed: boolean,
): boolean {
  return spec.cwdLayer === true && !isSuppressed && env[cwdDevVar(spec)] !== '0'
}

/**
 * Set to `0` to turn the project layer off for a shell.
 *
 * @experimental
 */
export function projectVar(spec: ToolSpec): string {
  return `${envStem(spec)}_PROJECT`
}

/**
 * Whether the project layer is on: the spec sets `packageName` and does not
 * set `projectLayer: false`, no suppressor is set (`isSuppressed`), and
 * `<NAME>_PROJECT` is not `0`. `resolve` and `status` both ask this.
 * @internal
 */
export function projectLayerActive(
  spec: ToolSpec,
  env: Record<string, string | undefined>,
  isSuppressed: boolean,
): boolean {
  return (
    spec.packageName !== undefined &&
    spec.projectLayer !== false &&
    !isSuppressed &&
    env[projectVar(spec)] !== '0'
  )
}

/**
 * Set to `1` to silence the launcher's "running X (why)" line on stderr.
 *
 * @experimental
 */
export function quietVar(spec: ToolSpec): string {
  return `${envStem(spec)}_QUIET`
}

/**
 * Exported by the launcher into the process it execs: which resolution layer
 * chose the code (`env`, `cwd`, `link`, `project`, or `local` for the
 * launcher's own checkout). Unset when the process was not started through the launcher.
 * @experimental
 */
export function launchLayerVar(spec: ToolSpec): string {
  return `${envStem(spec)}_LAUNCH_LAYER`
}

/**
 * The source entry a selected checkout runs, relative to its root.
 *
 * @experimental
 */
export function entryOf(spec: ToolSpec): string {
  return spec.entry ?? spec.marker
}

/**
 * What runs a selected checkout's entry: the spec's `runtime`, else `bun`.
 * @internal
 */
export function runtimeOf(spec: ToolSpec): 'bun' | 'node' {
  return spec.runtime ?? 'bun'
}

/**
 * Every PATH name `install` writes: the tool's own, then its aliases.
 *
 * @experimental
 */
export function pathNames(spec: ToolSpec): string[] {
  return [spec.name, ...(spec.aliases ?? [])]
}

/**
 * Reject a spec that would produce an unusable launcher or state path before
 * any filesystem work happens. Returns the spec so a tool can declare
 * `export const SPEC = validateSpec({...})`.
 * @experimental
 */
export function validateSpec(spec: ToolSpec): ToolSpec {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(spec.name)) {
    throw new Error(
      `devlink: tool name must be a single path segment, got ${JSON.stringify(spec.name)}`,
    )
  }
  // `install` writes each alias as join(binDir, alias), so it is held to the same rule.
  for (const alias of spec.aliases ?? []) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(alias)) {
      throw new Error(`devlink: alias must be a single path segment, got ${JSON.stringify(alias)}`)
    }
  }
  for (const [field, value] of [
    ['marker', spec.marker],
    ['entry', spec.entry ?? spec.marker],
    ['launcher', spec.launcher],
  ] as const) {
    // A `.` or empty segment would throw off the launcher's `..` count back to
    // the checkout root, which is taken from the path as written.
    const segments = value.split('/')
    if (
      value.length === 0 ||
      value.startsWith('/') ||
      segments.some((s) => s === '..' || s === '.' || s === '')
    ) {
      throw new Error(
        `devlink: ${field} must be a relative path inside the checkout, got ${JSON.stringify(value)}`,
      )
    }
  }
  if (spec.packageName !== undefined && spec.packageName.length === 0) {
    throw new Error('devlink: packageName must not be empty')
  }
  if (spec.runtime !== undefined && spec.runtime !== 'bun' && spec.runtime !== 'node') {
    throw new Error(
      `devlink: runtime must be 'bun' or 'node', got ${JSON.stringify(spec.runtime as unknown)}`,
    )
  }
  // Node strips types but does not transform JSX, so it cannot run either.
  if (spec.runtime === 'node' && /\.[jt]sx$/.test(entryOf(spec))) {
    throw new Error(
      `devlink: node cannot run a JSX entry, got ${JSON.stringify(entryOf(spec))}; point entry at a .ts or .js file`,
    )
  }
  stateDirSegments(spec)
  return spec
}

/**
 * The segments of `spec.stateDir` below the home directory (`~/.tooly` →
 * `['.tooly']`), or null when the spec does not set it. Throws for a value
 * that is not `~/` and then safe segments: the bash launcher puts it inside a
 * double-quoted string, so `$`, quotes and backslashes must never reach it.
 * @internal
 */
export function stateDirSegments(spec: ToolSpec): string[] | null {
  const value = spec.stateDir
  if (value === undefined) return null
  const segments = value.startsWith('~/') ? value.slice(2).split('/') : []
  if (
    segments.length === 0 ||
    segments.some((s) => s === '.' || s === '..' || !/^[A-Za-z0-9._-]+$/.test(s))
  ) {
    throw new Error(
      `devlink: stateDir must be ~/ and then a relative path of letters, digits, '.', '_' and '-', got ${JSON.stringify(value)}`,
    )
  }
  return segments
}
