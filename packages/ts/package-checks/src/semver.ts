/**
 * Checks that a pull request with a breaking change to a crate also sets the
 * crate's new version in its Cargo.toml.
 *
 *   package-checks semver <path/to/Cargo.toml> <base-rev>
 *
 * For each workspace crate that publishes to crates.io, is on crates.io, and
 * has a file changed between <base-rev> and HEAD (every crate counts as
 * changed when the workspace Cargo.toml or Cargo.lock changed):
 *
 * - The baseline is the highest version on crates.io that is not yanked and
 *   not a pre-release.
 * - The next breaking version is 0.0.(z+1) for a 0.0.z baseline,
 *   0.(y+1).0 for 0.y.z, and (x+1).0.0 for x.y.z with x >= 1.
 * - When the Cargo.toml version, without any pre-release part, is at least
 *   the next breaking version, the crate passes without a check. So
 *   0.3.0-rc.1 counts as a breaking bump over 0.2.x.
 * - Otherwise `cargo semver-checks` compares the crate with the baseline, as
 *   a non-breaking release (`--release-type minor`). A breaking change fails
 *   the run, and the message names the version to set.
 * - When the registry baseline cannot be built, for example because a
 *   dependency it requires was yanked, the check runs again against the
 *   baseline's release tag, `<crate>/v<version>`, built from git.
 *
 * Crates not on crates.io yet, and crates with `publish = false`, are skipped.
 * cargo-semver-checks mostly cannot see a break that comes from a
 * dependency's types, such as a major bump of a dependency used in the API.
 * cargo-semver-checks must be installed. Prints a table of every crate (also
 * to GITHUB_STEP_SUMMARY when set).
 */
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { indexEntries, publishesToCratesIo, type CargoMetadata } from './crates-io.ts'
import { capture, stream } from './run.ts'

/** `[major, minor, patch]` of a version. */
export type Version = [number, number, number]

/** A version's parts, or null when it is not X.Y.Z. */
function parse(v: string): Version | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

const isPrerelease = (v: string): boolean => /^[^+]*-/.test(v)

const compare = (a: Version, b: Version): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/** The first version a breaking change to `v` may take. */
export function nextBreaking([major, minor, patch]: Version): Version {
  if (major > 0) return [major + 1, 0, 0]
  if (minor > 0) return [0, minor + 1, 0]
  return [0, 0, patch + 1]
}

const show = (v: Version): string => v.join('.')

/** One crate's line in the report. */
export interface SemverRow {
  name: string
  version: string
  baseline: string
  result: string
}

/** What {@link semverCheck} found: a row per crate, and the problems that fail the run. */
export interface SemverReport {
  rows: SemverRow[]
  problems: string[]
}

/**
 * Checks each crate of the workspace at `manifest` (a path to its
 * Cargo.toml) that changed since `base`, and returns the report. Runs in
 * `cwd`, a checkout that has `base`.
 */
export async function semverCheck(
  manifest: string,
  base: string,
  cwd: string = process.cwd(),
): Promise<SemverReport> {
  const metadata = JSON.parse(
    capture(
      'cargo',
      ['metadata', '--format-version', '1', '--no-deps', '--manifest-path', manifest],
      cwd,
    ),
  ) as CargoMetadata
  const changed = (...paths: string[]): boolean =>
    capture('git', ['diff', '--name-only', base, 'HEAD', '--', ...paths], cwd).trim() !== ''
  const root = metadata.workspace_root
  const workspaceChanged = changed(join(root, 'Cargo.toml'), join(root, 'Cargo.lock'))

  const rows: SemverRow[] = []
  const problems: string[] = []
  for (const id of metadata.workspace_members) {
    const pkg = metadata.packages.find((p) => p.id === id)!
    const row = (result: { baseline: string; result: string }) =>
      rows.push({ name: pkg.name, version: pkg.version, ...result })

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

    const semverChecks = (baselineArgs: string[]): number => {
      process.stdout.write(
        `::group::cargo semver-checks ${pkg.name} against ${baselineArgs.join(' ')}\n`,
      )
      const code = stream(
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
        cwd,
      )
      process.stdout.write('::endgroup::\n')
      return code
    }
    let status = semverChecks(['--baseline-version', show(baseline)])
    let source = 'crates.io'
    if (status !== 0 && status !== 100) {
      const tag = `refs/tags/${pkg.name}/v${show(baseline)}`
      if (
        stream('git', ['fetch', '--no-tags', '--depth=1', 'origin', `+${tag}:${tag}`], cwd) === 0
      ) {
        status = semverChecks(['--baseline-rev', tag])
        source = `git tag ${pkg.name}/v${show(baseline)}`
      }
    }
    const outcome = semverOutcome(status, pkg.name, baseline, source)
    row(outcome)
    if (outcome.problem !== undefined) problems.push(outcome.problem)
  }
  return { rows, problems }
}

/**
 * What a `cargo semver-checks` exit `status` means for crate `name`, checked
 * against `baseline` from `source`: 0 passes, 100 is a breaking change, and
 * any other code (1 when the command did not run at all) means the check
 * could not run. A breaking change or a failed check comes with the problem
 * that fails the run.
 */
export function semverOutcome(
  status: number,
  name: string,
  baseline: Version,
  source: string,
): { baseline: string; result: string; problem?: string } {
  const from = `${show(baseline)} (${source})`
  if (status === 0) return { baseline: from, result: 'pass: no breaking change found' }
  if (status === 100) {
    const required = show(nextBreaking(baseline))
    return {
      baseline: from,
      result: `fail: breaking, set ${required}`,
      problem:
        `${name} has a breaking change against ${from}. ` +
        `Set \`version = "${required}"\` in its Cargo.toml in this pull request.`,
    }
  }
  return {
    baseline: from,
    result: `error: cargo semver-checks exited ${status}`,
    problem: `cargo semver-checks could not check ${name} (exit ${status}).`,
  }
}

/** The report as a markdown table. */
export function semverTable(rows: SemverRow[]): string {
  return [
    '| crate | version | baseline | result |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.version} | ${r.baseline} | ${r.result} |`),
  ].join('\n')
}

/**
 * Prints the report, appends it to `$GITHUB_STEP_SUMMARY` when set, writes
 * each problem as a GitHub error annotation, and returns the exit code.
 */
export function printSemverReport({ rows, problems }: SemverReport): number {
  const table = semverTable(rows)
  process.stdout.write(`${table}\n`)
  const summary = process.env['GITHUB_STEP_SUMMARY']
  if (summary) {
    appendFileSync(
      summary,
      `## Breaking changes and versions\n\n${table}\n${problems.map((p) => `\n${p}\n`).join('')}`,
    )
  }
  for (const p of problems) process.stderr.write(`::error::${p}\n`)
  return problems.length > 0 ? 1 : 0
}
