/**
 * Tests for `../src/select.ts` — the `origin`-remote-driven `CodeHost` chooser. All
 * calls go through a fake `CommandRunner`; nothing here touches the network
 * or spawns a real `git`/`curl`.
 */

import { describe, expect, test } from 'vitest'

import { DEFAULT_FORGEJO_TOKEN_ENV } from '../src/forgejo.ts'
import { authChecksFor, codeHostNameForRemote, selectCodeHost } from '../src/select.ts'
import { GithubCodeHost } from '../src/github.ts'
import { ForgejoCodeHost } from '../src/forgejo.ts'
import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

function ok(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: '' }
}

function fail(stderr = 'not found'): CommandResult {
  return { exitCode: 2, stdout: '', stderr }
}

describe('codeHostNameForRemote', () => {
  test('an explicit override always wins', () => {
    expect(codeHostNameForRemote('https://github.com/o/r.git', 'forgejo')).toBe('forgejo')
    expect(codeHostNameForRemote('https://git.example.com/o/r.git', 'github')).toBe('github')
  })

  test('a github.com remote resolves to github', () => {
    expect(codeHostNameForRemote('https://github.com/o/r.git', null)).toBe('github')
    expect(codeHostNameForRemote('git@github.com:o/r.git', null)).toBe('github')
  })

  test('any other host resolves to forgejo', () => {
    expect(codeHostNameForRemote('https://codeberg.org/o/r.git', null)).toBe('forgejo')
    expect(codeHostNameForRemote('git@git.example.com:o/r.git', null)).toBe('forgejo')
  })

  test('no remote at all falls back to github, preserving pre-forgejo behavior', () => {
    expect(codeHostNameForRemote(null, null)).toBe('github')
  })
})

function fakeGitRunner(remoteUrl: string | null): CommandRunner {
  return {
    run(argv) {
      if (argv[0] === 'remote' && argv[1] === 'get-url') {
        return remoteUrl === null ? fail() : ok(remoteUrl)
      }
      return ok('')
    },
  }
}

const noopRunner: CommandRunner = { run: () => ok('') }

describe('selectCodeHost', () => {
  test('a github.com origin builds a GithubCodeHost, never touching curl', () => {
    const codeHost = selectCodeHost('/repo', {
      git: fakeGitRunner('https://github.com/o/r.git'),
      gh: noopRunner,
    })
    expect(codeHost).toBeInstanceOf(GithubCodeHost)
    expect(codeHost.name).toBe('github')
  })

  test('no origin remote falls back to GithubCodeHost', () => {
    const codeHost = selectCodeHost('/repo', { git: fakeGitRunner(null), gh: noopRunner })
    expect(codeHost.name).toBe('github')
  })

  test('an override beats the remote entirely', () => {
    const prevToken = process.env[DEFAULT_FORGEJO_TOKEN_ENV]
    process.env[DEFAULT_FORGEJO_TOKEN_ENV] = 'tok'
    try {
      const codeHost = selectCodeHost('/repo', {
        git: fakeGitRunner('https://github.com/o/r.git'),
        gh: noopRunner,
        curl: noopRunner,
        override: 'forgejo',
      })
      expect(codeHost).toBeInstanceOf(ForgejoCodeHost)
    } finally {
      if (prevToken === undefined) delete process.env[DEFAULT_FORGEJO_TOKEN_ENV]
      else process.env[DEFAULT_FORGEJO_TOKEN_ENV] = prevToken
    }
  })

  test('a non-github origin builds a ForgejoCodeHost, given a token', () => {
    const prevToken = process.env[DEFAULT_FORGEJO_TOKEN_ENV]
    process.env[DEFAULT_FORGEJO_TOKEN_ENV] = 'tok'
    try {
      const codeHost = selectCodeHost('/repo', {
        git: fakeGitRunner('git@git.example.com:o/r.git'),
        gh: noopRunner,
        curl: noopRunner,
      })
      expect(codeHost).toBeInstanceOf(ForgejoCodeHost)
      expect(codeHost.name).toBe('forgejo')
    } finally {
      if (prevToken === undefined) delete process.env[DEFAULT_FORGEJO_TOKEN_ENV]
      else process.env[DEFAULT_FORGEJO_TOKEN_ENV] = prevToken
    }
  })

  test('a remote with an explicit port reaches the adapter, not just the parse step', () => {
    const prevToken = process.env[DEFAULT_FORGEJO_TOKEN_ENV]
    process.env[DEFAULT_FORGEJO_TOKEN_ENV] = 'tok'
    try {
      const calls: string[][] = []
      const curl: CommandRunner = {
        run(argv) {
          calls.push([...argv])
          return ok('{}\nHTTPSTATUS:200')
        },
      }
      const codeHost = selectCodeHost('/repo', {
        git: fakeGitRunner('https://git.example.com:3000/o/r.git'),
        gh: noopRunner,
        curl,
      })
      codeHost.listPrs({})
      const url = calls[0]?.[calls[0].length - 1]
      // Dropping the port here would silently hit the default 443 instead —
      // the exact regression this test pins.
      expect(url).toBe('https://git.example.com:3000/api/v1/repos/o/r/pulls?state=open')
    } finally {
      if (prevToken === undefined) delete process.env[DEFAULT_FORGEJO_TOKEN_ENV]
      else process.env[DEFAULT_FORGEJO_TOKEN_ENV] = prevToken
    }
  })

  test('an unparseable remote is redacted in the thrown message, credentials included', () => {
    // No `owner/repo` path (`parseRemoteUrl` needs at least two segments) —
    // this reaches `selectCodeHost`'s "could not parse" throw, whose message
    // must not repeat embedded userinfo from the raw remote.
    const prevToken = process.env[DEFAULT_FORGEJO_TOKEN_ENV]
    process.env[DEFAULT_FORGEJO_TOKEN_ENV] = 'tok'
    try {
      let thrown: unknown
      try {
        selectCodeHost('/repo', {
          git: fakeGitRunner('https://user:secrettoken@git.example.com/onlyrepo'),
          gh: noopRunner,
        })
      } catch (e) {
        thrown = e
      }
      expect(thrown).toBeInstanceOf(Error)
      const message = (thrown as Error).message
      expect(message).not.toContain('secrettoken')
      expect(message).toContain('***@git.example.com')
    } finally {
      if (prevToken === undefined) delete process.env[DEFAULT_FORGEJO_TOKEN_ENV]
      else process.env[DEFAULT_FORGEJO_TOKEN_ENV] = prevToken
    }
  })

  test('a non-github origin with no token throws, naming the env var', () => {
    const prevToken = process.env[DEFAULT_FORGEJO_TOKEN_ENV]
    delete process.env[DEFAULT_FORGEJO_TOKEN_ENV]
    try {
      expect(() =>
        selectCodeHost('/repo', {
          git: fakeGitRunner('git@git.example.com:o/r.git'),
          gh: noopRunner,
        }),
      ).toThrow(DEFAULT_FORGEJO_TOKEN_ENV)
    } finally {
      if (prevToken !== undefined) process.env[DEFAULT_FORGEJO_TOKEN_ENV] = prevToken
    }
  })

  test('the default token env var is FORGEJO_TOKEN', () => {
    expect(DEFAULT_FORGEJO_TOKEN_ENV).toBe('FORGEJO_TOKEN')
  })

  test('a custom forgejoTokenEnv is read, and named when unset', () => {
    const prevDefault = process.env[DEFAULT_FORGEJO_TOKEN_ENV]
    delete process.env[DEFAULT_FORGEJO_TOKEN_ENV]
    const prevCustom = process.env.MY_FORGEJO_TOKEN
    const git = fakeGitRunner('git@git.example.com:o/r.git')
    try {
      expect(() =>
        selectCodeHost('/repo', { git, gh: noopRunner, forgejoTokenEnv: 'MY_FORGEJO_TOKEN' }),
      ).toThrow('MY_FORGEJO_TOKEN')
      process.env.MY_FORGEJO_TOKEN = 'tok'
      const codeHost = selectCodeHost('/repo', {
        git,
        gh: noopRunner,
        forgejoTokenEnv: 'MY_FORGEJO_TOKEN',
      })
      expect(codeHost.name).toBe('forgejo')
    } finally {
      if (prevCustom === undefined) delete process.env.MY_FORGEJO_TOKEN
      else process.env.MY_FORGEJO_TOKEN = prevCustom
      if (prevDefault !== undefined) process.env[DEFAULT_FORGEJO_TOKEN_ENV] = prevDefault
    }
  })

  test('authChecksFor threads forgejoTokenEnv to the forgejo checks', async () => {
    const checks = await authChecksFor('forgejo', { forgejoTokenEnv: 'MY_FORGEJO_TOKEN' })(
      { gh: noopRunner, env: {} },
      'git@git.example.com:o/r.git',
    )
    expect(checks[0]).toMatchObject({
      name: 'MY_FORGEJO_TOKEN set',
      ok: false,
      fix: 'export MY_FORGEJO_TOKEN=<token from Settings → Applications>',
    })
    const dflt = await authChecksFor('forgejo')({ gh: noopRunner, env: {} }, null)
    expect(dflt[0]?.name).toBe('FORGEJO_TOKEN set')
  })
})
