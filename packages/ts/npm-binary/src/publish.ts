/**
 * Publish a product's packages: platform packages first, the launcher last, so
 * its optional dependencies already exist on the registry when it lands.
 * A version the registry already has is skipped, so a half-finished run is
 * safe to re-run.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { spawnRunnerAsync, streamRunner } from '@osdlc/command-seam'

/** Options for {@link publishPackages}. */
export interface PublishOptions {
  /** The platform package directories, each with its package.json. */
  platformDirs: readonly string[]
  /** The launcher package directory. Published last. */
  launcherDir: string
  /** Runs `npm publish --dry-run` instead. */
  dryRun?: boolean
}

/**
 * Publishes each package with `npm publish` from its directory, the platform
 * packages in order and the launcher last. It first asks the registry
 * (`npm view <name>@<version> version`) for every package at once, and skips
 * the ones already there. Uses the `npm` on `PATH`, with its own login,
 * registry and each package's `publishConfig`. Throws on the first failed
 * publish.
 */
export async function publishPackages({
  platformDirs,
  launcherDir,
  dryRun = false,
}: PublishOptions): Promise<void> {
  const packages = [...platformDirs, launcherDir].map((dir) => ({
    dir,
    ...(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      name: string
      version: string
    }),
  }))
  const published = await Promise.all(
    packages.map(async ({ dir, name, version }) => {
      const existing = await spawnRunnerAsync('npm').run(
        ['view', `${name}@${version}`, 'version'],
        { cwd: dir },
      )
      return existing.exitCode === 0 && existing.stdout.trim() === version
    }),
  )
  for (const [i, { dir, name, version }] of packages.entries()) {
    if (published[i]) {
      console.log(`${name}@${version} is already published; skipping`)
      continue
    }
    const argv = ['publish', ...(dryRun ? ['--dry-run'] : [])]
    const result = streamRunner('npm').run(argv, { cwd: dir })
    if (result.exitCode !== 0) throw new Error(`npm ${argv.join(' ')} failed in ${dir}`)
  }
}
