// Checks that a pull request with a breaking change to a crate also sets the
// crate's new version in its Cargo.toml.
//
//   node scripts/semver-version-check.ts <path/to/Cargo.toml> <base-rev>
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
// - When the registry baseline cannot be built, for example because a
//   dependency it requires was yanked, the check runs again against the
//   baseline's release tag, `<crate>/v<version>`, built from git.
//
// Crates not on crates.io yet, and crates with `publish = false`, are skipped.
// cargo-semver-checks mostly cannot see a break that comes from a
// dependency's types, such as a major bump of a dependency used in the API.
// cargo-semver-checks must be installed. Prints a table of every crate (also
// to GITHUB_STEP_SUMMARY when set).
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { indexEntries, publishesToCratesIo } from './crates-io-index.ts'
import type { CargoMetadata } from './crates-io-index.ts'

const [manifest, base] = process.argv.slice(2)
if (!manifest || !base) {
  console.error('usage: semver-version-check.ts <path/to/Cargo.toml> <base-rev>')
  process.exit(2)
}

const metadata: CargoMetadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', manifest],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  ),
)

/** `[major, minor, patch]` of a version, or null when it is not X.Y.Z. */
type Version = [number, number, number]

function parse(v: string): Version | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

const isPrerelease = (v: string): boolean => /^[^+]*-/.test(v)

const compare = (a: Version, b: Version): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

function nextBreaking([major, minor, patch]: Version): Version {
  if (major > 0) return [major + 1, 0, 0]
  if (minor > 0) return [0, minor + 1, 0]
  return [0, 0, patch + 1]
}

const show = (v: Version): string => v.join('.')

const baseRev: string = base // narrowed above; `changed` reads it

/** True when a file under any of `paths` changed between `base` and HEAD. */
function changed(...paths: string[]): boolean {
  const out = execFileSync('git', ['diff', '--name-only', baseRev, 'HEAD', '--', ...paths], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return out.trim() !== ''
}

const root = metadata.workspace_root
const workspaceChanged = changed(join(root, 'Cargo.toml'), join(root, 'Cargo.lock'))

const rows: { name: string; version: string; baseline: string; result: string }[] = []
const problems: string[] = []
for (const id of metadata.workspace_members) {
  const pkg = metadata.packages.find((p) => p.id === id)!
  const row = (result: { baseline: string; result: string }) => rows.push({ name: pkg.name, version: pkg.version, ...result })

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
    .filter((v): v is Version => v !== null)
    .sort(compare)
  if (released.length === 0) {
    row({ baseline: '-', result: 'skipped: not on crates.io' })
    continue
  }
  const baseline = released[released.length - 1]!
  const required = nextBreaking(baseline)
  const local = parse(pkg.version)
  if (local !== null && compare(local, required) >= 0) {
    row({ baseline: show(baseline), result: 'pass: version is already breaking' })
    continue
  }

  const semverChecks = (baselineArgs: string[]) => {
    console.log(`::group::cargo semver-checks ${pkg.name} against ${baselineArgs.join(' ')}`)
    const result = spawnSync(
      'cargo',
      [
        'semver-checks',
        'check-release',
        '--manifest-path',
        manifest,
        '--package',
        pkg.name,
        ...baselineArgs,
        '--release-type',
        'minor',
      ],
      { stdio: 'inherit' },
    )
    console.log('::endgroup::')
    return result
  }
  let check = semverChecks(['--baseline-version', show(baseline)])
  if (check.status !== 0 && check.status !== 100) {
    const tag = `refs/tags/${pkg.name}/v${show(baseline)}`
    const fetched = spawnSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', `+${tag}:${tag}`], {
      stdio: 'inherit',
    })
    if (fetched.status === 0) check = semverChecks(['--baseline-rev', tag])
  }
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
