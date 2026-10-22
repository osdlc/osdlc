/**
 * `merge`, `rebase` and `rebaseContinue` read git's text, so they run with
 * `LC_ALL=C`. Their outcomes must not change under a caller's locale.
 */

import { describe, expect, test } from 'vitest'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  AsyncGit,
  cliBackend,
  Git,
  spawnRunner,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '../src/index.ts'
import { IDENTITY, makeGitFixture } from '../src/testing.ts'

const OK: CommandResult = { exitCode: 0, stdout: '', stderr: '' }

function envRecorder() {
  const envs: Array<CommandRunOptions['env']> = []
  const sync: CommandRunner = {
    run(_argv, opts) {
      envs.push(opts.env)
      return OK
    },
  }
  const async: AsyncCommandRunner = {
    run(_argv, opts) {
      envs.push(opts.env)
      return Promise.resolve(OK)
    },
  }
  return { envs, sync, async }
}

const GERMAN = { LC_ALL: 'de_DE.UTF-8', LANG: 'de_DE.UTF-8', LANGUAGE: 'de' }

describe('integration verbs run in the C locale', () => {
  test('Git sets LC_ALL=C over the client and call env', () => {
    const r = envRecorder()
    const git = new Git('/repo', { runner: r.sync, env: GERMAN })
    git.merge('topic', { env: { LC_ALL: 'de_DE.UTF-8' } })
    git.rebase('main')
    git.rebaseContinue()
    git.statusPorcelain()
    expect(r.envs.slice(0, 3).map((e) => e?.['LC_ALL'])).toEqual(['C', 'C', 'C'])
    // The rest of the caller's env is kept.
    expect(r.envs[0]?.['LANG']).toBe('de_DE.UTF-8')
    // Other verbs keep the caller's locale.
    expect(r.envs[3]?.['LC_ALL']).toBe('de_DE.UTF-8')
  })

  test('the CLI backend sets LC_ALL=C too', async () => {
    const r = envRecorder()
    const git = new AsyncGit('/repo', { backend: cliBackend({ runner: r.async, env: GERMAN }) })
    await git.merge('topic')
    await git.rebase('main')
    await git.rebaseContinue()
    await git.statusPorcelain()
    expect(r.envs.map((e) => e?.['LC_ALL'])).toEqual(['C', 'C', 'C', 'de_DE.UTF-8'])
  })
})

/**
 * A git on this host that prints German under {@link GERMAN}, or undefined.
 * The CI runners likely have no German locale, so there the test below skips
 * and only the env-recorder tests above run.
 */
function localizedGit(): string | undefined {
  const dir = mkdtempSync(join(tmpdir(), 'typed-git-locale-probe-'))
  try {
    for (const bin of ['git', '/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git']) {
      const r = spawnRunner(bin).run(['merge', 'no-such-ref'], { cwd: dir, env: GERMAN })
      if (r.neverExited === true) continue
      // "not a git repository" in English means no catalogs for this binary.
      if (r.stderr !== '' && !r.stderr.includes('not a git repository')) return bin
    }
    return undefined
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const bin = localizedGit()

describe('merge and rebase under a German git', () => {
  test.skipIf(bin === undefined)('conflicts and alreadyUpToDate read right', () => {
    const fx = makeGitFixture()
    try {
      const base = fx.commit('base', { 'a.md': 'base\n' })
      fx.git.checkout(base, { branch: 'topic' })
      fx.commit('topic edit', { 'a.md': 'topic\n' })
      fx.git.checkout('main')
      fx.commit('main edit', { 'a.md': 'main\n' })

      const git = new Git(fx.dir, { runner: spawnRunner(bin!), env: { ...IDENTITY, ...GERMAN } })
      // The probe: the same client prints German for a verb that is not pinned.
      const probe = git.raw(['merge', 'no-such-ref'])
      expect(probe.stderr).not.toContain('not something we can merge')

      const merged = git.merge('topic')
      expect(merged).toEqual({ status: 'conflict', conflicts: ['a.md'] })
      git.mergeAbort()

      expect(git.merge(base)).toEqual({
        status: 'clean',
        fastForward: false,
        alreadyUpToDate: true,
      })
      expect(git.rebase(base)).toEqual({ status: 'clean', alreadyUpToDate: true })
    } finally {
      fx.cleanup()
    }
  })
})
