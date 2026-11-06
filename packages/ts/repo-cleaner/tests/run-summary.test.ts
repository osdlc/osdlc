import { describe, expect, test } from 'vitest'

import type { Dropped, Receipt, Step } from '../src/receipt.ts'
import {
  renderPreview,
  renderReceipt,
  renderRunSummary,
  summarizeRun,
  TERMINAL_STYLE,
} from '../src/render.ts'
import type { Kind, RowId } from '../src/types.ts'

function step(action: Step['action'], result: Step['result'], name: string | null): Step {
  const kind: Kind =
    action === 'delete-branch' ? 'branch' : action === 'delete-remote' ? 'remote' : 'worktree'
  return {
    repo: '/r',
    row: name === null ? null : (`${kind}:${name}` as RowId),
    action,
    command: `git ${action}`,
    expectedSha: null,
    result,
    error: result === 'failed' ? 'boom' : null,
    verification: null,
  }
}

function receipt(status: Receipt['status'], steps: Step[], dropped: Dropped[] = []): Receipt {
  return { version: 2, plan: '(test)', status, startedAt: 'x', finishedAt: 'y', dropped, steps }
}

const drop = (name: string, reason: Dropped['reason']): Dropped => ({
  repo: '/r',
  row: `branch:${name}`,
  reason,
  detail: '',
})

describe('run summary', () => {
  test('counts each kind once per row; an unlock is not a second item', () => {
    const r = receipt('complete', [
      step('unlock-worktree', 'ok', '/wt'),
      step('remove-worktree', 'ok', '/wt'),
      step('prune-worktrees', 'ok', '/gone'),
      step('delete-branch', 'ok', 'a'),
      step('delete-branch', 'ok', 'b'),
      step('delete-remote', 'ok', 'origin/a'),
      step('prune-worktrees', 'ok', null),
    ])
    expect(summarizeRun(r)).toEqual({
      deleted: { worktree: 1, branch: 2, remote: 1 },
      pruned: 1,
      dropped: {},
      failed: 0,
      notRun: 0,
    })
    expect(renderRunSummary(r)).toEqual([
      'deleted: 1 worktree, 2 local branches, 1 remote branch, 1 stale worktree pruned',
    ])
  })

  test('a dry run says would; drops are counted by reason', () => {
    const r = receipt(
      'dry-run',
      [step('delete-branch', 'would-run', 'a')],
      [
        drop('x', 'needs-pick'),
        drop('y', 'needs-pick'),
        { ...drop('z', 'not-allowed'), detail: 'needs abandon-unmerged' },
      ],
    )
    expect(renderRunSummary(r, { preview: true })).toEqual([
      'would delete: 1 local branch',
      'skipped 3, not deleted: 2 needs-pick (name with --pick), 1 not-allowed (--allow abandon-unmerged)',
    ])
  })

  test('a failed run says where it stopped and how much did not run', () => {
    const r = receipt('failed', [
      step('delete-branch', 'ok', 'a'),
      step('delete-remote', 'failed', 'origin/a'),
      step('delete-remote', 'pending', 'origin/b'),
      step('prune-worktrees', 'pending', null),
    ])
    expect(renderRunSummary(r)).toEqual([
      'deleted: 1 local branch',
      'stopped at a failed step; 1 row not run',
    ])
  })

  test('the text receipt ends with the summary, then the status', () => {
    const text = renderReceipt(receipt('complete', [step('delete-branch', 'ok', 'a')]), null)
    expect(text.trimEnd().split('\n').slice(-3)).toEqual([
      '',
      'deleted: 1 local branch',
      'status: complete',
    ])
  })

  test('a dry-run receipt says would delete', () => {
    const text = renderReceipt(receipt('dry-run', [step('delete-branch', 'would-run', 'a')]), null)
    expect(text.trimEnd().split('\n').slice(-2)).toEqual([
      'would delete: 1 local branch',
      'status: dry-run',
    ])
  })
})

describe('renderPreview', () => {
  test('per repository: each step with its command under it, each skipped row, then the counts', () => {
    const r = receipt(
      'dry-run',
      [step('delete-branch', 'would-run', 'feat/a'), step('prune-worktrees', 'would-run', null)],
      [drop('feat/b', 'needs-pick')],
    )
    expect(renderPreview(r)).toBe(
      [
        '/r',
        '  delete  branch:feat/a',
        '          git delete-branch',
        '  prune   worktree records',
        '          git prune-worktrees',
        '  skip    branch:feat/b',
        '          needs-pick: ',
        '',
        'would delete: 1 local branch',
        'skipped 1, not deleted: 1 needs-pick (name with --pick)',
        '',
      ].join('\n'),
    )
  })

  test('lists each unused allow after the counts', () => {
    const r = receipt('dry-run', [step('delete-branch', 'would-run', 'feat/a')])
    const text = renderPreview({
      ...r,
      unusedAllows: [
        { risk: 'abandon-unmerged', row: null },
        { risk: 'discard-changes', row: 'worktree:/wt' },
      ],
    })
    expect(text.trimEnd().split('\n').slice(-3)).toEqual([
      'would delete: 1 local branch',
      'unused: --allow abandon-unmerged (no row that runs carries it)',
      'unused: --allow discard-changes=worktree:/wt (no row that runs carries it)',
    ])
  })

  test('terminal controls in a path, name or command are not shown', () => {
    const s = step('remove-worktree', 'would-run', '/wt\rhidden')
    const r = receipt(
      'dry-run',
      [{ ...s, repo: '/r\x1b[2J', command: 'git rm /wt\rhidden' }],
      [{ ...drop('x\x1b]0;title\x07y', 'gone'), detail: 'a\rb' }],
    )
    const preview = {
      ...r,
      unusedAllows: [{ risk: 'discard-changes' as const, row: 'worktree:/a\x1b[2Jb' as RowId }],
    }
    for (const out of [renderPreview(preview, TERMINAL_STYLE), renderReceipt(r, '/p\x1b[2J')]) {
      expect(out).not.toContain('\r')
      expect(out).not.toContain('\x1b[2J')
      expect(out).not.toContain('\x1b]0;')
    }
    expect(renderPreview(r)).toContain('/wthidden')
  })
})
