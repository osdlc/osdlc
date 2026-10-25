import { describe, expect, it } from 'vitest'

import type { Finding } from '../../src/core/types.js'
import { DeclarativeError } from '../../src/declarative/errors.js'
import { loadContract } from '../../src/declarative/load.js'

// `requires:` / `forbids:` in YAML are the data form of the `requires(...)` / `forbids(...)` TS
// builders: a list of match specs over a scope's text. Each example below is a whole contract and a
// document, run through `loadContract(...).validate(...)`. Each reads as "write this YAML, give it
// this markdown, get these findings".

/** Compare on the fields a finding pins: id / level / line. */
const shape = (
  findings: Finding[],
): Array<{ id: string; level: string; line: number | undefined }> =>
  findings.map((f) => ({ id: f.id, level: f.level, line: f.pos?.line }))

const ctx = { path: 'doc.md' }

describe('declarative requires / forbids — worked examples', () => {
  it('a section `requires` a phrase: present passes, absent fires at the heading', () => {
    // The Summary section must mention the decision `outcome`.
    const yaml = `
mcVersion: 2
kind: contract
body:
  order: recognized-relative
  additionalSections: true
  sections:
    - section: Summary
      requires:
        - pattern: outcome
`
    const contract = loadContract(yaml)

    const present = '## Summary\n\nThis records the chosen outcome and the reasoning behind it.\n'
    expect(shape(contract.validate(present, ctx).findings)).toEqual([])

    const absent = '## Summary\n\nThis records the chosen direction and the reasoning behind it.\n'
    expect(shape(contract.validate(absent, ctx).findings)).toEqual([
      { id: 'text/requires/summary/1tc7itx', level: 'error', line: 1 },
    ])
  })

  it('a section `forbids` a phrase: absent passes, each hit fires at its line', () => {
    // The Notes section must not contain a leftover `TODO`.
    const yaml = `
mcVersion: 2
kind: contract
body:
  order: recognized-relative
  additionalSections: true
  sections:
    - section: Notes
      forbids:
        - pattern: TODO
`
    const contract = loadContract(yaml)

    const clean = '## Notes\n\nEverything here is settled.\n'
    expect(shape(contract.validate(clean, ctx).findings)).toEqual([])

    const dirty = '## Notes\n\nThis still has a TODO marker.\n'
    expect(shape(contract.validate(dirty, ctx).findings)).toEqual([
      { id: 'text/forbids/notes/mf4oln', level: 'error', line: 3 },
    ])
  })
})

// ── Authoring-error rejections (compile time) ────────────────────────────────────────────

/** Wrap a list of match specs as a one-section contract, for the rejection cases. */
const sectionWith = (key: 'requires' | 'forbids', body: string): string => `
mcVersion: 2
kind: contract
body:
  order: recognized-relative
  additionalSections: true
  sections:
    - section: Summary
      ${key}:
${body}`

describe('declarative requires / forbids — rejected at compile time', () => {
  it('rejects an unknown match-spec key', () => {
    expect(() =>
      loadContract(sectionWith('requires', '        - pattern: x\n          wat: 1\n')),
    ).toThrow(DeclarativeError)
  })

  it('rejects an entry with neither pattern nor regex', () => {
    expect(() =>
      loadContract(sectionWith('requires', '        - note: nothing to match\n')),
    ).toThrow(DeclarativeError)
  })

  it('rejects an entry with both pattern and regex', () => {
    expect(() =>
      loadContract(sectionWith('requires', '        - pattern: x\n          regex: x\n')),
    ).toThrow(DeclarativeError)
  })

  it('rejects a regex that does not compile, naming the key', () => {
    expect(() => loadContract(sectionWith('requires', "        - regex: '('\n"))).toThrow(
      /regex is not a valid regular expression/,
    )
    expect(() => loadContract(sectionWith('forbids', "        - regex: '['\n"))).toThrow(
      DeclarativeError,
    )
  })

  it('rejects two identical specs in one list (duplicate)', () => {
    expect(() =>
      loadContract(sectionWith('requires', '        - pattern: x\n        - pattern: x\n')),
    ).toThrow(DeclarativeError)
  })

  it('rejects the same literal pattern both required and forbidden at one scope (contradiction)', () => {
    const yaml = `
mcVersion: 2
kind: contract
body:
  order: recognized-relative
  additionalSections: true
  sections:
    - section: Summary
      requires:
        - pattern: outcome
      forbids:
        - pattern: outcome
`
    expect(() => loadContract(yaml)).toThrow(DeclarativeError)
  })

  it('rejects a single entry whose max is below its min (contradiction)', () => {
    expect(() =>
      loadContract(
        sectionWith('requires', '        - pattern: x\n          min: 3\n          max: 1\n'),
      ),
    ).toThrow(DeclarativeError)
  })

  it('rejects a requires entry with max: 0 (absence belongs to forbids)', () => {
    expect(() =>
      loadContract(sectionWith('requires', '        - pattern: x\n          max: 0\n')),
    ).toThrow(DeclarativeError)
  })

  it('rejects a non-list requires value', () => {
    const yaml = `
mcVersion: 2
kind: contract
body:
  order: recognized-relative
  additionalSections: true
  sections:
    - section: Summary
      requires:
        pattern: x
`
    expect(() => loadContract(yaml)).toThrow(DeclarativeError)
  })
})
