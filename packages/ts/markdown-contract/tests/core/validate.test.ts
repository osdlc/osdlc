/**
 * Unit tests for `validate` and how it collects findings: the sort across planes, `doc` being
 * set only when there is no error, `read()` and `ContractError`, a `docRule` finding, and
 * passing an already parsed `DocTree`.
 */
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import type { Doc, Finding, SectionView } from '../../src/index.js'
import {
  ContractError,
  contract,
  docRule,
  list,
  parse,
  section,
  sections,
} from '../../src/index.js'

const PATH = 'doc.md'

/** A contract that trips all four planes at once, for the merge/sort test. */
function fourPlaneContract() {
  return contract({
    frontmatter: z.strictObject({
      id: z.string(),
      status: z.enum(['open', 'closed']),
    }),
    body: sections({ order: 'recognized-relative', allowUnknown: true }, [
      section('Summary'),
      section('Items', { content: list({ everyItem: 'checkbox', minItems: 1 }) }),
    ]),
    rules: [
      // A docRule that always fires. It has no pos, so it is document-level and sorts first.
      docRule('doc/always', (_doc, ctx) => [
        ctx.finding({ id: 'doc/always', message: 'the always-on cross-plane rule' }),
      ]),
    ],
  })
}

describe('deterministic cross-plane finding order', () => {
  test('merges frontmatter + structure + content + rule, sorted by line then plane', () => {
    const source = [
      '---',
      'id: D-1',
      'status: bogus', // line 3 — frontmatter/enum
      '---',
      '',
      '## Summary',
      '',
      'Some prose.',
      '',
      '## Items', // declared 2nd; in order, so no structure/section-order
      '',
      '- a plain bullet, not a checkbox', // line 12 — content/list/item-kind
    ].join('\n')

    const { findings } = fourPlaneContract().validate(source, { path: PATH })
    const shape = findings.map((f) => ({ id: f.id, line: f.pos?.line }))

    // doc/always has no pos, so it sorts first (as line 0). Then the line-3 frontmatter
    // finding, then the line-12 content finding. Plane order only breaks ties on the same
    // line, and here the lines already differ.
    expect(shape).toEqual([
      { id: 'doc/always', line: undefined },
      { id: 'frontmatter/enum', line: 3 },
      { id: 'content/list/item-kind', line: 12 },
    ])
  })

  test('on a fully-tied pos, plane order breaks the tie (structure before rule)', () => {
    // A doc whose only section "S" is at line 1, col 1 and lacks a required anchor (a
    // structure finding at the section pos), plus a docRule that emits at the same pos. Line
    // and col tie, so the plane order (structure, then rule) decides.
    const c = contract({
      body: sections({}, [section('S', { anchor: 'x' })]),
      rules: [
        docRule('z/same-pos', (doc, ctx) => {
          const s = (
            doc.body as { section(n: string): { pos: { line: number; col?: number } } | undefined }
          ).section('S')
          return s
            ? [ctx.finding({ id: 'z/same-pos', message: 'rule at the section pos', pos: s.pos })]
            : []
        }),
      ],
    })
    const { findings } = c.validate('## S\n\nprose\n', { path: PATH })
    const tied = findings.filter((f) => f.pos?.line === 1).map((f) => f.id)
    expect(tied).toEqual(['structure/anchor-missing', 'z/same-pos'])
  })
})

describe('the doc-iff-no-error gate', () => {
  test('doc is present when there is no error-level finding', () => {
    const c = contract({ body: sections({}, [section('Summary')]) })
    const { findings, doc } = c.validate('## Summary\n\nhi\n', { path: PATH })
    expect(findings.every((f) => f.level !== 'error')).toBe(true)
    expect(doc).toBeDefined()
    const s = (doc as Doc).body as { section(n: string): SectionView | undefined }
    expect(s.section('Summary')?.name).toBe('Summary')
  })

  test('doc is absent when an error-level finding is present', () => {
    const c = contract({ body: sections({}, [section('Required')]) })
    const { findings, doc } = c.validate('## Present\n', { path: PATH })
    expect(findings.some((f) => f.level === 'error')).toBe(true)
    expect(doc).toBeUndefined()
  })

  test('doc is built lazily and cached — repeated reads return the same object', () => {
    const c = contract({ body: sections({}, [section('Summary')]) })
    const result = c.validate('## Summary\n\nhi\n', { path: PATH })
    // Reading findings alone must not throw or require the model.
    expect(Array.isArray(result.findings)).toBe(true)
    // The getter builds on first access and caches: two reads return the same object.
    const first = result.doc
    const second = result.doc
    expect(first).toBeDefined()
    expect(first).toBe(second)
  })
})

describe('read() — model or ContractError', () => {
  test('returns the typed model on a valid document', () => {
    const c = contract({ body: sections({}, [section('Summary')]) })
    const doc = c.read('## Summary\n\nthe body prose\n', { path: PATH })
    const s = doc.body as { section(n: string): SectionView | undefined }
    expect(s.section('Summary')?.text()).toContain('the body prose')
  })

  test('throws ContractError carrying the error-level findings', () => {
    const c = contract({ body: sections({}, [section('Required')]) })
    let err: unknown
    try {
      c.read('## Present\n', { path: PATH })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ContractError)
    const findings = (err as ContractError).findings
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.every((f: Finding) => f.level === 'error')).toBe(true)
    expect(findings.some((f: Finding) => f.id === 'structure/section-missing')).toBe(true)
  })
})

describe('docRule execution', () => {
  test('a docRule emits a rule finding via ctx.finding, stamped with path and default level', () => {
    const c = contract({
      frontmatter: z.object({ status: z.string() }),
      body: sections({ order: 'none', allowUnknown: true }, [section('Goal')]),
      rules: [
        docRule('task/needs-goal-note', (doc, ctx) => {
          const fm = doc.frontmatter as { status: string }
          return fm.status === 'closed'
            ? [ctx.finding({ id: 'task/needs-goal-note', message: 'closed tasks need a note' })]
            : []
        }),
      ],
    })
    const closed = c.validate(
      ['---', 'status: closed', '---', '', '## Goal', '', 'do the thing'].join('\n'),
      { path: PATH },
    )
    const rule = closed.findings.find((f) => f.id === 'task/needs-goal-note')
    expect(rule).toBeDefined()
    expect(rule?.level).toBe('error') // registered default (RULE_LEVELS / fallback)
    expect(rule?.path).toBe(PATH) // the engine stamps the document path
    expect(rule?.pos).toBeUndefined() // no pos, so document-level

    // For an open task the rule returns early, with no finding.
    const open = c.validate(
      ['---', 'status: open', '---', '', '## Goal', '', 'do the thing'].join('\n'),
      { path: PATH },
    )
    expect(open.findings.some((f) => f.id === 'task/needs-goal-note')).toBe(false)
  })
})

describe('the pre-parsed DocTree overload', () => {
  test('validate accepts a DocTree from parse() and produces the same findings as the string', () => {
    const c = contract({ body: sections({}, [section('Summary')]) })
    const source = '## Other\n\nbody\n'
    const fromString = c.validate(source, { path: PATH })
    const tree = parse(source)
    const fromTree = c.validate(tree, { path: PATH })

    const ids = (r: { findings: Finding[] }) => r.findings.map((f) => f.id)
    expect(ids(fromTree)).toEqual(ids(fromString))
    // and the returned tree is the same object we passed in.
    expect(fromTree.tree).toBe(tree)
  })
})

describe('description → Finding.hint — the TS-API passthrough', () => {
  test('contract() accepts a root description; findings with no nearer description carry it', () => {
    const c = contract({
      description: 'the contract-root guidance',
      body: sections({}, [
        section('Summary', { description: 'a one-paragraph summary' }),
        section('Plain'),
      ]),
    })
    const r = c.validate('## Other\n\nx\n', { path: PATH })
    const missing = r.findings.filter((f) => f.id === 'structure/section-missing')
    expect(missing.find((f) => f.message.includes('Summary'))?.hint).toBe('a one-paragraph summary')
    expect(missing.find((f) => f.message.includes('Plain'))?.hint).toBe(
      'the contract-root guidance',
    )
  })

  test('a level description on sections() opts supersedes the root for its findings', () => {
    const c = contract({
      description: 'root',
      body: sections({ description: 'the level' }, [section('Summary')]),
    })
    const f = c
      .validate('## Other\n\nx\n', { path: PATH })
      .findings.find((x) => x.id === 'structure/section-missing')
    expect(f?.hint).toBe('the level')
  })

  test('without any description, findings carry no hint key at all', () => {
    const c = contract({ body: sections({}, [section('Summary')]) })
    const r = c.validate('## Other\n\nx\n', { path: PATH })
    for (const f of r.findings) {
      expect(Object.keys(f)).not.toContain('hint')
    }
  })
})
