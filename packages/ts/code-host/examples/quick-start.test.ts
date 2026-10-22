/**
 * The README's quick start, through the package name only, with fake runners
 * so nothing touches the network or spawns `gh` or `git`.
 */

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'
import { expect, test } from 'vitest'

import { parsePrInput, selectCodeHost } from '@osdlc/code-host'
import { unwrap } from '@osdlc/result'

const ok = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '' })

/** A `git` that has one remote, `origin`. */
const git: CommandRunner = {
  run: (argv) =>
    argv[0] === 'remote' && argv[1] === 'get-url'
      ? ok('https://github.com/acme/widgets.git\n')
      : ok(''),
}

const PR = {
  number: 42,
  state: 'OPEN',
  title: 'Add the widget',
  url: 'https://github.com/acme/widgets/pull/42',
  isDraft: false,
  baseRefName: 'main',
  headRefName: 'task/widget',
  headRefOid: 'abc123',
  isCrossRepository: false,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  reviewDecision: '',
  author: { login: 'octocat' },
  labels: [],
  statusCheckRollup: [],
  comments: [],
  reviews: [],
  mergedAt: null,
  createdAt: null,
  updatedAt: null,
}

/** A `gh` that answers `pr view` from a fixed payload and records every call. */
function fakeGh(): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    runner: {
      run(argv) {
        calls.push([...argv])
        if (argv[0] === 'pr' && argv[1] === 'view') return ok(JSON.stringify(PR))
        if (argv[0] === 'api' && argv.includes('POST')) {
          return ok(JSON.stringify({ id: 7, created_at: '2026-10-20T00:00:00Z' }))
        }
        if (argv[0] === 'api') return ok('[]')
        return ok('')
      },
    },
  }
}

test('pick the adapter from origin, read a PR, post a comment', () => {
  const gh = fakeGh()
  const host = unwrap(selectCodeHost('/repo', { git, gh: gh.runner }))
  expect(host.name).toBe('github')

  const pr = unwrap(host.getPr(42, { since: null }))
  expect(pr?.title).toBe('Add the widget')
  expect(pr?.mergeable).toBe('mergeable')

  const posted = host.postComment(42, 'Rebased onto main.')
  expect(posted).toEqual({ id: '7', createdAt: '2026-10-20T00:00:00Z' })
  const post = gh.calls.find((argv) => argv.includes('POST'))
  expect(post).toContain('body=Rebased onto main.')
})

test('a PR argument is a number, #n, owner/repo#n or a URL', () => {
  expect(parsePrInput('42')).toEqual({ kind: 'number', number: 42 })
  expect(parsePrInput('https://github.com/acme/widgets/pull/42')).toMatchObject({
    kind: 'url',
    ref: { owner: 'acme', repo: 'widgets', number: 42 },
  })
})
