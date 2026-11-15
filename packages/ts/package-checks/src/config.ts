/**
 * The repository's settings for the checks: `package-checks.json` at its
 * root. Every key is optional; {@link OSDLC} holds the defaults, which are
 * osdlc's package standard (S-package-shape-ts and S-package-shape-rs).
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The settings, with defaults filled in. */
export interface PackageChecksConfig {
  /** The one licence every package declares, an SPDX expression. */
  license: string
  /** The licence files every package keeps and its README links. */
  licenseFiles: string[]
  /** The `author` every package.json names, or null for no rule. */
  author: string | null
  /** The widest `engines.node` a TypeScript package may declare. */
  baseEngine: string
  /** The folder of the TypeScript packages, one per subfolder. */
  tsDir: string
  /**
   * TypeScript packages, by folder name, that ship configuration and no
   * code: exempt from the build, test, src, examples and smoke rules.
   */
  configPackages: string[]
  /** Whether a dependency the pnpm catalog pins must be written `catalog:`. */
  catalog: boolean
  /** The lint config at the root that every package uses, or null for no rule. */
  rootLintConfig: string | null
  /** The Cargo workspace folder, holding the workspace Cargo.toml. */
  rustWorkspace: string
  /** The conformance registry, for the families `affected` links. */
  families: string
  /**
   * Regular expressions over repository paths. A pull request that changes a
   * matching file checks every package. They add to {@link DEFAULT_SHARED}.
   */
  shared: string[]
  /** Rust crates whose TypeScript twin has another name: crate to package folder. */
  rustTwinNames: Record<string, string>
  /** The npm scope `stage` publishes in, such as `@osdlc`, or null for any. */
  scope: string | null
}

/** osdlc's rules, the defaults. */
export const OSDLC: PackageChecksConfig = {
  license: 'MIT OR Apache-2.0',
  licenseFiles: ['LICENSE-MIT', 'LICENSE-APACHE'],
  author: 'sksizer',
  baseEngine: '>=22',
  tsDir: 'packages/ts',
  configPackages: [],
  catalog: true,
  rootLintConfig: '.oxlintrc.json',
  rustWorkspace: 'packages/rust',
  families: 'packages/conformance/families.json',
  shared: [],
  rustTwinNames: {},
  scope: '@osdlc',
}

/** The settings file at the repository root. */
export const CONFIG_FILE = 'package-checks.json'

/**
 * Files every package reads, or that decide how they are checked, whatever
 * the repository: a change to one checks every package.
 */
export const DEFAULT_SHARED = [
  '^package\\.json$',
  '^pnpm-lock\\.yaml$',
  '^pnpm-workspace\\.yaml$',
  '^\\.npmrc$',
  '^\\.oxlintrc\\.json$',
  '^\\.changeset/config\\.json$',
  '^package-checks\\.json$',
]

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

/** Each key's check: true when the value has the right type. */
const KEYS: Record<keyof PackageChecksConfig, (v: unknown) => boolean> = {
  license: (v) => typeof v === 'string' && v !== '',
  licenseFiles: isStrings,
  author: (v) => v === null || (typeof v === 'string' && v !== ''),
  baseEngine: (v) => typeof v === 'string' && v !== '',
  tsDir: (v) => typeof v === 'string' && v !== '',
  configPackages: isStrings,
  catalog: (v) => typeof v === 'boolean',
  rootLintConfig: (v) => v === null || (typeof v === 'string' && v !== ''),
  rustWorkspace: (v) => typeof v === 'string' && v !== '',
  families: (v) => typeof v === 'string' && v !== '',
  shared: (v) => {
    if (!isStrings(v)) return false
    try {
      for (const re of v) new RegExp(re)
      return true
    } catch {
      return false
    }
  },
  rustTwinNames: (v) => isObject(v) && Object.values(v).every((x) => typeof x === 'string'),
  scope: (v) => v === null || (typeof v === 'string' && /^@[a-z0-9-~][a-z0-9-._~]*$/.test(v)),
}

/**
 * The settings in `raw` (the parsed file, or undefined when there is none)
 * over {@link OSDLC}. Throws naming each unknown key and each value of the
 * wrong type.
 */
export function readConfig(raw: unknown): PackageChecksConfig {
  if (raw === undefined) return { ...OSDLC }
  if (!isObject(raw)) throw new Error(`${CONFIG_FILE} is not an object`)
  const problems: string[] = []
  for (const [key, value] of Object.entries(raw)) {
    // Own keys only: `toString` or `__proto__` would otherwise find Object.prototype.
    const valid = Object.hasOwn(KEYS, key) ? KEYS[key as keyof PackageChecksConfig] : undefined
    if (valid === undefined) problems.push(`${CONFIG_FILE}: unknown key ${key}`)
    else if (!valid(value)) problems.push(`${CONFIG_FILE}: ${key} has the wrong type`)
  }
  if (problems.length > 0) throw new Error(problems.join('\n'))
  return { ...OSDLC, ...(raw as Partial<PackageChecksConfig>) }
}

/** The settings of the repository at `root`. */
export function loadConfig(root: string): PackageChecksConfig {
  const file = join(root, CONFIG_FILE)
  return readConfig(
    existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown) : undefined,
  )
}
