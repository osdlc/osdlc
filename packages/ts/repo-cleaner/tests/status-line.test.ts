import { describe, expect, test } from 'vitest'

import type { Step } from '../src/receipt.ts'
import { describeStep, describeSweep, statusLine } from '../src/status-line.ts'

describe('describeSweep', () => {
  test('names the step, the item count and the repository under ~', () => {
    expect(
      describeSweep(
        {
          repo: '/home/me/work/api',
          index: 2,
          of: 5,
          step: 'remote-branches',
          done: 36,
          total: 427,
        },
        '/home/me',
      ),
    ).toBe('[2/5] checking remote branches 37/427 · ~/work/api')
  })

  test('a run of one repository has no position, and a step without items no count', () => {
    expect(describeSweep({ repo: '/srv/api', index: 1, of: 1, step: 'prs' }, '/home/me')).toBe(
      'listing pull requests (gh) · /srv/api',
    )
  })
})

describe('describeStep', () => {
  const step = (row: Step['row']): Step => ({
    repo: '/r',
    row,
    action: row === null ? 'prune-worktrees' : 'delete-remote',
    command: '',
    expected_sha: null,
    result: 'pending',
    error: null,
    verification: null,
  })

  test('names the row, or the repository for the closing prune', () => {
    expect(describeStep(2, 7, step({ category: 'remote_branch', id: 'origin/x' }))).toBe(
      'deleting 3/7: delete-remote origin/x',
    )
    expect(describeStep(6, 7, step(null))).toBe('deleting 7/7: prune-worktrees /r')
  })
})

describe('statusLine', () => {
  test('overwrites in place, cuts to the terminal width, and clears once', () => {
    const out: string[] = []
    const line = statusLine(
      (t) => out.push(t),
      () => 12,
    )
    line.clear()
    expect(out).toEqual([])
    line.update('short')
    line.update('a much longer line than fits')
    line.clear()
    line.clear()
    expect(out).toEqual(['\r\x1b[2Kshort', '\r\x1b[2Ka much lon…', '\r\x1b[2K'])
  })

  test('strips controls a path could carry, and counts wide characters by column', () => {
    const out: string[] = []
    const line = statusLine(
      (t) => out.push(t),
      () => 12,
    )
    line.update('a\x1b[2Jb\nc')
    line.update('日本語のパス名です')
    expect(out[0]).toBe('\r\x1b[2Kabc')
    expect(out[1]).toBe('\r\x1b[2K日本語のパ…')
  })
})
