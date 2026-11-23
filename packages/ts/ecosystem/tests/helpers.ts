/**
 * A sandbox for the tests: a temporary home, the osdlc directories under it,
 * and git checkouts laid out inside it. Nothing reads the real home, and
 * `OSDLC_REPOSITORIES` is cleared so a value in the developer's shell cannot
 * point a test at their real file.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { makeGitFixture, type GitFixture } from '@osdlc/typed-git/testing'
import { vi } from 'vitest'

import { osdlcDirs } from '../src/index.ts'
import type { RootsOptions } from '../src/repositories.ts'

export interface Sandbox {
  /** The sandbox's real path: git reports real paths, and macOS's temp dir is a symlink. */
  readonly root: string
  /** The home directory every option points at. */
  readonly home: string
  /** Options that keep a call inside the sandbox; spread them and add your own. */
  readonly opts: RootsOptions & { onWarn: (message: string) => void }
  /** What `onWarn` was called with. */
  readonly warnings: string[]
  /** The path of `repositories.yaml` under the sandbox's config home. */
  readonly file: string
  /** Write `repositories.yaml`. */
  writeFile(text: string): void
  /** A checkout at `rel` under the home directory, with `origin` set to `url` when given. */
  checkout(rel: string, url?: string): GitFixture
  cleanup(): void
}

/** Resolves an SSH alias the way a person's `~/.ssh/config` might. */
export const fakeAliases = (alias: string): string | null =>
  ({ 'github-work': 'github.com', forge: 'git.example.com' })[alias] ?? null

export function makeSandbox(): Sandbox {
  vi.stubEnv('OSDLC_REPOSITORIES', '')
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ecosystem-')))
  const home = join(root, 'home')
  mkdirSync(home)
  const warnings: string[] = []
  const env = { HOME: home }
  const dirs = () => osdlcDirs({ env, home })
  const file = join(dirs().standalone('osdlc').config().path, 'repositories.yaml')
  return {
    root,
    home,
    warnings,
    file,
    opts: {
      env,
      home,
      dirs,
      resolveAlias: fakeAliases,
      onWarn: (message) => void warnings.push(message),
    },
    writeFile(text) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, text)
    },
    checkout(rel, url) {
      const fixture = makeGitFixture({ dir: join(home, rel) })
      if (url !== undefined) fixture.git.remoteAdd('origin', url)
      return fixture
    },
    cleanup() {
      vi.unstubAllEnvs()
      rmSync(root, { recursive: true, force: true })
    },
  }
}
