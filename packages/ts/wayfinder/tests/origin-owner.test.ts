/**
 * Tests for `src/origin-owner.ts`: the origin-owner lookup, the hostile git
 * environment it must ignore, and its use as `@osdlc/trust-repo`'s `ownerOf`.
 */

import { afterEach, describe, expect, test } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { policyDecision, trustDecision, trustStore } from '@osdlc/trust-repo'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { originOwner } from '../src/origin-owner.ts'

const dirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'wayfinder-owner-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function repoWithOrigin(url: string | null) {
  const repo = makeGitFixture({ dir: tmp() })
  if (url !== null) repo.git.remoteAdd('origin', url)
  return repo
}

const withGit = { ownerOf: originOwner }

describe('originOwner', () => {
  test('reads the origin remote owner', () => {
    expect(originOwner(repoWithOrigin('https://github.com/AcmeOwner/dev.git').dir)).toBe(
      'github.com/AcmeOwner',
    )
  })

  test('names the host, so an owner on another host is told apart', () => {
    expect(originOwner(repoWithOrigin('https://gitlab.com/AcmeOwner/dev.git').dir)).toBe(
      'gitlab.com/AcmeOwner',
    )
    expect(originOwner(repoWithOrigin('git@bitbucket.org:AcmeOwner/dev.git').dir)).toBe(
      'bitbucket.org/AcmeOwner',
    )
  })

  test('never runs a git the repository ships on a relative PATH entry', () => {
    const repo = repoWithOrigin('https://github.com/AcmeOwner/dev.git')
    mkdirSync(join(repo.dir, 'bin'))
    const planted = join(repo.dir, 'bin', 'git')
    writeFileSync(
      planted,
      `#!/bin/sh\ntouch "${join(repo.dir, 'ran')}"\necho https://github.com/trusted/x.git\n`,
    )
    chmodSync(planted, 0o755)
    const saved = process.env['PATH']
    process.env['PATH'] = `bin:.:${saved ?? ''}`
    try {
      expect(originOwner(repo.dir)).toBe('github.com/AcmeOwner')
    } finally {
      process.env['PATH'] = saved
    }
    expect(existsSync(join(repo.dir, 'ran'))).toBe(false)
  })

  test('runs git with core.fsmonitor off', () => {
    const calls: string[][] = []
    const git = {
      binary: 'git',
      run: (argv: string[]) => {
        calls.push(argv)
        return { exitCode: 0, stdout: 'https://github.com/a/b.git\n', stderr: '' }
      },
    }
    expect(originOwner(tmp(), git)).toBe('github.com/a')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.slice(0, 2)).toEqual(['-c', 'core.fsmonitor=false'])
  })

  test('is null for a root with no origin remote', () => {
    expect(originOwner(repoWithOrigin(null).dir)).toBeNull()
  })

  test('is null outside a git repository', () => {
    expect(originOwner(tmp())).toBeNull()
  })

  test.each([
    ['scp-style ssh', 'git@github.com:AcmeOwner/dev.git'],
    ['ssh:// URL', 'ssh://git@github.com/AcmeOwner/dev'],
    ['https, no .git suffix', 'https://github.com/AcmeOwner/dev'],
    ['https with embedded userinfo', 'https://user:token@github.com/AcmeOwner/dev.git'],
  ])('reads every origin URL shape — %s', (_label, url) => {
    expect(originOwner(repoWithOrigin(url).dir)).toBe('github.com/AcmeOwner')
  })

  test('is null for a self-hosted/enterprise origin — hosted-git-info does not know the host', () => {
    expect(originOwner(repoWithOrigin('https://ghe.example.com/AcmeOwner/dev.git').dir)).toBeNull()
  })

  test.each([
    ['a relative path, owner/repo', 'mine/x'],
    ['a dot-relative path', './mine/x'],
    ['a parent-relative path', '../mine/x'],
    ['a github: shortcut', 'github:mine/x'],
    ['a gitlab: shortcut', 'gitlab:mine/x'],
    ['a bitbucket: shortcut', 'bitbucket:mine/x'],
    ['a gist: shortcut', 'gist:mine/x'],
    ['a sourcehut: shortcut', 'sourcehut:mine/x'],
  ])('is null for %s', (_label, url) => {
    expect(originOwner(repoWithOrigin(url).dir)).toBeNull()
  })
})

describe('originOwner as ownerOf', () => {
  test('policy.owners matches the origin owner, case-insensitively', async () => {
    const repo = repoWithOrigin('https://github.com/AcmeOwner/dev.git')
    expect(await policyDecision(repo.dir, { paths: [], owners: ['acmeowner'] }, withGit)).toEqual({
      trusted: true,
      by: 'owner',
      rule: 'acmeowner',
    })
  })

  test('policy.owners does not match the same owner name on another host', async () => {
    const repo = repoWithOrigin('https://gitlab.com/AcmeOwner/dev.git')
    const decide = (owners: string[]) => policyDecision(repo.dir, { paths: [], owners }, withGit)
    expect((await decide(['acmeowner'])).trusted).toBe(false)
    expect((await decide(['github.com/acmeowner'])).trusted).toBe(false)
    expect(await decide(['gitlab.com/acmeowner'])).toEqual({
      trusted: true,
      by: 'owner',
      rule: 'gitlab.com/acmeowner',
    })
  })

  test('trustDecision falls through to the owner rule when there is no marker', async () => {
    const store = trustStore({ tool: 'wayfinder-test', dir: tmp() })
    const repo = repoWithOrigin('https://github.com/AcmeOwner/dev.git')
    expect(
      await trustDecision(store, repo.dir, { paths: [], owners: ['acmeowner'] }, withGit),
    ).toEqual({ trusted: true, by: 'owner', rule: 'acmeowner' })
  })
})

/** Run `fn` with `vars` set in `process.env`, then restore the old values. */
async function withEnv(vars: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]))
  Object.assign(process.env, vars)
  try {
    await fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe('originOwner — hostile git environment', () => {
  const owners = { paths: [], owners: ['mine'] }
  const untrusted = { trusted: false, by: null }
  const trusted = { trusted: true, by: 'owner' as const, rule: 'mine' }

  test("GIT_DIR cannot lend another repository's owner to a root", async () => {
    const mine = repoWithOrigin('https://github.com/mine/x.git')
    const other = repoWithOrigin('https://github.com/theirs/x.git')
    const noOrigin = repoWithOrigin(null)
    const notGit = tmp()

    await withEnv({ GIT_DIR: join(mine.dir, '.git') }, async () => {
      expect(await policyDecision(other.dir, owners, withGit)).toEqual(untrusted)
      expect(await policyDecision(noOrigin.dir, owners, withGit)).toEqual(untrusted)
      expect(await policyDecision(notGit, owners, withGit)).toEqual(untrusted)
    })
  })

  test('GIT_DIR cannot take away the owner of a root', async () => {
    const mine = repoWithOrigin('https://github.com/mine/x.git')
    const other = repoWithOrigin('https://github.com/theirs/x.git')

    await withEnv({ GIT_DIR: join(other.dir, '.git') }, async () => {
      expect(await policyDecision(mine.dir, owners, withGit)).toEqual(trusted)
    })
  })

  test('GIT_CONFIG_* variables cannot rewrite the origin', async () => {
    const other = repoWithOrigin('https://github.com/theirs/x.git')
    const mine = repoWithOrigin('https://github.com/mine/x.git')

    await withEnv(
      {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'url.https://github.com/mine/.insteadOf',
        GIT_CONFIG_VALUE_0: 'https://github.com/theirs/',
      },
      async () => {
        expect(await policyDecision(other.dir, owners, withGit)).toEqual(untrusted)
      },
    )
    await withEnv(
      {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'url.https://github.com/theirs/.insteadOf',
        GIT_CONFIG_VALUE_0: 'https://github.com/mine/',
      },
      async () => {
        expect(await policyDecision(mine.dir, owners, withGit)).toEqual(trusted)
      },
    )
  })

  test('GIT_COMMON_DIR alone cannot lend another repository its owner', async () => {
    const mine = repoWithOrigin('https://github.com/mine/x.git')
    const other = repoWithOrigin('https://github.com/theirs/x.git')

    await withEnv({ GIT_COMMON_DIR: join(mine.dir, '.git') }, async () => {
      expect(await policyDecision(other.dir, owners, withGit)).toEqual(untrusted)
    })
  })

  test('GIT_CONFIG_PARAMETERS cannot rewrite the origin', async () => {
    const other = repoWithOrigin('https://github.com/theirs/x.git')

    await withEnv(
      {
        GIT_CONFIG_PARAMETERS:
          "'url.https://github.com/mine/.insteadOf=https://github.com/theirs/'",
      },
      async () => {
        expect(await policyDecision(other.dir, owners, withGit)).toEqual(untrusted)
      },
    )
  })

  test("the caller's git variables are back in place after the lookup", async () => {
    const mine = repoWithOrigin('https://github.com/mine/x.git')

    await withEnv({ GIT_DIR: join(mine.dir, '.git'), GIT_CONFIG_COUNT: '0' }, async () => {
      await policyDecision(mine.dir, owners, withGit)
      expect(process.env.GIT_DIR).toBe(join(mine.dir, '.git'))
      expect(process.env.GIT_CONFIG_COUNT).toBe('0')
    })
  })
})
