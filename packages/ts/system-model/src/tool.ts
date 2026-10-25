/**
 * The registry types: a tool described once with the roles it plays, an
 * ecosystem as data, and the profile detection returns.
 *
 * Data is stored per tool and queried per role. One `ToolDef` holds everything
 * known about a tool. Callers ask a specific question by role through
 * `Project`.
 */

import type { Evidence, EvidenceKind } from './aspect.ts'
import type { ProviderContext, ProviderKind, RunnerContext } from './contract.ts'
import type { ManifestFacts } from './manifests.ts'
import type {
  ChainSegment,
  Diagnostic,
  DiscoveryMode,
  ProviderResult,
  RunnerBrand,
  Task,
} from './model.ts'

/**
 * A file pattern that indicates a tool is in use, and the evidence kind a
 * match counts as. The pattern language is `ProviderContext.files`'s.
 */
export interface Marker {
  files: string
  tier: EvidenceKind
  /** The file marks a repository root, so `findRoot` stops at its directory. */
  workspaceRoot?: boolean | undefined
}

/** The names of the roles a tool can play. */
export type RoleName = 'packageManager' | 'runner' | 'toolManager' | 'hookManager'

/**
 * A tool that installs an ecosystem's dependencies.
 *
 * @experimental
 */
export interface PackageManagerRole {
  /**
   * Files whose presence selects this manager, such as lockfiles. Each counts
   * as a marker, and a directory holding one is a package.
   */
  lockfiles: readonly string[]
  /** `['pnpm', 'install']`. */
  install: readonly string[]
  /** Install when the manager was chosen with no lockfile (`npm install`, not `npm ci`). */
  installUnlocked?: readonly string[] | undefined
  /** Flags that refuse to change the lockfile. `[]` when `install` already does. */
  frozen?: readonly string[] | undefined
  /**
   * `argv` (an install, frozen or not) aimed at the package in `dir`, through
   * the tool's own directory flag (`pnpm --dir apps/web install`). Without
   * it, a synthesized install task runs in `cwd`.
   */
  inDir?: ((argv: readonly string[], dir: string) => string[]) | undefined
  /** Directories an install leaves in the package. Any one present means installed. */
  depsDirs?: readonly string[] | undefined
  /** The version a package pins this manager to, if it pins one. */
  pin?: ((pkg: Package) => string | undefined) | undefined
  /** How this manager runs a package script, for a runner that needs it. */
  run?:
    | {
        verb: readonly string[]
        /** Flag that points the verb at another directory. */
        dirFlag: string
        /** Arguments go after `--` rather than straight after the script name. */
        separator?: boolean | undefined
        /** `dirFlag` goes straight after the binary, before the rest of `verb` (`yarn --cwd dir run`). */
        dirFlagFirst?: boolean | undefined
      }
    | undefined
}

/**
 * A tool that lists runnable tasks. The tool's id is the runner's id and
 * `Task.runner`.
 */
export interface RunnerRole {
  kind: ProviderKind
  /** What each position of this runner's `Task.path` means. */
  chain?: ChainSegment[] | undefined
  brand?: RunnerBrand | undefined
  /**
   * Patterns whose files decide whether a cached result is still good, for
   * a runner whose tool merges files it never reads.
   */
  watch?: string[] | undefined
  /**
   * List the tasks. Called only when the tool was detected, with the
   * packages where it was found.
   */
  collect(ctx: RunnerContext, packages: readonly Package[]): Promise<ProviderResult>
  /**
   * The argv that runs `task` with `args` bound the way this tool expects.
   * Defaults to appending them.
   */
  invoke?: ((task: Task, args: readonly string[]) => string[]) | undefined
}

/**
 * A tool that installs and runs other tools at pinned versions.
 *
 * @experimental
 */
export interface ToolManagerRole {
  /** Config files. Each counts as a marker. */
  configs: readonly string[]
  /** `['mise', 'install']`. */
  install?: readonly string[] | undefined
  /** The argv that runs `binary` through this manager. */
  exec?: ((binary: string) => string[]) | undefined
  /** Environment that trusts `root`'s config for one call only. */
  trustEnv?: ((root: string) => Record<string, string>) | undefined
  /** The one-time grant the tool needs before it reads a config (`mise trust`). */
  trust?: readonly string[] | undefined
}

/**
 * One git hook a hook manager has configured.
 *
 * @experimental
 */
export interface HookDef {
  /** The hook name, such as `pre-commit`, or the hook id for pre-commit. */
  name: string
  /** The argv that runs it by hand. */
  argv: string[]
  /** The file that configures it. */
  source: string
}

/**
 * A tool that arms a repository's git hooks.
 *
 * @experimental
 */
export interface HookManagerRole {
  /** Config files or directories. Each counts as a marker. */
  configs: readonly string[]
  /** The argv that arms the hooks in a fresh checkout. */
  arm(pkg: Package): string[]
  /** Each configured hook, read from `config`. */
  hooks?: ((ctx: ProviderContext, config: string) => Promise<HookDef[]>) | undefined
}

/**
 * What a `describe` function learned about one directory.
 *
 * @experimental
 */
export interface ToolFact {
  /** Root-relative directory the fact is about. */
  dir: string
  fact: unknown
  /** Why the fact holds, so a package with no other evidence can carry it. */
  evidence: Evidence
}

/**
 * One tool, described once.
 *
 * A built-in and a downstream tool are both a `ToolDef`, so a built-in can do
 * nothing a downstream tool cannot.
 */
export interface ToolDef {
  /** Stable id: `pnpm`, `cargo`, `mise`. */
  id: string
  /** The binary its commands run through, for a PATH check. */
  binary?: string | undefined
  /** Other first words of a command that mean this tool (`bunx`, `pip3`). */
  commandWords?: readonly string[] | undefined
  ecosystem?: EcosystemDef | undefined
  /** Files that indicate the tool is in use. Lockfiles and configs in roles count too. */
  markers?: readonly Marker[] | undefined
  /**
   * Evidence a file name cannot give, such as a `packageManager` field. Reads
   * files only and never spawns a process.
   */
  detect?: ((ctx: ProviderContext, packages: readonly Package[]) => Promise<Evidence[]>) | undefined
  /**
   * Facts about a detected tool that may need its own binary, such as moon's
   * project roles. Must not spawn a process unless `ctx.allowExec` is true.
   *
   * @experimental
   */
  describe?:
    ((ctx: ProviderContext, packages: readonly Package[]) => Promise<ToolFact[]>) | undefined
  roles: {
    packageManager?: PackageManagerRole | undefined
    runner?: RunnerRole | undefined
    toolManager?: ToolManagerRole | undefined
    hookManager?: HookManagerRole | undefined
  }
}

/**
 * A manifest an ecosystem reads. A directory with one is a package.
 */
export interface ManifestDef {
  files: string
  /** The tool a manifest implies, such as `cargo` for `Cargo.toml`. */
  tool?: string | undefined
  /** The `ManifestFacts` slot its parsed form goes in. */
  slot?: keyof ManifestFacts | undefined
  /** Parse the text. Throw when the file is malformed. */
  parse?: ((text: string, path: string) => unknown) | undefined
}

/**
 * A language label an ecosystem gives a package. The first rule that matches
 * wins. A rule with no condition always matches.
 */
export interface LanguageRule {
  id: string
  /** Basenames in the package directory that select it. */
  files?: readonly string[] | undefined
  /** Dependency names that select it. */
  dependencies?: readonly string[] | undefined
  /** Tool ids that select it when detected in the package. */
  tools?: readonly string[] | undefined
}

/** A language platform: its manifests, its languages and its tools in precedence order. */
export interface EcosystemDef {
  id: string
  manifests: readonly ManifestDef[]
  languages: readonly LanguageRule[]
  /** Tool ids, highest precedence first (node: bun, pnpm, yarn, npm). */
  tools: readonly string[]
  /** The package manager to assume when a package has a manifest and no lockfile. */
  fallback?: string | undefined
  /**
   * The member globs a package's manifest declares as a workspace, relative to
   * the package (`["crates/*"]`). A `!` glob removes a member. `undefined`
   * when it declares no workspace. `null` when it is a workspace root whose
   * members could not be read, so every package below counts as a member.
   * A member takes its workspace root's lockfile, and with no lockfile
   * installs at that root.
   */
  workspace?: ((pkg: Package) => readonly string[] | null | undefined) | undefined
}

/** One detected tool in one package. */
export interface Detected {
  tool: string
  ecosystem?: string | undefined
  roles: RoleName[]
  /** Never empty. */
  evidence: Evidence[]
  /**
   * What `describe` learned, when the tool has one: each fact with the
   * directory it is about and its evidence. A fact's `dir` can be below this
   * package when that directory has no manifest of its own.
   */
  facts?: ToolFact[] | undefined
}

/**
 * One directory with at least one manifest or lockfile. The root is always a
 * package. Config that is not a manifest belongs to the package of its
 * directory, or the nearest one above it.
 */
export interface Package {
  /** Root-relative. `.` for the root. */
  dir: string
  ecosystems: string[]
  languages: string[]
  manifests: ManifestFacts
  /** Every manifest path in this directory, parsed or not. */
  manifestFiles: string[]
  tools: Detected[]
}

/** A manifest found but too malformed to parse. */
export interface MalformedManifest {
  path: string
  error: string
}

/** What `Project.detect` returns. */
export interface ProjectProfile {
  /** Absolute. */
  root: string
  generatedAt: string
  discovery: DiscoveryMode
  /** Whether `describe` functions were allowed to run subprocesses. */
  allowExec: boolean
  /** The extra exclude list discovery ran with, as passed. */
  excludePaths: string[]
  /** Whether discovery added `DEFAULT_EXCLUDES` to `excludePaths`. */
  useBuiltinExcludes: boolean
  /** Sorted by `dir`, root first. */
  packages: Package[]
  /** The union over packages, in registry order. */
  ecosystems: string[]
  languages: string[]
  tools: string[]
  malformed: MalformedManifest[]
  /**
   * What detection could not cover, such as a directory walk that stopped at
   * `MAX_WALK_FILES` or `MAX_WALK_DEPTH`. Always set by `detect`; optional so
   * a profile stored by an older version still reads.
   */
  diagnostics?: Diagnostic[] | undefined
}
