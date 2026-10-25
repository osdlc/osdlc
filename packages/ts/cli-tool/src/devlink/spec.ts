/**
 * What devlink needs to know about one tool: how to recognise a checkout of
 * it, what to run inside one, and which environment variables steer it.
 *
 * A spec is data the tool itself declares once and passes to every devlink
 * call. Nothing here touches the filesystem.
 */

import type { VendorDirs } from '@osdlc/config-layers/dirs'

/**
 * What describes a tool that is run from a development checkout: its name,
 * launcher, marker file and vendor directories.
 * @experimental
 */
export interface ToolSpec {
  /**
   * The command name, such as `tooly`. It is the PATH name `install` writes,
   * the standalone segment the state lives under (`<config>/<name>/`),
   * and the stem of every environment variable.
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
   * The source entry to run under Bun inside a selected checkout, relative to
   * the checkout root. Defaults to {@link marker}.
   */
  entry?: string
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
   * Environment variables whose presence turns off the cwd layer and the link
   * layer. The explicit `<NAME>_HOME` override still applies. A tool that is
   * run by a host program names that host's root variable here, so a
   * machine-wide link never changes which code the host runs.
   */
  suppressors?: readonly string[]
  /**
   * Whose config home the state lives in: the vendor and its override
   * variables. The bash launcher reads the `xdg` default and ignores the
   * override variables.
   */
  vendorDirs: VendorDirs
}

/**
 * `tooly` → `TOOLY`; `pr-updater` → `PR_UPDATER`.
 *
 * @experimental
 */
export function envStem(spec: ToolSpec): string {
  return spec.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
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
 * Set to `1` to silence the launcher's "running X (why)" line on stderr.
 *
 * @experimental
 */
export function quietVar(spec: ToolSpec): string {
  return `${envStem(spec)}_QUIET`
}

/**
 * Exported by the launcher into the process it execs: which resolution layer
 * chose the code (`env`, `cwd`, `link`, or `local` for the launcher's own
 * checkout). Unset when the process was not started through the launcher.
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
  for (const [field, value] of [
    ['marker', spec.marker],
    ['entry', spec.entry ?? spec.marker],
    ['launcher', spec.launcher],
  ] as const) {
    if (value.length === 0 || value.startsWith('/') || value.split('/').includes('..')) {
      throw new Error(
        `devlink: ${field} must be a relative path inside the checkout, got ${JSON.stringify(value)}`,
      )
    }
  }
  if (spec.packageName !== undefined && spec.packageName.length === 0) {
    throw new Error('devlink: packageName must not be empty')
  }
  return spec
}
