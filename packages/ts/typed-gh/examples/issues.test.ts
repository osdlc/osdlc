/**
 * Read one issue with its labels, and swap its label in a single call.
 */

import { expect, test } from 'vitest'

import {
  Gh,
  type CommandRunner,
  type IssueListOptions,
  type IssueRow,
  type Label,
  type ListResult,
} from '@osdlc/typed-gh'

test('read an issue and its labels', () => {
  const runner: CommandRunner = {
    run: () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        number: 7,
        title: 'Retry on timeout',
        body: 'The fetch gives up too soon.',
        labels: [{ name: 'status:triage', color: '1f6feb', description: 'Triage stage' }],
        state: 'OPEN',
      }),
      stderr: '',
    }),
  }

  const issue: IssueRow | null = new Gh('/repo', { runner }).issueView(7)
  const labels: Label[] = issue?.labels ?? []

  expect(issue?.title).toBe('Retry on timeout')
  expect(labels.map((l) => l.name)).toEqual(['status:triage'])
})

test('swap an issue label: one gh call, never an unlabeled moment in between', () => {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  }

  new Gh('/repo', { runner }).setIssueLabel(7, 'status:triage', 'status:define')

  expect(calls).toEqual([
    ['issue', 'edit', '7', '--remove-label', 'status:triage', '--add-label', 'status:define'],
  ])
})

test('list the open issues with one label', () => {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return { exitCode: 0, stdout: '[]', stderr: '' }
    },
  }

  const filter: IssueListOptions = { label: 'status:triage', limit: 50 }
  const issues: ListResult<IssueRow> | null = new Gh('/repo', { runner }).issueList(filter)

  // No rows is "no such issues"; `null` would mean gh could not answer.
  expect(issues).toEqual({ rows: [], truncated: false })
  expect(calls).toEqual([
    [
      'issue',
      'list',
      '--label',
      'status:triage',
      '--json',
      'number,title,body,labels,state',
      '--limit',
      '51',
    ],
  ])
})
