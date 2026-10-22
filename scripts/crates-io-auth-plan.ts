// Picks the crates.io credential for one release-plz run.
//
//   node scripts/crates-io-auth-plan.ts <path/to/Cargo.toml>
//
// release-plz publishes every unpublished crate of a run with one credential.
// The shared CARGO_REGISTRY_TOKEN is publish-new only: it can make the first
// release of a crate but cannot update one. A trusted-publishing (OIDC) token
// can only update a crate that already exists on crates.io. So a run needs:
//
// - `none`: every publishable crate's version is on crates.io already.
// - `token`: each unpublished crate is new to crates.io.
// - `oidc`: each unpublished crate already exists on crates.io.
//
// A run with both a new crate and a new version of an existing crate cannot
// succeed with either credential, so this script refuses it (exit 1) and says
// how to split it. It reads the crates.io sparse index, so it needs no token.
//
// It also refuses a new crate when the same name with `-` and `_` swapped is
// on crates.io: crates.io treats the two as one name, so the first publish
// would fail.
//
// Prints `auth=<none|token|oidc>` (to GITHUB_OUTPUT when set) and a table of
// every crate (to GITHUB_STEP_SUMMARY when set). A crate is skipped unless its
// `publish` field allows crates.io (unset, or a list that names `crates-io`).
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { indexEntries, publishesToCratesIo } from './crates-io-index.ts'
import type { CargoMetadata } from './crates-io-index.ts'

const manifest = process.argv[2]
if (!manifest) {
  console.error('usage: crates-io-auth-plan.ts <path/to/Cargo.toml>')
  process.exit(2)
}

const metadata: CargoMetadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', manifest],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  ),
)

/** The versions of `name` on crates.io, yanked ones too, or null when the crate does not exist. */
async function publishedVersions(name: string): Promise<Set<string> | null> {
  const entries = await indexEntries(name)
  return entries === null ? null : new Set(entries.map((e) => e.vers))
}

/** The name with every `-` turned into `_` and every `_` into `-`. */
const swapped = (name: string): string => name.replace(/[-_]/g, (c) => (c === '-' ? '_' : '-'))

const rows: { name: string; version: string; exists: boolean; published: boolean }[] = []
const clashes: string[] = []
for (const id of metadata.workspace_members) {
  const pkg = metadata.packages.find((p) => p.id === id)!
  if (!publishesToCratesIo(pkg)) continue
  const versions = await publishedVersions(pkg.name)
  const exists = versions !== null
  if (!exists && swapped(pkg.name) !== pkg.name) {
    if ((await publishedVersions(swapped(pkg.name))) !== null) clashes.push(pkg.name)
  }
  const published = versions !== null && versions.has(pkg.version)
  rows.push({ name: pkg.name, version: pkg.version, exists, published })
}

const pending = rows.filter((r) => !r.published)
const first = pending.filter((r) => !r.exists)
const update = pending.filter((r) => r.exists)

const table = [
  '| crate | version | on crates.io | this run | credential |',
  '|---|---|---|---|---|',
  ...rows.map((r) => {
    const run = r.published ? 'nothing' : r.exists ? 'new version' : 'first release'
    const cred = r.published ? '-' : r.exists ? 'trusted publishing (OIDC)' : 'CARGO_REGISTRY_TOKEN'
    return `| ${r.name} | ${r.version} | ${r.exists ? 'yes' : 'no'} | ${run} | ${cred} |`
  }),
].join('\n')

let auth: string
let problem: string | null = null
if (clashes.length > 0) {
  auth = 'refused'
  problem =
    `crates.io already has ${clashes.map((n) => `${swapped(n)} (for ${n})`).join(', ')}. ` +
    'crates.io treats `-` and `_` as the same, so the first publish would fail. ' +
    'Rename the crate.'
} else if (pending.length === 0) auth = 'none'
else if (update.length === 0) auth = 'token'
else if (first.length === 0) auth = 'oidc'
else {
  auth = 'mixed'
  problem =
    `This run would make the first release of ${first.map((r) => r.name).join(', ')}, ` +
    `which needs CARGO_REGISTRY_TOKEN, and a new version of ` +
    `${update.map((r) => r.name).join(', ')}, which needs trusted publishing. ` +
    'One release-plz run uses one credential for every crate, so it would fail. ' +
    'Release them in separate pushes to main: set `publish = false` in the new ' +
    "crate's Cargo.toml, merge, let this workflow publish the others, then remove " +
    '`publish = false` in a pull request of its own.'
}

console.log(table)
console.log(`auth=${auth}`)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## crates.io credential: ${auth}\n\n${table}\n${problem ? `\n${problem}\n` : ''}`,
  )
}
if (problem) {
  console.error(`::error::${problem}`)
  process.exit(1)
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `auth=${auth}\n`)
