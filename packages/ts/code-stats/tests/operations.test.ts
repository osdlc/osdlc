import { describe, expect, test } from 'vitest'

import { assignOperations, pairLines } from '../src/diff/operations.ts'
import { parseDiff } from '../src/diff/parse.ts'

/** A diff of `path` made of `@@` hunks given as [oldStart, newStart, lines]. */
function fileDiff(path: string, hunks: [number, number, string[]][]): string {
  const body = hunks.map(([o, n, lines]) => {
    const removed = lines.filter((l) => l.startsWith('-')).length
    const added = lines.filter((l) => l.startsWith('+')).length
    return [`@@ -${o},${removed} +${n},${added} @@`, ...lines].join('\n')
  })
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${body.join('\n')}\n`
}

const MOVED_A = 'const configuration = loadConfiguration()'
const MOVED_B = 'validateConfiguration(configuration)'

describe('assignOperations', () => {
  test('a replaced line pairs as changed; the surplus stays added or removed', () => {
    const files = parseDiff(
      fileDiff('a.ts', [
        [1, 1, ['-a()', '-b()', '+c()']],
        [9, 8, ['+d()']],
      ]),
    )
    expect(assignOperations(files)).toEqual([
      { removed: ['changed', 'removed'], added: ['changed', 'added'] },
    ])
  })

  test('with more removed than added, the most similar removed line takes the pair', () => {
    const files = parseDiff(
      fileDiff('a.ts', [[1, 1, ['-// add two numbers', '-return a + b', '+return a + b + c']]]),
    )
    expect(assignOperations(files)[0]).toEqual({
      removed: ['removed', 'changed'],
      added: ['changed'],
    })
  })

  test('a block that reappears elsewhere in the file is moved, indentation ignored', () => {
    const files = parseDiff(
      fileDiff('a.ts', [
        [2, 1, [`-${MOVED_A}`, `-${MOVED_B}`]],
        [20, 18, [`+    ${MOVED_A}`, `+    ${MOVED_B}`]],
      ]),
    )
    expect(assignOperations(files)).toEqual([
      { removed: ['moved', 'moved'], added: ['moved', 'moved'] },
    ])
  })

  test('a move can cross files', () => {
    const files = parseDiff(
      fileDiff('from.ts', [[3, 2, [`-${MOVED_A}`]]]) + fileDiff('to.ts', [[1, 1, [`+${MOVED_A}`]]]),
    )
    expect(assignOperations(files).map((o) => [o.removed, o.added])).toEqual([
      [['moved'], []],
      [[], ['moved']],
    ])
  })

  test('short lines are not moves, and neither is a re-indent in place', () => {
    const short = parseDiff(
      fileDiff('a.ts', [
        [1, 1, ['-}']],
        [5, 4, ['+}']],
      ]),
    )
    expect(assignOperations(short)[0]).toEqual({ removed: ['removed'], added: ['added'] })
    const reindent = parseDiff(fileDiff('a.ts', [[1, 1, [`-${MOVED_A}`, `+  ${MOVED_A}`]]]))
    expect(assignOperations(reindent)[0]).toEqual({ removed: ['changed'], added: ['changed'] })
  })

  test('the longest run wins and each line moves once', () => {
    const files = parseDiff(
      fileDiff('a.ts', [
        [1, 1, [`-${MOVED_A}`, `-${MOVED_B}`]],
        [10, 9, [`+${MOVED_A}`]],
        [20, 19, [`+${MOVED_A}`, `+${MOVED_B}`]],
      ]),
    )
    expect(assignOperations(files)[0]).toEqual({
      removed: ['moved', 'moved'],
      added: ['added', 'moved', 'moved'],
    })
  })

  test('files left out take no part in moves', () => {
    const files = parseDiff(
      fileDiff('from.ts', [[3, 2, [`-${MOVED_A}`]]]) +
        fileDiff('bun.lock', [[1, 1, [`+${MOVED_A}`]]]),
    )
    const ops = assignOperations(files, (f) => f.path !== 'bun.lock')
    expect(ops.map((o) => [o.removed, o.added])).toEqual([
      [['removed'], []],
      [[], ['added']],
    ])
  })

  test('files left out are not paired inside their blocks either', () => {
    const files = parseDiff(fileDiff('bun.lock', [[1, 1, [`-${MOVED_A}`, `+${MOVED_A};`]]]))
    expect(assignOperations(files)[0]).toEqual({ removed: ['changed'], added: ['changed'] })
    expect(assignOperations(files, () => false)[0]).toEqual({
      removed: ['removed'],
      added: ['added'],
    })
  })
})

describe('edited moves', () => {
  const ops = (diff: string, editedMoveSimilarity?: number | null) => {
    const files = parseDiff(diff)
    const { operations, pairs } = pairLines(
      files,
      () => true,
      editedMoveSimilarity === undefined ? {} : { editedMoveSimilarity },
    )
    return {
      operations: operations[0],
      pairs: pairs.map((p) => [p.removed.index, p.added.index, p.by]),
    }
  }

  test('a line edited after a moved run pairs with its edit, not with a neighbour', () => {
    const diff = fileDiff('a.ts', [
      [1, 0, [`-${MOVED_A}`, `-${MOVED_B}`, '-return configuration.items.length']],
      [20, 17, [`+${MOVED_A}`, `+${MOVED_B}`, '+return configuration.entries.length']],
    ])
    expect(ops(diff)).toEqual({
      operations: { removed: ['moved', 'moved', 'changed'], added: ['moved', 'moved', 'changed'] },
      pairs: [
        [0, 0, 'move'],
        [1, 1, 'move'],
        [2, 2, 'edited-move'],
      ],
    })
    expect(ops(diff, null).operations).toEqual({
      removed: ['moved', 'moved', 'removed'],
      added: ['moved', 'moved', 'added'],
    })
  })

  test('a line edited before a moved run pairs too', () => {
    const diff = fileDiff('a.ts', [
      [1, 0, ['-export function setup(options) {', `-${MOVED_A}`, `-${MOVED_B}`]],
      [20, 17, ['+export function setup(options, extra) {', `+${MOVED_A}`, `+${MOVED_B}`]],
    ])
    expect(ops(diff).operations).toEqual({
      removed: ['changed', 'moved', 'moved'],
      added: ['changed', 'moved', 'moved'],
    })
  })

  test('an unrelated line beside the run stays added or removed', () => {
    const diff = fileDiff('a.ts', [
      [1, 0, [`-${MOVED_A}`, `-${MOVED_B}`, '-retryCount += 1']],
      [20, 17, [`+${MOVED_A}`, `+${MOVED_B}`, '+logger.flush()']],
    ])
    expect(ops(diff).operations).toEqual({
      removed: ['moved', 'moved', 'removed'],
      added: ['moved', 'moved', 'added'],
    })
  })

  test('past an edited line, an identical line rejoins the move as moved', () => {
    const diff = fileDiff('a.ts', [
      [1, 0, [`-${MOVED_A}`, `-${MOVED_B}`, '-  total = compute(a)', '-}']],
      [20, 16, [`+${MOVED_A}`, `+${MOVED_B}`, '+  total = compute(a, b)', '+}']],
    ])
    expect(ops(diff).operations).toEqual({
      removed: ['moved', 'moved', 'changed', 'moved'],
      added: ['moved', 'moved', 'changed', 'moved'],
    })
  })

  test('it stops at the first line that is not similar enough', () => {
    const diff = fileDiff('a.ts', [
      [1, 0, [`-${MOVED_A}`, `-${MOVED_B}`, '-retryCount += 1', '-return configuration']],
      [20, 16, [`+${MOVED_A}`, `+${MOVED_B}`, '+logger.flush()', '+return configuration']],
    ])
    expect(ops(diff).operations).toEqual({
      removed: ['moved', 'moved', 'removed', 'removed'],
      added: ['moved', 'moved', 'added', 'added'],
    })
  })
})

describe('pairing inside a block', () => {
  const pairing = (diff: string, options = {}) => {
    const { operations, pairs } = pairLines(parseDiff(diff), () => true, options)
    const indexes = pairs.map((p) => [p.removed.index, p.added.index] as const)
    return { operations: operations[0], pairs: indexes.sort((x, y) => x[0] - y[0]) }
  }

  test('code replaced by unrelated code stays removed and added', () => {
    const diff = fileDiff('a.ts', [
      [
        1,
        1,
        [
          '-export function retryLater(job) {',
          '-  queue.push(job)',
          '+const TIMEOUT_MS = 5000',
          '+logger.flush()',
        ],
      ],
    ])
    expect(pairing(diff).operations).toEqual({
      removed: ['removed', 'removed'],
      added: ['added', 'added'],
    })
    // With no floor they pair by position, whatever they share.
    expect(pairing(diff, { changedSimilarity: 0 }).pairs).toEqual([
      [0, 0],
      [1, 1],
    ])
  })

  test('a line edited in place is changed, beside an unrelated line', () => {
    const diff = fileDiff('a.ts', [
      [
        1,
        1,
        [
          '-const limit = 10',
          '-// Sum before tax.',
          '+// Sum before tax, in whole cents.',
          '+const limit = 20',
          '+logger.flush()',
        ],
      ],
    ])
    expect(pairing(diff)).toEqual({
      operations: { removed: ['changed', 'changed'], added: ['changed', 'changed', 'added'] },
      pairs: [
        [0, 1],
        [1, 0],
      ],
    })
  })

  const field = (i: number) => `const field${i} = record.read('field${i}')`
  const edited = (i: number) => `  const field${i} = record.read('field${i}', options)`

  test('a block of more than 64 lines pairs each line near its own place', () => {
    const removed = Array.from({ length: 80 }, (_, i) => `-${field(i + 10)}`)
    // Re-indented and edited, with an unrelated line inserted at the top: every partner is one line down.
    const added = ['+throw new Error("closed")', ...removed.map((_, i) => `+${edited(i + 10)}`)]
    const diff = fileDiff('a.ts', [[1, 1, [...removed, ...added]]])
    const { operations, pairs } = pairing(diff)
    expect(pairs).toEqual(Array.from({ length: 80 }, (_, i) => [i, i + 1]))
    expect(operations!.added[0]).toBe('added')
    // Paired in order, every line takes the wrong partner.
    expect(pairing(diff, { changedSimilarity: 0, pairingWork: 0 }).pairs).toEqual(
      Array.from({ length: 80 }, (_, i) => [i, i]),
    )
  })

  test('in a block of more than 64 lines, unrelated lines stay removed and added', () => {
    const removed = Array.from({ length: 70 }, (_, i) => `-${field(i + 10)}`)
    const added = Array.from(
      { length: 70 },
      (_, i) => `+logger.flush(${i % 3 === 0 ? '' : 'true'})`,
    )
    const diff = fileDiff('a.ts', [[1, 1, [...removed, ...added]]])
    expect(pairing(diff).pairs).toEqual([])
    expect(pairing(diff, { pairingWork: 0 }).pairs).toEqual([])
  })

  test('a few lines against more than 64 pair by similarity, not by position', () => {
    const removed = Array.from({ length: 100 }, (_, i) => `-${field(i + 10)}`)
    const added = [`+${edited(60)}`, `+${edited(75)}`]
    const diff = fileDiff('a.ts', [[1, 1, [...removed, ...added]]])
    expect(pairing(diff).pairs).toEqual([
      [50, 0],
      [65, 1],
    ])
  })
})
