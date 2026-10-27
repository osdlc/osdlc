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
// Left out, so a dependency on them still resolves against crates.io:
// crates whose version is already published, and crates the release does not
// publish (`publish = false` in Cargo.toml, or `release = false` or
// `publish = false` for the package in release-plz.toml). Prints a comment
// and no table when nothing is left.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { indexEntries, publishesToCratesIo } from './crates-io-index.ts'
import type { CargoMetadata, IndexEntry } from './crates-io-index.ts'

/**
 * The names of the `[[package]]` entries in a release-plz.toml that set
 * `release = false` or `publish = false`. Reads only those two keys and
 * `name`, each on a line of its own, as release-plz.toml writes them.
 */
export function heldBackPackages(releasePlzToml: string): Set<string> {
  const held = new Set<string>()
  let inPackage = false
  let name: string | null = null
  let off = false
  const flush = () => {
    if (inPackage && name !== null && off) held.add(name)
  }
  for (const raw of releasePlzToml.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim()
    if (line.startsWith('[')) {
      flush()
      inPackage = line === '[[package]]'
      name = null
      off = false
      continue
    }
    if (!inPackage) continue
    const m = /^([A-Za-z_-]+)\s*=\s*(.+)$/.exec(line)
    if (!m) continue
    const [, key, value] = m
    if (key === 'name') name = JSON.parse(value!) as string
    if ((key === 'release' || key === 'publish') && value === 'false') off = true
  }
  flush()
  return held
}

/** The `[patch.crates-io]` config for the crates of `metadata` the release would publish and crates.io lacks. */
export async function unpublishedPatch(
  metadata: CargoMetadata,
  held: Set<string>,
  lookup: (name: string) => Promise<IndexEntry[] | null> = indexEntries,
): Promise<string> {
  const lines: string[] = []
  for (const id of metadata.workspace_members) {
    const pkg = metadata.packages.find((p) => p.id === id)!
    if (!publishesToCratesIo(pkg) || held.has(pkg.name)) continue
    const entries = await lookup(pkg.name)
    if (entries?.some((e) => e.vers === pkg.version)) continue
    // A JSON string is a valid TOML basic string.
    lines.push(`${pkg.name} = { path = ${JSON.stringify(dirname(pkg.manifest_path))} }`)
  }
  const header = '# Crates whose version is not on crates.io yet. See scripts/crates-io-unpublished-patch.ts.'
  return [header, ...(lines.length > 0 ? ['[patch.crates-io]', ...lines] : [])].join('\n') + '\n'
}

if (import.meta.main) {
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
