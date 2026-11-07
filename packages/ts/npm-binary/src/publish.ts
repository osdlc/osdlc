/**
 * Publish a product's packages: platform packages first, the launcher last, so
 * its optional dependencies already exist on the registry when it lands.
 * A version the registry already has is skipped, so a half-finished run is
 * safe to re-run.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  type AsyncCommandRunner,
  spawnRunnerAsync,
  type StreamRunner,
  streamRunner,
} from '@osdlc/command-seam'

/** What {@link publishPackages} did, as `name@version` in publish order. */
export interface PublishResult {
  /** Published by this run (or, with `dryRun`, that would be). */
  published: string[]
  /** Already on the registry, so not published again. */
  skipped: string[]
}

/** Options for {@link publishPackages}. */
export interface PublishOptions {
  /** The platform package directories, each with its package.json. */
  platformDirs: readonly string[]
  /** The launcher package directory. Published last. */
  launcherDir: string
  /** Runs `npm publish --dry-run` instead. */
  dryRun?: boolean
  /** Runs `npm view`. Defaults to the `npm` on `PATH`; a test passes a fake. */
  viewRunner?: AsyncCommandRunner
  /**
   * Runs `npm publish` with npm's output shown live. Defaults to the `npm` on
   * `PATH`; a test passes a fake.
   */
  publishRunner?: StreamRunner
}

/**
 * Publishes each package with `npm publish` from its directory, the platform
 * packages in order and the launcher last. It first asks the registry
 * (`npm view <name>@<version> version`, on the package's
 * `publishConfig.registry` when it sets one) for every package at once, and
 * skips the ones already there. Throws before publishing anything when a
 * lookup fails for any reason but "not found" (E404), and on the first failed
 * publish. npm uses its own login and each package's `publishConfig`, so set
 * `publishConfig.tag` to publish a prerelease under a tag other than `latest`.
 * Returns which packages were published and which were skipped.
 */
export async function publishPackages({
  platformDirs,
  launcherDir,
  dryRun = false,
  viewRunner = spawnRunnerAsync('npm'),
  publishRunner = streamRunner('npm'),
}: PublishOptions): Promise<PublishResult> {
  const packages = await Promise.all(
    [...platformDirs, launcherDir].map(async (dir) => {
      const { name, version, publishConfig } = JSON.parse(
        readFileSync(join(dir, 'package.json'), 'utf8'),
      ) as { name: string; version: string; publishConfig?: { registry?: string } }
      // `npm publish` reads publishConfig.registry; `npm view` does not, so ask the same registry.
      const registry = publishConfig?.registry
      const viewArgv = ['view', `${name}@${version}`, 'version']
      if (registry !== undefined) viewArgv.push('--registry', registry)
      const view = await viewRunner.run(viewArgv, { cwd: dir })
      // E404 means this version (or the whole package) is not there. Any other
      // failure, such as no network or no login, leaves it unknown, so stop.
      if (view.exitCode !== 0 && !view.stderr.includes('E404')) {
        throw new Error(`npm ${viewArgv.join(' ')} failed in ${dir}: ${view.stderr.trim()}`)
      }
      const published = view.exitCode === 0 && view.stdout.trim() === version
      return { dir, name, version, published }
    }),
  )
  const argv = ['publish', ...(dryRun ? ['--dry-run'] : [])]
  const result: PublishResult = { published: [], skipped: [] }
  for (const { dir, name, version, published } of packages) {
    if (published) {
      result.skipped.push(`${name}@${version}`)
      continue
    }
    const run = publishRunner.run(argv, { cwd: dir })
    if (run.exitCode !== 0) throw new Error(`npm ${argv.join(' ')} failed in ${dir}`)
    result.published.push(`${name}@${version}`)
  }
  return result
}
