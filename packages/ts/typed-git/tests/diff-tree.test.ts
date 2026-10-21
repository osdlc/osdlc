/** `diffTree`'s `findRenames`: off by default, and a rename record with its source when set. */

import { mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { makeGitFixture, type GitFixture } from '../testing.ts'

let fx: GitFixture
let move: string

beforeAll(() => {
  fx = makeGitFixture()
  fx.commit('seed', { 'old/a.ts': 'export const a = 1\n'.repeat(5) })
  mkdirSync(join(fx.dir, 'new'))
  renameSync(join(fx.dir, 'old/a.ts'), join(fx.dir, 'new/a.ts'))
  move = fx.commit('move')
})

afterAll(() => fx.cleanup())

describe('diffTree findRenames', () => {
  test('default: a move is a delete plus an add', () => {
    expect(fx.git.diffTree(move)).toEqual([
      { status: 'A', path: 'new/a.ts' },
      { status: 'D', path: 'old/a.ts' },
    ])
  })

  test('findRenames: one rename record carrying its source', () => {
    expect(fx.git.diffTree(move, { findRenames: true })).toEqual([
      { status: 'R100', path: 'new/a.ts', from: 'old/a.ts' },
    ])
  })
})
