/**
 * List the open pull requests of a repository, read one in full, and read
 * just its body. The runner is a fake that answers like `gh`, so the example
 * needs no GitHub and no login.
 */

import { expect, test } from 'bun:test'

import {
  Gh,
  PR_LIST_FIELDS,
  PR_VIEW_FIELDS,
  type CommandRunner,
  type PrListOptions,
  type PullRequest,
} from '@osdlc/typed-gh'

/** A runner that records the argv of each call and answers every call with `stdout`. */
function answering(stdout: string) {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return { exitCode: 0, stdout, stderr: '' }
    },
  }
  return { runner, calls }
}

test('list the open pull requests into the main branch', () => {
  const { runner, calls } = answering(
    JSON.stringify([{ number: 7, baseRefName: 'main', mergeable: 'MERGEABLE' }]),
  )
  const gh = new Gh('/repo', { runner })

  const filter: PrListOptions = { state: 'open', base: 'main' }
  const prs: PullRequest[] = gh.prList(filter) ?? []

  expect(prs.map((pr) => [pr.number, pr.baseRefName, pr.mergeable])).toEqual([
    [7, 'main', 'MERGEABLE'],
  ])
  // The light field set: enough to triage, cheap to ask for.
  expect(calls[0]).toContain(PR_LIST_FIELDS.join(','))
})

test('read one pull request in full', () => {
  const { runner, calls } = answering(
    JSON.stringify({ number: 7, title: 'Fix the parser', body: 'Closes the parser bug.' }),
  )
  const pr = new Gh('/repo', { runner }).prView(7)

  expect(pr?.title).toBe('Fix the parser')
  // The heavy field set adds the body, comments, reviews and checks.
  expect(calls[0]).toContain(PR_VIEW_FIELDS.join(','))
})

test('ask for only the fields you need', () => {
  const { runner, calls } = answering(JSON.stringify({ number: 7, headRefOid: 'abc1234' }))
  const pr = new Gh('/repo', { runner }).prView(7, { fields: ['headRefOid'] })

  expect(pr?.headRefOid).toBe('abc1234')
  // `number` is always asked for, so a subset never reads as "no such pull request".
  expect(calls[0]).toEqual(['pr', 'view', '7', '--json', 'number,headRefOid'])
})

test('read just the body', () => {
  const { runner } = answering('Closes the parser bug.\n')

  expect(new Gh('/repo', { runner }).prBody(7)).toBe('Closes the parser bug.')
})
