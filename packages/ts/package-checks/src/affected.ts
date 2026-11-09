/**
 * Picks the TypeScript packages a CI run checks.
 *
 *   package-checks affected [base] [head]
 *
 * On a pull_request (`EVENT=pull_request`) it checks each package with a file
 * changed between `base` (default `HEAD^1`, the base branch side of the merge
 * commit) and `head` (default `HEAD`), plus every package that depends on one
 * of them. A change under `<rustWorkspace>/<name>/` counts as a change to
 * `<tsDir>/<name>`, since a TypeScript twin reads its crate's fixtures; a
 * `-wasm` crate counts for the package without the suffix, or for the package
 * of the same name, and `rustTwinNames` maps a crate to a package with another
 * name. A change under the suites folder `<families dir>/<family>/`, or under
 * any implementation of a family the registry lists, counts for each
 * TypeScript implementation of that family. Every package is checked on any
 * other event, when a shared file changed (see {@link sharedPatterns}), or
 * when the diff fails.
 *
 * Outputs, written to `$GITHUB_OUTPUT` when it is set:
 *
 *   packages  JSON array of the package folders to check
 *   filter    pnpm --filter flags for them
 *   build     pnpm --filter flags for them and their workspace dependencies,
 *             which a build needs first
 *   dirs      the folders, space-separated, for `package-checks ts`
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { DEFAULT_SHARED, OSDLC, type PackageChecksConfig } from './config.ts'
import { capture } from './run.ts'

/** Each family's implementation folders, by family. */
export type Families = Map<string, string[]>

/** The parts of a package.json these rules read. */
export interface Manifest {
  name: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

/** Each TypeScript package's manifest, by its folder. */
export type Manifests = Map<string, Manifest>

/** The settings the pick reads. */
export type AffectedSettings = Pick<
  PackageChecksConfig,
  'tsDir' | 'rustWorkspace' | 'families' | 'shared' | 'rustTwinNames'
>

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every pattern whose match checks every package: the defaults, the registry, and `shared`. */
export function sharedPatterns(settings: AffectedSettings = OSDLC): RegExp[] {
  return [...DEFAULT_SHARED, `^${escape(settings.families)}$`, ...settings.shared].map(
    (p) => new RegExp(p),
  )
}

/** The families in the registry at `root`, or none when it is absent. */
export function readFamilies(root: string, settings: AffectedSettings = OSDLC): Families {
  const file = join(root, settings.families)
  if (!existsSync(file)) return new Map()
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<
    string,
    { implementations: { dir: string }[] }
  >
  return new Map(
    Object.entries(raw).map(([name, f]) => [name, f.implementations.map((i) => i.dir)]),
  )
}

/** Each TypeScript package's manifest under `root`, by its folder. */
export function readWorkspace(root: string, settings: AffectedSettings = OSDLC): Manifests {
  const manifests: Manifests = new Map()
  const dir = join(root, settings.tsDir)
  if (!existsSync(dir)) return manifests
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name, 'package.json')
    if (existsSync(file))
      manifests.set(`${settings.tsDir}/${name}`, JSON.parse(readFileSync(file, 'utf8')))
  }
  return manifests
}

/** The workspace packages each package depends on, by folder. */
function dependencies(manifests: Manifests): Map<string, string[]> {
  const dirOf = new Map([...manifests].map(([dir, pkg]) => [pkg.name, dir]))
  const deps = new Map<string, string[]>()
  for (const [dir, pkg] of manifests) {
    const names = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
    })
    deps.set(
      dir,
      names.filter((n) => dirOf.has(n)).map((n) => dirOf.get(n)!),
    )
  }
  return deps
}

/**
 * The package folders to check, sorted. `files` is the changed files, or null
 * when the diff failed.
 */
export function pick({
  event,
  files,
  manifests,
  families = new Map(),
  settings = OSDLC,
}: {
  event: string | undefined
  files: string[] | null
  manifests: Manifests
  families?: Families
  settings?: AffectedSettings
}): string[] {
  const shared = sharedPatterns(settings)
  if (
    event !== 'pull_request' ||
    files === null ||
    files.some((f) => shared.some((re) => re.test(f)))
  ) {
    return [...manifests.keys()].sort()
  }
  const suites = dirname(settings.families)
  const library = new RegExp(
    `^(${escape(settings.tsDir)}|${escape(settings.rustWorkspace)})/([^/]+)/`,
  )
  const out = new Set<string>()
  for (const file of files) {
    for (const [family, dirs] of families) {
      if (file.startsWith(`${suites}/${family}/`) || dirs.some((d) => file.startsWith(`${d}/`))) {
        for (const d of dirs) if (manifests.has(d)) out.add(d)
      }
    }
    const m = library.exec(file)
    if (m === null) continue
    const name = m[2]!
    const names =
      m[1] === settings.rustWorkspace
        ? [name, name.replace(/-wasm$/, ''), settings.rustTwinNames[name] ?? name]
        : [name]
    for (const n of names)
      if (manifests.has(`${settings.tsDir}/${n}`)) out.add(`${settings.tsDir}/${n}`)
  }
  // Add dependents until nothing changes.
  const deps = dependencies(manifests)
  for (let grew = true; grew;) {
    grew = false
    for (const [dir, on] of deps) {
      if (!out.has(dir) && on.some((d) => out.has(d))) {
        out.add(dir)
        grew = true
      }
    }
  }
  return [...out].sort()
}

/** `dirs` and every workspace package they depend on, sorted. */
export function withDependencies(dirs: string[], manifests: Manifests): string[] {
  const deps = dependencies(manifests)
  const out = new Set(dirs)
  for (const dir of out) for (const d of deps.get(dir) ?? []) out.add(d)
  return [...out].sort()
}

/** The files changed between `base` and `head`, or null when the diff fails. */
export function changedFiles(root: string, base: string, head: string): string[] | null {
  try {
    // --no-renames lists a moved file's old path too, so its old package counts.
    return capture('git', ['diff', '--name-only', '--no-renames', base, head], root)
      .split('\n')
      .filter(Boolean)
  } catch {
    return null
  }
}

/** The outputs for the picked packages. */
export function affectedOutputs(packages: string[], manifests: Manifests): Record<string, string> {
  const filter = (dirs: string[]) => dirs.map((d) => `--filter ./${d}`).join(' ')
  return {
    packages: JSON.stringify(packages),
    filter: filter(packages),
    build: filter(withDependencies(packages, manifests)),
    dirs: packages.join(' '),
  }
}
