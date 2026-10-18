/**
 * The body grammar: required, optional and alternative sections, gaps, nested sections,
 * repeated sections, order, and the presets.
 */
import { describe, expect, test } from 'vitest'

import {
  LENIENT,
  STRICT,
  contract,
  gap,
  lenientBody,
  oneOf,
  optional,
  optionalSection,
  section,
  sections,
  strictBody,
  type BodyOf,
  type Contract,
  type ContractDef,
  type GapSpec,
  type LevelOpts,
  type OneOfSpec,
  type OptionalSpec,
  type SectionOpts,
  type SectionSeq,
  type SectionSpec,
  type SectionValue,
  type Spec,
} from '@osdlc/markdown-contract'

const ids = (c: Contract, source: string): string[] =>
  c.validate(source, { path: 'doc.md' }).findings.map((f) => f.id)

describe('sections and their order', () => {
  const level: LevelOpts = { order: 'strict', allowUnknown: false }
  const runbook = contract({
    body: sections(level, [
      section('Summary'),
      oneOf(['Steps', 'Procedure']),
      optional(section('Notes')),
      gap(),
      section('Owner'),
    ]),
  })

  test('a strict grammar takes alternatives, optional sections and a gap', () => {
    const ok = '## Summary\n\nx\n\n## Procedure\n\nx\n\n## Extra\n\nx\n\n## Owner\n\nx\n'
    expect(ids(runbook, ok)).toEqual([])
  })

  test('a missing section and a section out of order are findings', () => {
    expect(ids(runbook, '## Summary\n\nx\n\n## Owner\n\nx\n')).toContain(
      'structure/section-missing',
    )
    expect(ids(runbook, '## Owner\n\nx\n\n## Summary\n\nx\n\n## Steps\n\nx\n')).toContain(
      'structure/section-order',
    )
  })

  test('the presets are the two usual level options', () => {
    expect(LENIENT).toEqual({ order: 'none', allowUnknown: true })
    expect(STRICT).toEqual({ order: 'strict', allowUnknown: false })

    const lenient = contract({ body: lenientBody([section('Summary'), optionalSection('Notes')]) })
    const strict = contract({ body: strictBody([section('Summary'), optionalSection('Notes')]) })
    const doc = '## Summary\n\nx\n\n## Other\n\nx\n'
    expect(ids(lenient, doc)).toEqual([])
    // In strict order, an undeclared section may sit only where a gap() is.
    expect(ids(strict, doc)).toEqual(['structure/section-order'])
  })
})

describe('section options', () => {
  test('child sections, repeated sections and descriptions', () => {
    const opts: SectionOpts = {
      repeatable: true,
      min: 1,
      description: 'One heading per release.',
      children: sections(LENIENT, [section('Changes')]),
    }
    const changelog = contract({ body: sections(LENIENT, [section('Release', opts)]) })

    const ok = '## Release\n\n### Changes\n\nx\n\n## Release\n\n### Changes\n\ny\n'
    expect(ids(changelog, ok)).toEqual([])

    const missing = changelog.validate('## Release\n\nx\n', { path: 'CHANGELOG.md' }).findings
    expect(missing.map((f) => [f.id, f.hint])).toEqual([
      ['structure/section-missing', 'One heading per release.'],
    ])
  })

  test('a repeated section reads back as an array', () => {
    const changelog = contract({
      body: sections(LENIENT, [section('Release', { repeatable: true })]),
    })
    const doc = changelog.read('## Release\n\na\n\n## Release\n\nb\n', { path: 'CHANGELOG.md' })
    expect(doc.body.Release.map((r) => r.text())).toEqual(['a', 'b'])
  })
})

describe('the grammar values', () => {
  test('each builder returns a plain spec', () => {
    const s: SectionSpec = section('Summary')
    const o: OptionalSpec = { kind: 'optional', spec: s }
    const one: OneOfSpec = { kind: 'oneOf', names: ['Steps', 'Procedure'] }
    const g: GapSpec = { kind: 'gap' }
    const specs: Spec[] = [s, o, one, g]
    expect(specs.map((spec) => spec.kind)).toEqual(['section', 'optional', 'oneOf', 'gap'])
    expect(optional(s)).toEqual(o)
    expect(oneOf(['Steps', 'Procedure'])).toEqual(one)
    expect(gap()).toEqual(g)
  })

  test('sections() types the body from its specs', () => {
    const specs = [section('Summary'), section('Notes', { repeatable: true })] as const
    const body: SectionSeq<BodyOf<typeof specs>> = sections(LENIENT, specs)
    const def: ContractDef<unknown, BodyOf<typeof specs>> = { body }
    const doc = contract(def).read('## Summary\n\nx\n\n## Notes\n\ny\n', { path: 'a.md' })

    const notes: SectionValue<{ repeatable: true }> = doc.body.Notes
    expect(doc.body.Summary.text()).toBe('x')
    expect(notes).toHaveLength(1)
  })

  test('two names with the same camelCase key are rejected when the grammar is built', () => {
    expect(() => sections(LENIENT, [section('Next steps'), section('Next Steps')])).toThrow(
      /camelCase key/,
    )
  })
})
