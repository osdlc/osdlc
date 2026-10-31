import { describe, expect, test } from 'vitest'

import type { Step } from '../src/receipt.ts'
import { boardLines, stepBoard } from '../src/step-board.ts'

function step(id: string | null, result: Step['result'] = 'pending'): Step {
  return {
    repo: '/r',
    row: id === null ? null : { category: 'local_branch', id },
    action: id === null ? 'prune-worktrees' : 'delete-local',
    command: '',
    expected_sha: null,
    result,
    error: null,
    verification: null,
  }
}

const SIZE = { width: 80, height: 24 }

describe('boardLines', () => {
  test('a row per step: full and ticked when done, half while running, empty while waiting', () => {
    const steps = [step('a', 'ok'), step('b'), step('c'), step(null)]
    expect(boardLines(steps, 1, SIZE)).toEqual([
      '  ██████████ ✓ delete  local_branch  a',
      '  █████░░░░░ › delete  local_branch  b',
      '  ░░░░░░░░░░   delete  local_branch  c',
      '  ░░░░░░░░░░   prune',
      `  ${'█'.repeat(8)}${'░'.repeat(22)} 1/4`,
    ])
  })

  test('a failed step is crossed', () => {
    const lines = boardLines([step('a', 'ok'), step('b', 'failed')], null, SIZE)
    expect(lines[1]).toBe('  ██████████ ✗ delete  local_branch  b')
    expect(lines[2]).toMatch(/ 2\/2$/)
  })

  test('a list taller than the terminal shows a window around the running step', () => {
    const steps = Array.from({ length: 30 }, (_, i) => step(`b${i}`, i < 20 ? 'ok' : 'pending'))
    const lines = boardLines(steps, 20, { width: 80, height: 8 })
    // Seven lines for the list (two of them notes) and one for the total.
    expect(lines).toHaveLength(8)
    expect(lines[0]).toBe('  … 19 above')
    expect(lines.slice(1, 6).map((l) => l.split('  ').pop())).toEqual([
      'b19',
      'b20',
      'b21',
      'b22',
      'b23',
    ])
    expect(lines[1]).toContain('✓')
    expect(lines[2]).toContain('›')
    expect(lines[6]).toBe('  … 6 below')
    expect(lines[7]).toMatch(/ 20\/30$/)
  })

  test('a long row is cut to the width, so it never wraps', () => {
    const lines = boardLines([step('x'.repeat(200))], null, { width: 40, height: 24 })
    expect(lines[0]!.length).toBeLessThanOrEqual(40)
  })
})

describe('stepBoard', () => {
  test('redraws over its own lines', () => {
    const out: string[] = []
    const steps = [step('a'), step('b')]
    const board = stepBoard(
      (t) => out.push(t),
      steps,
      () => SIZE,
    )
    board.draw(null)
    steps[0]!.result = 'ok'
    board.draw(1)
    expect(out[0]).not.toContain('\x1b[3A')
    expect(out[1]!.startsWith('\x1b[3A')).toBe(true)
    expect(out[1]).toContain('✓ delete  local_branch  a')
    expect(out[1]).toContain('› delete  local_branch  b')
  })
})
