/** The group table in `./groups`. */

import { expect, test } from 'vitest'

import { catalogGroups, GROUPS, groupOf, SYNTHESIZED_RUNNERS } from '../src/groups.ts'
import { SYNTHESIZED_RUNNERS as FROM_DETECT } from '../src/engine.ts'

test('one table: ./detect re-exports the same runner ids', () => {
  expect(FROM_DETECT).toBe(SYNTHESIZED_RUNNERS)
  expect(GROUPS.flatMap((g) => (g.runner ? [g.runner] : []))).toEqual(
    Object.values(SYNTHESIZED_RUNNERS),
  )
})

test('a runner falls in its synthesized group, else in tasks', () => {
  expect(groupOf('hook-manager').id).toBe('hooks')
  expect(groupOf('just').id).toBe('tasks')
})

test('catalogGroups keeps report order and drops empty groups', () => {
  const reports = [{ runner: 'package-manager' }, { runner: 'just' }, { runner: 'cargo' }]
  expect(catalogGroups(reports)).toEqual([
    { id: 'tasks', title: 'Tasks', runners: ['just', 'cargo'] },
    { id: 'dependencies', title: 'Dependencies', runners: ['package-manager'] },
  ])
})
