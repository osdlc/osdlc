import { describe, expect, test } from 'vitest'

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'
import { githubAuthChecks } from './github-auth.ts'

function fakeGh(results: Record<string, CommandResult>): {
  runner: CommandRunner
  calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    runner: {
      run(argv) {
        const key = argv.join(' ')
        calls.push(key)
        return results[key] ?? { exitCode: 1, stdout: '', stderr: 'unexpected' }
      },
    },
  }
}

const OK: CommandResult = { exitCode: 0, stdout: '', stderr: '' }

describe('githubAuthChecks', () => {
  test('passes when gh is installed and logged in', () => {
    const { runner } = fakeGh({ '--version': OK, 'auth status': OK })
    const checks = githubAuthChecks({ gh: runner, env: {} }, 'git@github.com:acme/widget.git')
    expect(checks.map((c) => [c.name, c.ok])).toEqual([
      ['gh installed', true],
      ['gh auth status', true],
      ['remote', true],
    ])
  })

  test('a failed `gh auth status` fails with the login fix and its first output line', () => {
    const { runner } = fakeGh({
      '--version': OK,
      'auth status': {
        exitCode: 1,
        stdout: '',
        stderr: 'You are not logged into any GitHub hosts.\nmore',
      },
    })
    const auth = githubAuthChecks({ gh: runner, env: {} }, 'git@github.com:acme/widget.git')[1]!
    expect(auth).toEqual({
      name: 'gh auth status',
      ok: false,
      detail: 'You are not logged into any GitHub hosts.',
      fix: 'run: gh auth login',
    })
  })

  test('a missing gh fails with the install fix and skips the login check', () => {
    const { runner, calls } = fakeGh({})
    const checks = githubAuthChecks({ gh: runner, env: {} }, null)
    expect(checks.map((c) => [c.name, c.ok])).toEqual([
      ['gh installed', false],
      ['remote', false],
    ])
    expect(checks[0]!.fix).toBe('install gh: https://cli.github.com')
    expect(calls).toEqual(['--version'])
  })

  test.each([
    ['a github.com origin', 'https://github.com/acme/widget.git', true],
    ['a non-GitHub origin', 'https://code.example/acme/widget.git', false],
    [
      'a GitHub Enterprise origin (only github.com counts)',
      'https://ghe.example/acme/widget.git',
      false,
    ],
    ['no origin', null, false],
  ])('the remote check for %s', (_, url, ok) => {
    const { runner } = fakeGh({ '--version': OK, 'auth status': OK })
    const remote = githubAuthChecks({ gh: runner, env: {} }, url).find((c) => c.name === 'remote')!
    expect(remote.ok).toBe(ok)
    // Add `origin` when there is none; repoint it when it exists but names another host.
    expect(remote.fix).toBe(
      url === null ? 'git remote add origin <url>' : 'git remote set-url origin <url>',
    )
  })
})
