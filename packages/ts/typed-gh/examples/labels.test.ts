/**
 * List a repository's labels, create one, and recolor it. `createLabel` is
 * safe to repeat: when the label exists, its color and description are set.
 */

import { expect, test } from 'vitest'

import {
  Gh,
  type CommandRunner,
  type CreateLabelOptions,
  type Label,
  type ListResult,
} from '@osdlc/typed-gh'

test('list, create and edit labels', () => {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push(argv)
      const stdout =
        argv[1] === 'list'
          ? JSON.stringify([{ name: 'bug', color: 'd73a4a', description: 'Something is wrong' }])
          : ''
      return { exitCode: 0, stdout, stderr: '' }
    },
  }
  const gh = new Gh('/repo', { runner })

  const labels: ListResult<Label> | null = gh.labelList({ limit: 100 })
  const triage: CreateLabelOptions = {
    name: 'status:triage',
    color: '1f6feb',
    description: 'Triage stage',
  }
  gh.createLabel(triage)
  gh.editLabel('status:triage', { description: 'Waiting for triage' })

  expect(labels?.rows.map((l) => l.name)).toEqual(['bug'])
  expect(labels?.truncated).toBe(false)
  expect(calls).toEqual([
    ['label', 'list', '--json', 'name,color,description', '--limit', '101'],
    [
      'label',
      'create',
      'status:triage',
      '--color',
      '1f6feb',
      '--description',
      'Triage stage',
      '--force',
    ],
    ['label', 'edit', 'status:triage', '--description', 'Waiting for triage'],
  ])
})
