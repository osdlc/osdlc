/**
 * Open a pull request, then edit it: retitle it, rewrite its body, comment,
 * bring its branch up to date, and mark it ready for review. Each call is one
 * `gh` command; the fake runner records the argv.
 */

import { expect, test } from 'vitest'

import { Gh, type CommandRunner, type CreatePrOptions } from '@osdlc/typed-gh'

test('open a pull request and change it', () => {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return { exitCode: 0, stdout: 'https://github.com/acme/widgets/pull/9\n', stderr: '' }
    },
  }
  const gh = new Gh('/repo', { runner })

  const options: CreatePrOptions = {
    head: 'feature/retries',
    base: 'main',
    title: 'Add retries',
    body: 'Retries the fetch.',
    draft: true,
  }
  const url = gh.createPr(options)
  gh.editPr(9, { title: 'Add retries to fetch' })
  gh.editPrBody(9, 'Retries the fetch three times.')
  const comment = gh.prComment(9, 'Rebased onto main.')
  gh.prUpdateBranch(9, 'rebase')
  gh.prSetDraft(9, false)

  expect(url).toBe('https://github.com/acme/widgets/pull/9')
  expect(comment).toBe('https://github.com/acme/widgets/pull/9')
  expect(calls).toEqual([
    [
      'pr',
      'create',
      '--head',
      'feature/retries',
      '--base',
      'main',
      '--draft',
      '--title',
      'Add retries',
      '--body',
      'Retries the fetch.',
    ],
    ['pr', 'edit', '9', '--title', 'Add retries to fetch'],
    ['pr', 'edit', '9', '--body', 'Retries the fetch three times.'],
    ['pr', 'comment', '9', '--body', 'Rebased onto main.'],
    ['pr', 'update-branch', '9', '--rebase'],
    ['pr', 'ready', '9'],
  ])
})

test('convert a pull request back to a draft', () => {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  }

  new Gh('/repo', { runner }).prSetDraft(9, true)

  expect(calls).toEqual([['pr', 'ready', '9', '--undo']])
})
