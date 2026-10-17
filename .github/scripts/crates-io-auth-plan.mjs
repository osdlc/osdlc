// Picks the crates.io credential for one release-plz run.
//
//   node .github/scripts/crates-io-auth-plan.mjs <path/to/Cargo.toml>
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

const manifest = process.argv[2]
if (!manifest) {
  console.error('usage: crates-io-auth-plan.mjs <path/to/Cargo.toml>')
  process.exit(2)
}

const metadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', manifest],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  ),
)

/** The sparse-index path of a crate name, per the cargo registry index format. */
function indexPath(name) {
  const n = name.toLowerCase()
  if (n.length <= 2) return `${n.length}/${n}`
  if (n.length === 3) return `3/${n[0]}/${n}`
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n}`
}

/** The versions of `name` on crates.io, or null when the crate does not exist. */
async function publishedVersions(name) {
  const res = await fetch(`https://index.crates.io/${indexPath(name)}`, {
    headers: { 'User-Agent': 'osdlc-release-plz (https://github.com/osdlc/osdlc)' },
    signal: AbortSignal.timeout(30_000),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`crates.io index returned ${res.status} for ${name}`)
  const lines = (await res.text()).split('\n').filter((l) => l.trim() !== '')
  return new Set(lines.map((l) => JSON.parse(l).vers))
}

/** The name with every `-` turned into `_` and every `_` into `-`. */
const swapped = (name) => name.replace(/[-_]/g, (c) => (c === '-' ? '_' : '-'))

const rows = []
const clashes = []
for (const id of metadata.workspace_members) {
  const pkg = metadata.packages.find((p) => p.id === id)
  // `publish` is null when unset, [] for `publish = false`, or a registry list.
  if (pkg.publish !== null && !pkg.publish.includes('crates-io')) continue
  const versions = await publishedVersions(pkg.name)
  const exists = versions !== null
  if (!exists && swapped(pkg.name) !== pkg.name) {
    if ((await publishedVersions(swapped(pkg.name))) !== null) clashes.push(pkg.name)
  }
  const published = exists && versions.has(pkg.version)
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

let auth
let problem = null
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
