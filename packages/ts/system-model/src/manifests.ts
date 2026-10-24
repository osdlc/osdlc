/**
 * The parsed shape of each manifest a package can hold. Data only: the
 * parsers live with the ecosystem that owns each manifest.
 */

/**
 * Which dependency table declared a dependency.
 *
 * @experimental
 */
export type DepFactKind = 'prod' | 'dev' | 'peer' | 'optional' | 'build'

/**
 * What a dependency specifier points at.
 *
 * @experimental
 */
export type DepFactSpecifierKind = 'workspace' | 'file' | 'path' | 'registry' | 'other'

/**
 * One declared dependency.
 *
 * @experimental
 */
export interface DepFact {
  /** The real package name (a cargo rename's `package = "…"`, not its alias). */
  name: string
  kind: DepFactKind
  /** The raw specifier, verbatim. */
  specifier: string
  specifierKind: DepFactSpecifierKind
}

/**
 * A `package.json`.
 *
 * @experimental
 */
export interface PackageJsonFact {
  manifestPath: string
  name?: string | undefined
  main?: string | undefined
  types?: string | undefined
  /** String-valued `scripts` entries. */
  scripts: Record<string, string>
  /** Names under the four dependency tables, unioned and sorted. */
  dependencies: string[]
  /** The `packageManager` field, parsed: `pnpm@9.0.0` is `{ manager: 'pnpm', version: '9.0.0' }`. */
  packageManagerPin?: { manager: string; version: string } | undefined
  version?: string | undefined
  /** `"private": true`. Omitted when not declared. */
  private?: boolean | undefined
  description?: string | undefined
  /** `workspaces` globs, or `workspaces.packages`. Omitted when empty. */
  workspaces?: string[] | undefined
  /** A string or non-empty object `bin`. Omitted when there is none. */
  hasBin?: boolean | undefined
  /** Every dependency, table then key order. Omitted when there are none. */
  deps?: DepFact[] | undefined
}

/**
 * A `Cargo.toml`.
 *
 * @experimental
 */
export interface CargoFact {
  manifestPath: string
  /** Whether it declares a `[workspace]` table. */
  workspace: boolean
  /** `[package].name`. Absent for a virtual workspace root. */
  name?: string | undefined
  version?: string | undefined
  /** `[package].publish = false`. */
  private?: boolean | undefined
  description?: string | undefined
  /** `[workspace].members`. Omitted when empty. */
  workspaceMembers?: string[] | undefined
  /** `[workspace].exclude`. Omitted when empty. */
  workspaceExclude?: string[] | undefined
  /** `[[bin]]` sections present. */
  hasBin?: boolean | undefined
  deps?: DepFact[] | undefined
  /** Set when the file could not be read or parsed. `workspace` is then `false`, or found by a regex. */
  error?: string | undefined
}

/**
 * A `pyproject.toml`.
 *
 * @experimental
 */
export interface PyprojectFact {
  manifestPath: string
  /** `[project].name`, else `[tool.poetry].name`. */
  name?: string | undefined
  version?: string | undefined
  /**
   * `[project.scripts]` and `[tool.poetry.scripts]`, name to entry point
   * (`mypkg.cli:main`). A name in both keeps the `[tool.poetry.scripts]` value.
   */
  scripts: Record<string, string>
  /** Every `[tool.<name>]` table. */
  tools: string[]
  deps?: DepFact[] | undefined
  error?: string | undefined
}

/**
 * A `go.mod`.
 *
 * @experimental
 */
export interface GoModFact {
  manifestPath: string
  /** The `module` path. */
  module?: string | undefined
  /** The `go` directive. */
  go?: string | undefined
  deps?: DepFact[] | undefined
}

/**
 * A `Gemfile`.
 *
 * @experimental
 */
export interface GemfileFact {
  manifestPath: string
  /** `gem '<name>'` lines. A gem inside a group block is `dev`. */
  deps?: DepFact[] | undefined
}

/**
 * The manifests one package holds, each parsed once. A manifest with no
 * parser is listed in `Package.manifestFiles` only.
 *
 * @experimental
 */
export interface ManifestFacts {
  packageJson?: PackageJsonFact | undefined
  cargo?: CargoFact | undefined
  pyproject?: PyprojectFact | undefined
  goMod?: GoModFact | undefined
  gemfile?: GemfileFact | undefined
}
