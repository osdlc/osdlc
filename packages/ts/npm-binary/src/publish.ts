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
 * (`npm view <name>@<version> version`) for every package at once, and skips
 * the ones already there. npm uses its own login, registry and each package's
 * `publishConfig`. Throws on the first failed publish.
 */
export async function publishPackages({
  platformDirs,
  launcherDir,
  dryRun = false,
  viewRunner = spawnRunnerAsync('npm'),
  publishRunner = streamRunner('npm'),
}: PublishOptions): Promise<void> {
  const packages = await Promise.all(
    [...platformDirs, launcherDir].map(async (dir) => {
      const { name, version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        name: string
        version: string
      }
      const existing = await viewRunner.run(['view', `${name}@${version}`, 'version'], {
        cwd: dir,
      })
      const published = existing.exitCode === 0 && existing.stdout.trim() === version
      return { dir, name, version, published }
    }),
  )
  const argv = ['publish', ...(dryRun ? ['--dry-run'] : [])]
  for (const { dir, name, version, published } of packages) {
    if (published) {
      console.log(`${name}@${version} is already published; skipping`)
      continue
    }
    const result = publishRunner.run(argv, { cwd: dir })
    if (result.exitCode !== 0) throw new Error(`npm ${argv.join(' ')} failed in ${dir}`)
  }
}
