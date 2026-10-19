import { describe, expect, test } from 'vitest'

import { section } from './grammar.js'
import { LENIENT, lenientBody, optionalSection, STRICT, strictBody } from './presets.js'

// presets.ts holds the level-option combos and section shorthands the schemas repeat.

describe('level-option presets', () => {
  test('LENIENT / STRICT are the two repeated combos', () => {
    expect(LENIENT).toEqual({ order: 'none', allowUnknown: true })
    expect(STRICT).toEqual({ order: 'strict', allowUnknown: false })
  })
})

describe('body-grammar shorthands', () => {
  test('lenientBody / strictBody bundle specs under the matching preset', () => {
    const specs = [section('Goal')]
    const lenient = lenientBody(specs)
    expect(lenient.__brand).toBe('SectionSeq')
    expect(lenient.opts).toEqual(LENIENT)
    expect(lenient.specs).toBe(specs)

    expect(strictBody(specs).opts).toEqual(STRICT)
  })
})

describe('optionalSection — optional(section(...))', () => {
  test('wraps a single-name section', () => {
    expect(optionalSection('Notes')).toEqual({
      kind: 'optional',
      spec: { kind: 'section', names: ['Notes'] },
    })
  })

  test('wraps an alias set and carries opts', () => {
    expect(optionalSection(['Why', 'Rationale'], { optional: true })).toEqual({
      kind: 'optional',
      spec: { kind: 'section', names: ['Why', 'Rationale'], opts: { optional: true } },
    })
  })
})
