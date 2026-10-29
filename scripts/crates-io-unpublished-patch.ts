// Prints a cargo config `[patch.crates-io]` table that points each crate the
// next release would publish, and whose version is not on crates.io yet, at
// its local directory.
//
//   node scripts/crates-io-unpublished-patch.ts <path/to/Cargo.toml> <path/to/release-plz.toml>
//
// The `release-plz` job in rust-ci.yml adds this table to the cargo config
// before `release-plz release --dry-run`. The dry run packages each
// unpublished crate with `cargo publish --dry-run`, which resolves the
// packaged crate's dependencies against crates.io. When a run bumps
// yaml-splice and markdown-link, and markdown-link now needs the new
// yaml-splice, that version is not on crates.io, so the dry run fails. The
// real release does not: release-plz publishes yaml-splice first and waits
// for it. With the patch, the dry run finds each crate of the same run
// locally, as the real release finds it on crates.io.
//
// A patched crate brings its own path dependencies along as local crates.
// So each workspace crate a patched crate reaches through a normal or build
// path dependency is patched too, even when its version is published.
// Otherwise the graph holds that crate twice, once local and once from
// crates.io, and types from the two copies do not match: markdown-link
// patched to its directory brings the local yaml-splice, while the packaged
// markdown-relink takes yaml-splice from crates.io.
//
// Left out unless a patched crate reaches them, so a dependency on them
// still resolves against crates.io: crates whose version is already
// published, and crates release-plz holds back (`release = false` or
// `publish = false` for the package in release-plz.toml). Crates with
// `publish = false` in Cargo.toml are always left out. Prints a comment and
// no table when nothing is left.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { indexEntries, publishesToCratesIo } from './crates-io-index.ts'
import type { CargoMetadata, CargoPackage, IndexEntry } from './crates-io-index.ts'

/**
 * The names of the `[[package]]` entries in a release-plz.toml that set
 * `release = false` or `publish = false`. Reads only those two keys and
 * `name`, each on a line of its own, as release-plz.toml writes them.
 * Throws when `[workspace]` sets either key: that would be the default for
 * every package, and this reader does not handle a package that overrides it.
 */
export function heldBackPackages(releasePlzToml: string): Set<string> {
  const held = new Set<string>()
  let section = ''
  let name: string | null = null
  let off = false
  const flush = () => {
    if (section === '[[package]]' && name !== null && off) held.add(name)
  }
  for (const raw of releasePlzToml.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    if (line.startsWith('[')) {
      flush()
      section = line
      name = null
      off = false
      continue
    }
    const m = /^([A-Za-z_-]+)\s*=\s*(.+)$/.exec(line)
    if (!m) continue
    const [, key, value] = m
    if (section === '[workspace]' && (key === 'release' || key === 'publish')) {
      throw new Error(
        `release-plz.toml sets \`${key}\` under [workspace]; crates-io-unpublished-patch.ts reads it only per [[package]]`,
      )
    }
    if (section !== '[[package]]') continue
    if (key === 'name') name = JSON.parse(value!) as string
    if ((key === 'release' || key === 'publish') && value === 'false') off = true
  }
  flush()
  return held
}

/**
 * The `[patch.crates-io]` config for the crates of `metadata` the release
 * would publish and crates.io lacks, plus the workspace crates they reach
 * through normal or build path dependencies.
 */
export async function unpublishedPatch(
  metadata: CargoMetadata,
  held: Set<string>,
  lookup: (name: string) => Promise<IndexEntry[] | null> = indexEntries,
): Promise<string> {
  const members = metadata.workspace_members.map((id) => metadata.packages.find((p) => p.id === id)!)
  const byDir = new Map(members.map((p) => [dirname(p.manifest_path), p]))
  const patched = new Set<CargoPackage>()
  const add = (pkg: CargoPackage) => {
    if (patched.has(pkg) || !publishesToCratesIo(pkg)) return
    patched.add(pkg)
    for (const dep of pkg.dependencies ?? []) {
      if (dep.kind === 'dev' || dep.path === undefined) continue
      const local = byDir.get(dep.path)
      if (local) add(local)
    }
  }
  for (const pkg of members) {
    if (!publishesToCratesIo(pkg) || held.has(pkg.name)) continue
    const entries = await lookup(pkg.name)
    if (entries?.some((e) => e.vers === pkg.version)) continue
    add(pkg)
  }
  // In workspace order. A JSON string is a valid TOML basic string.
  const lines = members
    .filter((p) => patched.has(p))
    .map((p) => `${p.name} = { path = ${JSON.stringify(dirname(p.manifest_path))} }`)
  const header = '# Crates whose version is not on crates.io yet, and the local crates they depend on. See scripts/crates-io-unpublished-patch.ts.'
  return [header, ...(lines.length > 0 ? ['[patch.crates-io]', ...lines] : [])].join('\n') + '\n'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifest, releasePlz] = process.argv.slice(2)
  if (!manifest || !releasePlz) {
    console.error('usage: crates-io-unpublished-patch.ts <path/to/Cargo.toml> <path/to/release-plz.toml>')
    process.exit(2)
  }
  const metadata: CargoMetadata = JSON.parse(
    execFileSync(
      'cargo',
      ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', manifest],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    ),
  )
  process.stdout.write(await unpublishedPatch(metadata, heldBackPackages(readFileSync(releasePlz, 'utf8'))))
}
