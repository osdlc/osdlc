/**
 * The provider contract: the extension point, a small object per harness.
 *
 * A provider reads one harness. The built-ins are ordinary providers, so a
 * caller can add a harness:
 *
 *   detect({ providers: [...builtinProviders, mine] })
 *
 * Two rules keep providers honest and testable:
 *
 *   1. They never read the file system or spawn directly. Every read goes
 *      through the {@link ProviderContext}, which enforces `project` mode (no
 *      read outside the project) and is what tests replace.
 *   2. They never report their own install. `detect()` looks the declared
 *      `binary` up, so a provider cannot misreport whether its program exists.
 */

import type { AsyncCommandRunner } from '@osdlc/command-seam'

import type { HarnessReport, DetectMode } from './report.ts'

/** Whether a provider must run a program to do its job. A built-in is `parse`. */
export type ProviderKind = 'parse' | 'exec'

/** One entry of a folder listing. */
export interface DirEntry {
  name: string
  isFile: boolean
  isDirectory: boolean
}

/** A JSON file, read: absent, parsed (an object), or an error with its message. */
export type JsonRead =
  | { status: 'absent' }
  | { status: 'parsed'; value: Record<string, unknown> }
  | { status: 'error'; error: string }

/** A text file, read. */
export type TextRead =
  { status: 'absent' } | { status: 'parsed'; text: string } | { status: 'error'; error: string }

export interface ProviderContext {
  /** The provider's id. */
  harness: string
  /** Absolute. */
  projectRoot: string
  /** `null` in `project` mode. */
  home: string | null
  env: Readonly<Record<string, string | undefined>>
  platform: NodeJS.Platform
  /** The file-system root for system paths (`/`). */
  systemRoot: string
  mode: DetectMode
  allowExec: boolean
  /** Return markdown bodies of skills, commands and agents. */
  readContents: boolean
  /** Keep MCP values as written: `env` and header values, URL credentials and secret-looking `args`. */
  includeValues: boolean
  /** Read a text file. Memoized for one `detect()` call. */
  readText(path: string): TextRead
  /** Read a JSON file that must hold an object. Memoized for one `detect()` call. */
  readJson(path: string): JsonRead
  exists(path: string): boolean
  isDirectory(path: string): boolean
  /** A folder's entries, sorted by name; `[]` when it cannot be listed. */
  listDir(path: string): DirEntry[]
  /** The real path, or `null` when it does not resolve. */
  realpath(path: string): string | null
  /** `PATH` lookup, no subprocess. */
  which(binary: string): string | null
  /** A runner for `binary`. Throws unless `allowExec` is set. */
  runner(binary: string): AsyncCommandRunner
  signal: AbortSignal
}

/** What a provider returns; `detect()` fills every field it leaves out with an empty value. */
export type ProviderResult = Partial<
  Omit<HarnessReport, 'harness' | 'label' | 'install' | 'skippedForExec'>
>

export interface HarnessProvider {
  /** Stable id; becomes `HarnessReport.harness`. The built-ins use the ids in {@link BUILTIN_HARNESSES}. */
  id: string
  label: string
  kind: ProviderKind
  /** The CLI to look for on `PATH`. `detect()` probes it; the provider never does. */
  binary?: string | undefined
  /**
   * App bundles that also count as an install, as templates (`~/…`,
   * `{system}/…`, `{project}/…`). A `{<base>}` template needs a built-in id.
   */
  appBundles?: readonly string[] | undefined
  /**
   * Read the harness. Return `status: 'absent'` when nothing is there; or leave
   * `status` out, and `detect()` reports `ok` when the program, a folder or a
   * parsed file was found.
   */
  collect(ctx: ProviderContext): ProviderResult | Promise<ProviderResult>
}

export interface DetectOptions {
  /** Default `process.cwd()`. */
  projectRoot?: string | undefined
  /** Default `os.homedir()`. Ignored in `project` mode. */
  home?: string | undefined
  /** Default `process.env`. */
  env?: Readonly<Record<string, string | undefined>> | undefined
  /**
   * `full` (default) reads the machine and the project. `project` reads the
   * project's files only: no home folder, no system folder, no install probe
   * and no sign-in evidence. It is the mode for project introspection.
   */
  mode?: DetectMode | undefined
  /** Defaults to the built-in providers. Pass your own to add or replace. */
  providers?: readonly HarnessProvider[] | undefined
  /** Only these harness ids. */
  only?: readonly string[] | undefined
  /** Skip these harness ids. */
  exclude?: readonly string[] | undefined
  /** Binary names per harness id, replacing the provider's (for a setup that renames one). */
  binaries?: Readonly<Record<string, string>> | undefined
  /**
   * Permit subprocesses: `<binary> --version` for the install version. Default
   * `false`, so pointing `detect()` at a machine or a project runs nothing.
   */
  allowExec?: boolean | undefined
  /** Return skill, command and agent bodies. Default `false`. */
  readContents?: boolean | undefined
  /** Keep MCP values as written: `env` and header values, URL credentials and secret-looking `args`. Default `false`; see README, Secrets. */
  includeValues?: boolean | undefined
  /** `PATH` lookup. Default walks `env.PATH`. Tests inject this. */
  which?: ((binary: string) => string | null) | undefined
  /** Build the runner for a binary path. Default `spawnRunnerAsync`. Tests inject this. */
  makeRunner?: ((binary: string) => AsyncCommandRunner) | undefined
  /** Default `process.platform`. Decides the managed-settings folder. */
  platform?: NodeJS.Platform | undefined
  /** The root for system paths (`/Library/…`, `/etc/…`). Default `/`. Tests point it at a temp folder. */
  systemRoot?: string | undefined
  signal?: AbortSignal | undefined
}
