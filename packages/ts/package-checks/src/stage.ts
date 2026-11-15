/**
 * Stages a new package on npm so CI can publish it. For each package it
 * builds and packs the package at version `0.0.1-stage`, publishes that
 * tarball under the `stage` tag, then adds the GitHub Actions trusted
 * publisher with `npm trust github`. package.json is restored after packing.
 * npm can only add a trusted publisher to a package that already exists.
 *
 *   package-checks stage [--dry-run] [--workflow <file>] [--environment <name>] <package dir> ...
 *
 * Each package folder is read from the repository root, as the other commands
 * read theirs.
 *
 * The trusted publisher names the repository in the package's
 * `repository.url`, the workflow `--workflow` (default packages-publish.yml)
 * and, when given, `--environment`. A package already on npm is not published
 * again, and one that already has a trusted publisher is left as it is, so a
 * re-run is safe. Run it logged in to npm as an owner of the package's scope.
 * `npm trust` needs two-factor authentication on the account, and npm asks for
 * a one-time password or a browser login. npm runs through npx at a pinned
 * version, because `npm trust` needs 11.15 or later. A dry run publishes
 * nothing and changes nothing on npm, but it does build the package.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { spawnRunner, type CommandResult } from '@osdlc/command-seam'

import { OSDLC } from './config.ts'
import { stream } from './run.ts'

/** The version a placeholder is published at. npm reserves `0.0.0-stage`. */
export const PLACEHOLDER = '0.0.1-stage'

/** The npm `npx` runs: `npm trust` needs 11.15 or later. */
export const NPM = 'npm@11.19.1'

/** The default trusted-publisher workflow. */
export const DEFAULT_WORKFLOW = 'packages-publish.yml'

/** A package to stage. */
export interface StageTarget {
  dir: string
  name: string
  /** `owner/repo` on GitHub, from `repository.url`. */
  repository: string
}

/** `owner/repo` of a GitHub repository URL in any form npm accepts, or null. */
export function githubRepository(url: string): string | null {
  const m =
    /^(?:git\+)?(?:https?:\/\/|ssh:\/\/git@|git@|git:\/\/)?(?:www\.)?github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?(?:#.*)?$/.exec(
      url,
    )
  if (m !== null) return `${m[1]}/${m[2]}`
  const short = /^(?:github:)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(url)
  return short === null ? null : `${short[1]}/${short[2]}`
}

/**
 * Checks that the package at `dir` can be staged: public, named in `scope`
 * when one is set, with a licence and a GitHub `repository`. Throws otherwise.
 */
export function readTarget(dir: string, scope: string | null = OSDLC.scope): StageTarget {
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) throw new Error(`${dir}: no package.json`)
  const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
    private?: boolean
    name?: unknown
    license?: unknown
    repository?: string | { url?: string }
  }
  if (pkg.private) throw new Error(`${dir}: the package is private`)
  if (typeof pkg.name !== 'string') throw new Error(`${dir}: no name`)
  if (scope !== null && !pkg.name.startsWith(`${scope}/`))
    throw new Error(`${dir}: the name is not in the ${scope} scope`)
  if (typeof pkg.license !== 'string') throw new Error(`${dir}: no license`)
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  const repository = url === undefined ? null : githubRepository(url)
  if (repository === null)
    throw new Error(`${dir}: repository.url does not name a GitHub repository`)
  return { dir, name: pkg.name, repository }
}

/** The `npm trust github` arguments for one package. */
export function trustArgs(
  target: StageTarget,
  workflow: string,
  environment: string | undefined,
): string[] {
  return [
    'trust',
    'github',
    '--file',
    workflow,
    '--repository',
    target.repository,
    ...(environment ? ['--environment', environment] : []),
    '--allow-publish',
  ]
}

/** What {@link stage} takes besides the packages. */
export interface StageOptions {
  dryRun?: boolean | undefined
  workflow?: string | undefined
  environment?: string | undefined
  scope?: string | null | undefined
  /** The repository root: package folders are read from it, and npm runs in it. */
  root?: string | undefined
}

/** Runs npm at the pinned version in `cwd` and returns its result. */
function npm(args: string[], cwd: string): CommandResult {
  return spawnRunner('npx').run(['-y', NPM, ...args], { cwd })
}

/** Runs npm at the pinned version in `cwd` with the output shown, and returns its exit code. */
function npmLive(args: string[], cwd: string): number {
  return stream('npx', ['-y', NPM, ...args], cwd)
}

/** True when the package exists, false on E404. Any other failure throws. */
function onNpm(name: string, cwd: string): boolean {
  const r = npm(['view', name, 'name'], cwd)
  if (r.exitCode === 0) return true
  if (r.stderr.includes('E404')) return false
  throw new Error(`npm view ${name} failed:\n${r.stderr}`)
}

/** Builds and packs `dir` at the placeholder version, and publishes it under the `stage` tag. */
function publishPlaceholder(dir: string, dry: string[], cwd: string): boolean {
  const manifest = join(dir, 'package.json')
  const original = readFileSync(manifest, 'utf8')
  const out = mkdtempSync(join(tmpdir(), 'stage-npm-package-'))
  try {
    const pkg = JSON.parse(original) as Record<string, unknown>
    writeFileSync(manifest, JSON.stringify({ ...pkg, version: PLACEHOLDER }, null, 2) + '\n')
    let tarball: string
    // Ctrl-C would otherwise exit before the finally restores package.json.
    const ignoreInterrupt = () => {}
    process.on('SIGINT', ignoreInterrupt)
    try {
      // pnpm pack, unlike npm pack, rewrites workspace: and catalog: versions.
      console.log('  pnpm run --if-present build')
      if (stream('pnpm', ['run', '--if-present', 'build'], dir) !== 0) return false
      console.log(`  pnpm pack --json --pack-destination ${out}`)
      const pack = spawnRunner('pnpm').run(['pack', '--json', '--pack-destination', out], {
        cwd: dir,
      })
      process.stderr.write(pack.stderr)
      if (pack.exitCode !== 0) return false
      tarball = (JSON.parse(pack.stdout) as { filename: string }).filename
      if (!existsSync(tarball)) {
        console.error(`  pnpm pack reported ${tarball}, which does not exist.`)
        return false
      }
    } finally {
      writeFileSync(manifest, original)
      process.off('SIGINT', ignoreInterrupt)
    }
    const publish = ['publish', tarball, '--access', 'public', '--tag', 'stage', ...dry]
    console.log(`  npm ${publish.join(' ')}`)
    return npmLive(publish, cwd) === 0
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

/** Stages each package folder in `dirs` and returns the exit code. */
export function stage(dirs: string[], options: StageOptions = {}): number {
  const dryRun = options.dryRun ?? false
  const workflow = options.workflow ?? DEFAULT_WORKFLOW
  const dry = dryRun ? ['--dry-run'] : []
  const root = resolve(options.root ?? process.cwd())
  // Check every package before publishing any.
  const targets = dirs.map((d) =>
    readTarget(resolve(root, d), options.scope === undefined ? OSDLC.scope : options.scope),
  )

  const who = npm(['whoami'], root)
  const loggedIn = who.exitCode === 0
  if (!loggedIn && !dryRun) {
    console.error(`npm whoami failed; run \`npm login\` first.\n${who.stderr}`)
    return 1
  }
  console.log(`npm user: ${loggedIn ? who.stdout.trim() : '(not logged in)'}`)
  if (dryRun) console.log('Dry run: nothing is published or changed on npm.')

  let failed = false
  for (const target of targets) {
    const { dir, name } = target
    console.log(`\n${name}`)
    const existed = onNpm(name, root)
    if (existed) {
      console.log('  already on npm; no placeholder needed.')
    } else if (!publishPlaceholder(dir, dry, root)) {
      console.error('  the placeholder publish failed; skipping its trusted publisher.')
      failed = true
      continue
    }

    if (existed && loggedIn) {
      const list = npm(['trust', 'list', name, '--json'], root)
      if (list.exitCode === 0 && (JSON.parse(list.stdout || '[]') as unknown[]).length > 0) {
        console.log('  already has a trusted publisher; leaving it.')
        continue
      }
    }
    const trust = trustArgs(target, workflow, options.environment)
    console.log(`  npm ${[...trust, name, ...dry].join(' ')}`)
    // npm cannot dry-run a trusted publisher without a login, or for a package
    // that is not on npm yet.
    if (dryRun && !(existed && loggedIn)) continue
    if (npmLive([...trust, name, '--yes', ...dry], root) !== 0) {
      console.error(`  npm trust failed. Add it by hand at https://www.npmjs.com/package/${name}/access:
    GitHub Actions, repository ${target.repository}, workflow ${workflow}, environment ${options.environment ?? '(none)'}.`)
      failed = true
    }
  }
  return failed ? 1 : 0
}
