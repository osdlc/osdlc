import { describe, expect, test } from 'vitest'

import { ContractBuildError, gap, oneOf, optional, section, sections } from './grammar.js'

// grammar.ts's combinators build the inert spec IR a contract body is made of. Each case
// shows exactly what a combinator constructs — the shape the structure plane consumes.

describe('the body-grammar combinators build tagged spec data', () => {
  test('section(name) → a required section spec', () => {
    expect(section('Summary')).toEqual({ kind: 'section', names: ['Summary'] })
  })

  test('section([aliases], opts) keeps the alias set and the options', () => {
    expect(section(['Why', 'Rationale'], { anchor: 'why' })).toEqual({
      kind: 'section',
      names: ['Why', 'Rationale'],
      opts: { anchor: 'why' },
    })
  })

  test('optional(spec) wraps a spec', () => {
    expect(optional(section('Notes'))).toEqual({
      kind: 'optional',
      spec: { kind: 'section', names: ['Notes'] },
    })
  })

  test('oneOf(names) → a choice over interchangeable spellings', () => {
    expect(oneOf(['Today', 'Current state'])).toEqual({
      kind: 'oneOf',
      names: ['Today', 'Current state'],
    })
  })

  test('gap() is an unbounded window; gap({min,max}) bounds it', () => {
    expect(gap()).toEqual({ kind: 'gap' })
    expect(gap({ min: 1, max: 3 })).toEqual({ kind: 'gap', min: 1, max: 3 })
  })

  test('sections(opts, specs) brands a body grammar', () => {
    expect(sections({ order: 'strict' }, [section('A')])).toEqual({
      __brand: 'SectionSeq',
      opts: { order: 'strict' },
      specs: [{ kind: 'section', names: ['A'] }],
    })
  })
})

describe('repeatable bounds', () => {
  test('section(name, { repeatable: true }) rides the flag through onto the spec', () => {
    expect(section('Entry', { repeatable: true })).toEqual({
      kind: 'section',
      names: ['Entry'],
      opts: { repeatable: true },
    })
  })

  test('repeatable with valid min/max builds cleanly', () => {
    expect(() => section('Entry', { repeatable: true, min: 1, max: 3 })).not.toThrow()
  })

  test('min without repeatable throws ContractBuildError (contract/repeat-bounds)', () => {
    try {
      section('Entry', { min: 1 })
      throw new Error('expected section() to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ContractBuildError)
      expect((e as ContractBuildError).id).toBe('contract/repeat-bounds')
    }
  })

  test('max without repeatable throws ContractBuildError', () => {
    expect(() => section('Entry', { max: 2 })).toThrow(ContractBuildError)
  })

  test('min greater than max throws ContractBuildError', () => {
    try {
      section('Entry', { repeatable: true, min: 3, max: 1 })
      throw new Error('expected section() to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ContractBuildError)
      expect((e as ContractBuildError).id).toBe('contract/repeat-bounds')
    }
  })
})

describe('build-time key-collision guard', () => {
  test('two sibling names that collapse to one camelCase key throw ContractBuildError', () => {
    expect(() => sections({}, [section('Files to touch'), section('Files To Touch')])).toThrow(
      ContractBuildError,
    )
  })

  test('the thrown error identifies the contract/key-collision id', () => {
    try {
      sections({}, [section('Files to touch'), section('Files To Touch')])
      throw new Error('expected sections() to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ContractBuildError)
      expect((e as ContractBuildError).id).toBe('contract/key-collision')
    }
  })
})
