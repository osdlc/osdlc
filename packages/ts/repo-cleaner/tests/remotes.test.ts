/**
 * A checkout with more than one remote: a fork and its parent, or remotes
 * whose default branches differ. Grows with the multi-remote scope of
 * D-4CE9; for now it pins what a sweep does with the first remote.
 */

import { afterEach, describe, expect, test } from 'vitest'

import { captureContext } from '@osdlc/cli-tool'

import { cannedGh, withRemotes } from './helpers.ts'
import { main } from '../src/cli.ts'
import { sweep } from '../src/sweep.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

function forkAndParent() {
  const fx = withRemotes('rc-remotes', {
    origin: { github: 'me/app' },
    upstream: { github: 'acme/app' },
  })
  cleanups.push(fx.cleanup)
  return fx
}

describe('a fork and its parent', () => {
  test('an open pull request at the fork keeps its branch', () => {
    const fx = forkAndParent()
    const shaOrigin = fx.pushBranch('origin', 'feat/mine')
    const swept = sweep([fx.root], {
      cwd: fx.root,
      remote: true,
      git: fx.git,
      gh: cannedGh([], {
        byRepo: {
          'me/app': [{ number: 7, state: 'OPEN', headRefName: 'feat/mine', headRefOid: shaOrigin }],
        },
      }),
    })
    const repo = swept.repos[0]!
    expect(repo.error).toBeNull()
    const row = repo.rows.find((r) => r.id === 'remote:origin/feat/mine')
    expect(row?.verdict).toBe('keep')
  })

  test('pull requests are listed at the remote judged, by --repo', () => {
    const fx = forkAndParent()
    const gh = cannedGh([])
    sweep([fx.root], { cwd: fx.root, remote: true, git: fx.git, gh })
    const listings = gh.calls.filter((c) => c[0] === 'pr' && c[1] === 'list')
    expect(listings.length).toBeGreaterThan(0)
    expect(listings.every((c) => c.join(' ').includes('me/app'))).toBe(true)
  })
})

describe('the command line', () => {
  test('takes its runners from the caller', () => {
    const fx = forkAndParent()
    const gh = cannedGh([])
    const ctx = captureContext({ cwd: fx.root })
    const code = main(['--remote', '--format', 'json', fx.root], ctx, {
      runners: { git: fx.git, gh },
    })
    expect(code).toBe(0)
    expect(gh.calls.some((c) => c.join(' ').includes('--repo github.com/me/app'))).toBe(true)
  })
})
