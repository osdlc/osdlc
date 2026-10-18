import { describe, expect, it } from 'vitest'

import { contract, section, sections } from '../core/grammar.js'
import type { Finding } from '../core/types.js'
import { DeclarativeError, loadContract } from './index.js'

const FM = `mcVersion: 2
kind: contract
frontmatter:
  type: object
  additionalProperties: false
  required: [id, status, title]
  properties:
    id: { type: string, pattern: '^D-[0-9A-Z]{4}$' }
    status: { enum: [open/proposed, open/accepted] }
    title: { type: string, minLength: 1 }
`

const doc = (status: string, extra = ''): string =>
  `---\nid: D-0001\nstatus: ${status}\ntitle: Hi\n${extra}---\n\n## Body\n\nx\n`

describe('loadContract — frontmatter plane parity with the combinators', () => {
  it('a clean document yields no findings', () => {
    const c = loadContract(FM)
    const r = c.validate(doc('open/proposed'), { path: 'x.md' })
    expect(r.findings).toEqual([])
  })

  it('a bad enum surfaces frontmatter/enum', () => {
    const c = loadContract(FM)
    const r = c.validate(doc('bogus'), { path: 'x.md' })
    expect(r.findings.map((f) => f.id)).toContain('frontmatter/enum')
  })

  it('an unknown key surfaces frontmatter/unknown-key under additionalProperties: false', () => {
    const c = loadContract(FM)
    const r = c.validate(doc('open/proposed', 'extra: 1\n'), { path: 'x.md' })
    expect(r.findings.map((f) => f.id)).toContain('frontmatter/unknown-key')
  })
})

describe('loadContract — envelope + current-build limits', () => {
  it('rejects mcVersion 1 with the migration command', () => {
    const yaml = 'mcVersion: 1\nkind: contract\nbody:\n  sections:\n    - section: Summary\n'
    expect(() => loadContract(yaml)).toThrow(DeclarativeError)
    expect(() => loadContract(yaml)).toThrow(
      'mcVersion 1 is no longer supported; rewrite the file as mcVersion 2 with `markdown-contract migrate --write <file>` (the CLI of @osdlc/markdown-contract)',
    )
  })

  it('rejects an unsupported mcVersion (3; this build supports 2)', () => {
    expect(() => loadContract('mcVersion: 3\nkind: contract\n')).toThrow(DeclarativeError)
    expect(() => loadContract('mcVersion: 3\nkind: contract\n')).toThrow(/supports 2/)
  })

  it('rejects a missing / wrong kind', () => {
    expect(() => loadContract('mcVersion: 2\n')).toThrow(DeclarativeError)
    expect(() => loadContract('mcVersion: 2\nkind: config\n')).toThrow(DeclarativeError)
  })

  it('compiles a body grammar (a required section that is absent → structure/section-missing)', () => {
    const c = loadContract(
      'mcVersion: 2\nkind: contract\nbody:\n  order: none\n  sections:\n    - section: Summary\n',
    )
    const r = c.validate('## Other\n\nx\n', { path: 'x.md' })
    expect(r.findings.map((f) => f.id)).toContain('structure/section-missing')
  })
})

// ── The v2 compiler set ───────────────────────────────────────────────────

const V2 = `mcVersion: 2
kind: contract
frontmatter:
  type: object
  additionalProperties: false
  required: [id]
  properties:
    id: { type: string, pattern: '^D-[0-9A-Z]{4}$' }
    status: { enum: [open, closed] }
body:
  order: none
  sections:
    - section: Summary
`

describe('loadContract — the v2 compiler set', () => {
  it('a clean v2 document yields no findings', () => {
    const c = loadContract(V2)
    const src = '---\nid: D-0001\n---\n\n## Summary\n\nx\n'
    expect(c.validate(src, { path: 'x.md' }).findings).toEqual([])
  })

  it('the v2 frontmatter plane runs: required inversion + strict object', () => {
    const c = loadContract(V2)
    const ids = c
      .validate('---\nstatus: open\nextra: 1\n---\n\n## Summary\n\nx\n', { path: 'x.md' })
      .findings.map((f) => f.id)
    expect(ids).toContain('frontmatter/required') // id is in `required`
    expect(ids).toContain('frontmatter/unknown-key') // additionalProperties: false
  })

  it('a v1 spelling is rejected with the migrate hint', () => {
    const yaml =
      'mcVersion: 2\nkind: contract\nbody:\n  order: none\n  sections:\n    - section: S\n      optional: true\n'
    expect(() => loadContract(yaml)).toThrow(/'optional' is the v1 spelling/)
  })

  it('the v2 contract root is closed', () => {
    expect(() => loadContract('mcVersion: 2\nkind: contract\nrules: []\n')).toThrow(
      /contract: unknown key 'rules'/,
    )
  })
})

// ── description → Finding.hint: nearest enclosing description wins ───────

const V2_HINTED = `mcVersion: 2
kind: contract
description: the contract-root guidance
frontmatter:
  type: object
  required: [id]
  properties:
    id: { type: string, description: 'the decision id, like D-0001' }
    status: { enum: [open, closed] }
body:
  order: none
  additionalSections: false
  description: the body-root guidance
  requires:
    - pattern: sign-off
  sections:
    - section: Summary
      description: a one-paragraph summary
      content:
        maxWords: 5
    - section: Tasks
      description: the task checklist
      requires:
        - pattern: AC-1
      content:
        list: { items: checkbox, description: every task is a checkbox }
    - section: Plain
`

describe('loadContract — findings carry the nearest enclosing description as hint', () => {
  const c = loadContract(V2_HINTED)
  const hintOf = (findings: Finding[], id: string): string | undefined =>
    findings.find((f) => f.id === id)?.hint

  it('a leaf finding carries the leaf description', () => {
    const r = c.validate(
      '---\nid: x\n---\n\n## Summary\n\nsign-off\n\n## Tasks\n\n- plain item AC-1\n\n## Plain\n\nx\n',
      { path: 'x.md' },
    )
    expect(hintOf(r.findings, 'content/list/item-kind')).toBe('every task is a checkbox')
  })

  it("a section finding carries the section description; an undescribed slot falls back to the level's", () => {
    const r = c.validate('## Wrong\n\nx\n', { path: 'x.md' })
    const missing = r.findings.filter((f) => f.id === 'structure/section-missing')
    expect(missing.find((f) => f.message.includes('Summary'))?.hint).toBe('a one-paragraph summary')
    expect(missing.find((f) => f.message.includes('Plain'))?.hint).toBe('the body-root guidance')
  })

  it("a section text rule carries the section's hint; the body-root rule carries the contract root's", () => {
    const r = c.validate(
      '---\nid: x\n---\n\n## Summary\n\nok\n\n## Tasks\n\n- [ ] t\n\n## Plain\n\nx\n',
      {
        path: 'x.md',
      },
    )
    const requires = r.findings.filter((f) => f.id.startsWith('text/requires'))
    expect(requires.find((f) => f.message.includes('AC-1'))?.hint).toBe('the task checklist')
    expect(requires.find((f) => f.message.includes('sign-off'))?.hint).toBe(
      'the contract-root guidance',
    )
  })

  it("frontmatter findings resolve the failing field's describe(), else the contract root's", () => {
    const r = c.validate(
      '---\nstatus: bogus\n---\n\n## Summary\n\nsign-off\n\n## Tasks\n\n- [ ] AC-1\n\n## Plain\n\nx\n',
      {
        path: 'x.md',
      },
    )
    expect(hintOf(r.findings, 'frontmatter/required')).toBe('the decision id, like D-0001')
    expect(hintOf(r.findings, 'frontmatter/enum')).toBe('the contract-root guidance')
  })

  it('a description-free contract mints findings byte-identical to its combinator twin (no hint key)', () => {
    const yaml = loadContract(
      'mcVersion: 2\nkind: contract\nbody:\n  order: none\n  sections:\n    - section: Summary\n',
    )
    const ts = contract({ body: sections({ order: 'none' }, [section('Summary')]) })
    const src = '## Other\n\nx\n'
    const yamlFindings = yaml.validate(src, { path: 'x.md' }).findings
    expect(yamlFindings).toEqual(ts.validate(src, { path: 'x.md' }).findings)
    for (const f of yamlFindings) {
      expect(Object.keys(f)).not.toContain('hint')
    }
  })
})
