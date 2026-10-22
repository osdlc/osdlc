/**
 * Unit tests for `deepMergeConfig` — the raw-mapping merge behind the
 * `tooly.local.yaml` overlay.
 */

import { describe, expect, test } from 'vitest'

import { deepMergeConfig } from '../src/merge.ts'

describe('deepMergeConfig', () => {
  test('overlay scalar replaces base scalar', () => {
    expect(deepMergeConfig({ a: 1 }, { a: 2 })).toEqual({ a: 2 })
  })

  test('overlay-only key is added', () => {
    expect(deepMergeConfig({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
  })

  test('base-only key survives untouched', () => {
    expect(deepMergeConfig({ a: 1, b: 2 }, { a: 3 })).toEqual({ a: 3, b: 2 })
  })

  test('nested mappings merge recursively', () => {
    const base = { workflows: { setup: ['bun install'], check: ['bun test'] } }
    const overlay = { workflows: { check: ['bun run lint'] } }
    expect(deepMergeConfig(base, overlay)).toEqual({
      workflows: { setup: ['bun install'], check: ['bun run lint'] },
    })
  })

  test('array values REPLACE, never concatenate', () => {
    expect(deepMergeConfig({ a: [1, 2, 3] }, { a: [9] })).toEqual({ a: [9] })
  })

  test('an overlay array replaces a base mapping outright', () => {
    expect(deepMergeConfig({ a: { x: 1 } }, { a: [1, 2] })).toEqual({ a: [1, 2] })
  })

  test('an overlay mapping replaces a base array outright', () => {
    expect(deepMergeConfig({ a: [1, 2] }, { a: { x: 1 } })).toEqual({ a: { x: 1 } })
  })

  test('an overlay null replaces (clears) a base mapping', () => {
    expect(deepMergeConfig({ a: { x: 1 } }, { a: null })).toEqual({ a: null })
  })

  test('deeply nested keys merge at every level', () => {
    const base = { pr_update: { guards: { reviewed: 'merge', max_rebase_commits: 20 } } }
    const overlay = { pr_update: { guards: { max_rebase_commits: 5 } } }
    expect(deepMergeConfig(base, overlay)).toEqual({
      pr_update: { guards: { reviewed: 'merge', max_rebase_commits: 5 } },
    })
  })

  test('neither argument is mutated', () => {
    const base = { a: { x: 1 } }
    const overlay = { a: { y: 2 } }
    const baseSnapshot = JSON.parse(JSON.stringify(base))
    const overlaySnapshot = JSON.parse(JSON.stringify(overlay))
    deepMergeConfig(base, overlay)
    expect(base).toEqual(baseSnapshot)
    expect(overlay).toEqual(overlaySnapshot)
  })

  test('empty overlay is a no-op copy', () => {
    const base = { a: 1, b: { c: 2 } }
    expect(deepMergeConfig(base, {})).toEqual(base)
  })

  test('empty base is filled entirely by the overlay', () => {
    const overlay = { a: 1, b: { c: 2 } }
    expect(deepMergeConfig({}, overlay)).toEqual(overlay)
  })
})

describe('deepMergeConfig — schedules merge by name (AC-5)', () => {
  const entry = (name: string, minutes: number) => ({
    name,
    cron: '0 * * * *',
    run: 'check',
    limits: { minutes },
  })

  test('a new local name is added, an existing one replaces whole, an unnamed project entry is kept', () => {
    const base = { schedules: [entry('a', 1), entry('b', 2)] }
    const overlay = { schedules: [entry('b', 9), entry('c', 3)] }
    expect(deepMergeConfig(base, overlay)).toEqual({
      schedules: [entry('a', 1), entry('b', 9), entry('c', 3)],
    })
  })

  test('a local entry replaces the project entry whole, not field by field', () => {
    const base = { schedules: [{ ...entry('a', 1), tz: 'UTC' }] }
    const merged = deepMergeConfig(base, { schedules: [entry('a', 5)] })
    expect(merged).toEqual({ schedules: [entry('a', 5)] })
  })

  test('duplicates inside one layer survive the merge so validation can refuse them', () => {
    const merged = deepMergeConfig({ schedules: [entry('a', 1), entry('a', 2)] }, {})
    expect(merged).toEqual({ schedules: [entry('a', 1), entry('a', 2)] })
    const both = deepMergeConfig({}, { schedules: [entry('a', 1), entry('a', 2)] })
    expect(both).toEqual({ schedules: [entry('a', 1), entry('a', 2)] })
  })
})
