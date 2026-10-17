// Checks that a pull request with a breaking change to a crate also sets the
// crate's new version in its Cargo.toml.
//
//   node .github/scripts/semver-version-check.mjs <path/to/Cargo.toml> <base-rev>
//
// For each workspace crate that publishes to crates.io, is on crates.io, and
// has a file changed between <base-rev> and HEAD (every crate counts as
// changed when the workspace Cargo.toml or Cargo.lock changed):
//
// - The baseline is the highest version on crates.io that is not yanked and
//   not a pre-release.
// - The next breaking version is 0.0.(z+1) for a 0.0.z baseline,
//   0.(y+1).0 for 0.y.z, and (x+1).0.0 for x.y.z with x >= 1.
// - When the Cargo.toml version, without any pre-release part, is at least
//   the next breaking version, the crate passes without a check. So
//   0.3.0-rc.1 counts as a breaking bump over 0.2.x.
// - Otherwise `cargo semver-checks` compares the crate with the baseline, as
//   a non-breaking release (`--release-type minor`). A breaking change fails
//   the run, and the message names the version to set.
//
// Crates not on crates.io yet, and crates with `publish = false`, are skipped.
// cargo-semver-checks mostly cannot see a break that comes from a
// dependency's types, such as a major bump of a dependency used in the API.
// cargo-semver-checks must be installed. Prints a table of every crate (also
// to GITHUB_STEP_SUMMARY when set).
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { indexEntries, publishesToCratesIo } from './crates-io-index.mjs'

const [manifest, base] = process.argv.slice(2)
if (!manifest || !base) {
  console.error('usage: semver-version-check.mjs <path/to/Cargo.toml> <base-rev>')
  process.exit(2)
}

const metadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', manifest],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  ),
)

/** `[major, minor, patch]` of a version, or null when it is not X.Y.Z. */
function parse(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

const isPrerelease = (v) => /^[^+]*-/.test(v)

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

function nextBreaking([major, minor, patch]) {
  if (major > 0) return [major + 1, 0, 0]
  if (minor > 0) return [0, minor + 1, 0]
  return [0, 0, patch + 1]
}

const show = (v) => v.join('.')

/** True when a file under any of `paths` changed between `base` and HEAD. */
function changed(...paths) {
  const out = execFileSync('git', ['diff', '--name-only', base, 'HEAD', '--', ...paths], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return out.trim() !== ''
}

const root = metadata.workspace_root
const workspaceChanged = changed(join(root, 'Cargo.toml'), join(root, 'Cargo.lock'))

const rows = []
const problems = []
for (const id of metadata.workspace_members) {
  const pkg = metadata.packages.find((p) => p.id === id)
  const row = (result) => rows.push({ name: pkg.name, version: pkg.version, ...result })

  if (!publishesToCratesIo(pkg)) {
    row({ baseline: '-', result: 'skipped: not published' })
    continue
  }
  if (!workspaceChanged && !changed(dirname(pkg.manifest_path))) {
    row({ baseline: '-', result: 'skipped: not changed' })
    continue
  }
  const entries = await indexEntries(pkg.name)
  const released = (entries ?? [])
    .filter((e) => !e.yanked && !isPrerelease(e.vers))
    .map((e) => parse(e.vers))
    .filter((v) => v !== null)
    .sort(compare)
  if (released.length === 0) {
    row({ baseline: '-', result: 'skipped: not on crates.io' })
    continue
  }
  const baseline = released[released.length - 1]
  const required = nextBreaking(baseline)
  const local = parse(pkg.version)
  if (local !== null && compare(local, required) >= 0) {
    row({ baseline: show(baseline), result: 'pass: version is already breaking' })
    continue
  }

  console.log(`::group::cargo semver-checks ${pkg.name} against ${show(baseline)}`)
  const check = spawnSync(
    'cargo',
    [
      'semver-checks',
      'check-release',
      '--manifest-path',
      manifest,
      '--package',
      pkg.name,
      '--baseline-version',
      show(baseline),
      '--release-type',
      'minor',
    ],
    { stdio: 'inherit' },
  )
  console.log('::endgroup::')
  if (check.status === 0) {
    row({ baseline: show(baseline), result: 'pass: no breaking change found' })
  } else if (check.status === 100) {
    // 100 means a semver violation. Other codes mean the check could not run.
    row({ baseline: show(baseline), result: `fail: breaking, set ${show(required)}` })
    problems.push(
      `${pkg.name} has a breaking change against ${show(baseline)} on crates.io. ` +
        `Set \`version = "${show(required)}"\` in its Cargo.toml in this pull request.`,
    )
  } else {
    row({ baseline: show(baseline), result: `error: cargo semver-checks exited ${check.status}` })
    problems.push(`cargo semver-checks could not check ${pkg.name} (exit ${check.status}).`)
  }
}

const table = [
  '| crate | version | crates.io baseline | result |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.version} | ${r.baseline} | ${r.result} |`),
].join('\n')

console.log(table)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Breaking changes and versions\n\n${table}\n${problems.map((p) => `\n${p}\n`).join('')}`,
  )
}
for (const p of problems) console.error(`::error::${p}`)
if (problems.length > 0) process.exit(1)
