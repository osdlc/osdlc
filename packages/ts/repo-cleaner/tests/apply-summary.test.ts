import { describe, expect, test } from 'vitest'

import type { Receipt, Step } from '../src/receipt.ts'
import { renderApplySummary, renderReceipt, summarizeReceipt } from '../src/render.ts'

function step(action: Step['action'], result: Step['result'], id: string | null): Step {
  const category =
    action === 'delete-local'
      ? 'local_branch'
      : action === 'delete-remote'
        ? 'remote_branch'
        : 'worktree'
  return {
    repo: '/r',
    row: id === null ? null : { category, id },
    action,
    command: `git ${action}`,
    expected_sha: null,
    result,
    error: result === 'failed' ? 'boom' : null,
    verification: null,
  }
}

function receipt(
  status: Receipt['status'],
  steps: Step[],
  dropped: Receipt['dropped'] = [],
): Receipt {
  return { version: 1, plan: '(test)', status, started_at: 'x', finished_at: 'y', dropped, steps }
}

const drop = (id: string, reason: Receipt['dropped'][number]['reason']) => ({
  repo: '/r',
  category: 'local_branch' as const,
  id,
  reason,
  detail: '',
})

describe('apply summary', () => {
  test('counts each kind once per row; an unlock is not a second item', () => {
    const r = receipt('complete', [
      step('unlock-worktree', 'ok', '/wt'),
      step('remove-worktree', 'ok', '/wt'),
      step('prune-worktrees', 'ok', '/gone'),
      step('delete-local', 'ok', 'a'),
      step('delete-local', 'ok', 'b'),
      step('delete-remote', 'ok', 'origin/a'),
      step('prune-worktrees', 'ok', null),
    ])
    expect(summarizeReceipt(r)).toEqual({
      deleted: { worktree: 1, local_branch: 2, remote_branch: 1 },
      pruned: 1,
      dropped: {},
      failed: 0,
      notRun: 0,
    })
    expect(renderApplySummary(r)).toEqual([
      'deleted: 1 worktree, 2 local branches, 1 remote branch, 1 stale worktree pruned',
    ])
  })

  test('a dry run says would; drops are counted by reason', () => {
    const r = receipt(
      'dry-run',
      [step('delete-local', 'would-run', 'a')],
      [drop('x', 'needs-review'), drop('y', 'needs-review'), drop('z', 'not-authorized')],
    )
    expect(renderApplySummary(r)).toEqual([
      'would delete: 1 local branch',
      'dropped 3: 2 needs-review, 1 not-authorized',
    ])
  })

  test('a failed run says where it stopped and how much did not run', () => {
    const r = receipt('failed', [
      step('delete-local', 'ok', 'a'),
      step('delete-remote', 'failed', 'origin/a'),
      step('delete-remote', 'pending', 'origin/b'),
      step('prune-worktrees', 'pending', null),
    ])
    expect(renderApplySummary(r)).toEqual([
      'deleted: 1 local branch',
      'stopped at a failed step; 1 row not run',
    ])
  })

  test('the text receipt ends with the summary, then the status', () => {
    const text = renderReceipt(receipt('complete', [step('delete-local', 'ok', 'a')]), null)
    expect(text.trimEnd().split('\n').slice(-3)).toEqual([
      '',
      'deleted: 1 local branch',
      'status: complete',
    ])
  })
})
