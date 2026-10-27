/**
 * Unit tests for the slot resolver the structure plane, the content plane and the typed model
 * share: which slot each section fills, and which block a leaf checks. The Rust crate's
 * `slots.rs` has the same cases.
 */
import { describe, expect, test } from 'vitest'

import { gap, oneOf, optional, section } from '../../src/index.js'
import { bindSlots, pickBlock, slotsOf } from '../../src/core/slots.js'
import { parse } from '../../src/core/projection.js'

describe('slotsOf', () => {
  test('section and oneOf slots in declared order, gaps left out, optional unwrapped', () => {
    const slots = slotsOf([
      optional(section('A')),
      gap(),
      oneOf(['B', 'Bee']),
      section('C', { repeatable: true, min: 1, max: 3 }),
    ])
    expect(
      slots.map(({ specIdx, names, optional, repeatable, min, max }) => ({
        specIdx,
        names,
        optional,
        repeatable,
        min,
        max,
      })),
    ).toEqual([
      { specIdx: 0, names: ['A'], optional: true, repeatable: false },
      { specIdx: 2, names: ['B', 'Bee'], optional: false, repeatable: false },
      { specIdx: 3, names: ['C'], optional: false, repeatable: true, min: 1, max: 3 },
    ])
  })
})

describe('bindSlots', () => {
  test('a section fills the first slot that names it, once unless the slot is repeatable', () => {
    const slots = slotsOf([
      optional(section('A')),
      oneOf(['B', 'Bee']),
      section('C', { repeatable: true }),
      section('A'),
    ])
    const tree = parse('## A\n\n## B\n\n## Bee\n\n## C\n\n## C\n\n## X\n\n## A\n')
    expect(
      bindSlots(tree.root.sections, slots).map((b) => [b.node.name, b.slotIdx, b.fills]),
    ).toEqual([
      ['A', 0, true],
      ['B', 1, true],
      ['Bee', 1, false], // a second spelling of a filled alias set
      ['C', 2, true],
      ['C', 2, true], // a repeatable slot takes every occurrence
      ['X', null, false],
      ['A', 0, false], // the first slot that names it, already filled
    ])
  })
})

describe('pickBlock', () => {
  const tree = parse(
    '## S\n\nprose\n\n| a |\n| - |\n| 1 |\n^first\n\n| b |\n| - |\n| 2 |\n^second\n',
  )
  const node = tree.root.sections[0]!

  test("a single leaf checks the section's first block", () => {
    expect(pickBlock(node, undefined)?.kind).toBe('paragraph')
  })

  test('a named leaf checks the block whose anchor is its record key, or none', () => {
    const second = pickBlock(node, 'second')
    expect(second?.kind === 'table' && second.columns).toEqual(['b'])
    expect(pickBlock(node, 'missing')).toBeNull()
  })

  test('null for a section with no blocks', () => {
    expect(pickBlock(parse('## Empty\n').root.sections[0]!, undefined)).toBeNull()
  })
})
