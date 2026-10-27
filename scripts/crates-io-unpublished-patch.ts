// Prints a cargo config `[patch.crates-io]` table that points each
// publishable workspace crate whose version is not on crates.io yet at its
// local directory.
//
//   node scripts/crates-io-unpublished-patch.ts <path/to/Cargo.toml>
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
// Crates whose version is already published are left out, so a dependency
// on one still resolves against crates.io. Prints a comment and no table
// when every crate is published.
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { indexEntries, publishesToCratesIo } from './crates-io-index.ts'
import type { CargoMetadata } from './crates-io-index.ts'

const manifest = process.argv[2]
if (!manifest) {
  console.error('usage: crates-io-unpublished-patch.ts <path/to/Cargo.toml>')
  process.exit(2)
}

const metadata: CargoMetadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', manifest],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  ),
)

const lines: string[] = []
for (const id of metadata.workspace_members) {
  const pkg = metadata.packages.find((p) => p.id === id)!
  if (!publishesToCratesIo(pkg)) continue
  const entries = await indexEntries(pkg.name)
  if (entries?.some((e) => e.vers === pkg.version)) continue
  // A JSON string is a valid TOML basic string.
  lines.push(`${pkg.name} = { path = ${JSON.stringify(dirname(pkg.manifest_path))} }`)
}

console.log('# Crates whose version is not on crates.io yet. See scripts/crates-io-unpublished-patch.ts.')
if (lines.length > 0) console.log(['[patch.crates-io]', ...lines].join('\n'))
