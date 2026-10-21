/**
 * Need: run a tool with a stable locale, no interactive prompts, and without
 * the caller's credentials, while keeping the rest of the environment (PATH,
 * HOME) as it is.
 *
 * Every runner merges `env` over the parent's environment. A string sets a
 * variable; `undefined` removes one the parent has.
 */

import { expect, test } from 'vitest'

import { ran, spawnRunner, type CommandRunner, type EnvOverrides } from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

/** Parseable output, no prompt for credentials, and no token from the caller. */
const quietGit: EnvOverrides = {
  LC_ALL: 'C',
  GIT_TERMINAL_PROMPT: '0',
  GITHUB_TOKEN: undefined,
}

/** Branch names on `origin`; empty when git could not ask. */
function remoteBranches(dir: string, git: CommandRunner = spawnRunner('git')): string[] {
  const r = git.run(['ls-remote', '--heads', 'origin'], {
    cwd: dir,
    env: quietGit,
    timeoutMs: 30_000,
  })
  if (!ran(r)) return []
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\trefs/heads/')[1]!)
}

// ---- Tests -----------------------------------------------------------------

test('lists the branches with the quiet environment', () => {
  const { runner, calls } = fakeRunner({
    'ls-remote --heads origin': { stdout: 'a1\trefs/heads/main\nb2\trefs/heads/dev\n' },
  })

  expect(remoteBranches('/repo', runner)).toEqual(['main', 'dev'])
  expect(calls[0]?.opts.env).toEqual(quietGit)
})

// ---- The real runner -------------------------------------------------------

test('a real child: listed variables set or removed, the rest inherited', () => {
  const sh = spawnRunner('sh')
  const cwd = process.cwd()
  const show = 'echo "lang=${LC_ALL-unset} token=${EXAMPLE_TOKEN-unset} path=${PATH:+set}"'
  // The parent has a token that should not reach the child.
  const before = process.env['EXAMPLE_TOKEN']
  process.env['EXAMPLE_TOKEN'] = 'secret'
  try {
    const inherited = sh.run(['-c', show], { cwd, env: { LC_ALL: 'C' } })
    const scrubbed = sh.run(['-c', show], { cwd, env: { LC_ALL: 'C', EXAMPLE_TOKEN: undefined } })

    expect(inherited.stdout).toBe('lang=C token=secret path=set\n')
    expect(scrubbed.stdout).toBe('lang=C token=unset path=set\n')
  } finally {
    if (before === undefined) delete process.env['EXAMPLE_TOKEN']
    else process.env['EXAMPLE_TOKEN'] = before
  }
}, 15_000)
