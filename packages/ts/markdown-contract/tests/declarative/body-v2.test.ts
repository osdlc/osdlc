import { describe, expect, it } from 'vitest'

import type { SectionSpec } from '../../src/core/types.js'
import { compileBodyV2 } from '../../src/declarative/body-v2.js'
import { DeclarativeError } from '../../src/declarative/errors.js'
import { compileContractObject } from '../../src/declarative/load.js'

const ctx = { path: 'fixture.md' }

/** Compile a v2 body into a contract (the mcVersion: 2 path of `compileContractObject`). */
const build = (body: Record<string, unknown>) => compileContractObject({ body })

/** One 'Entry' section per repetition, plus a trailing 'Tail' anchor section. */
const entries = (n: number): string =>
  [...Array(n).fill('## Entry\n\nx\n'), '## Tail\n\ny\n'].join('\n')

describe('compileBodyV2 — the v2 level vocabulary', () => {
  it("additionalSections: false rejects an unknown section (v1's allowUnknown)", () => {
    const c = build({
      order: 'none',
      additionalSections: false,
      sections: [{ section: 'Summary' }],
    })
    const ids = c.validate('## Summary\n\nx\n\n## Stray\n\ny\n', ctx).findings.map((f) => f.id)
    expect(ids).toContain('structure/section-order')
  })

  it('additionalSections: true admits unknown sections', () => {
    const c = build({
      order: 'none',
      additionalSections: true,
      sections: [{ section: 'Summary' }],
    })
    expect(c.validate('## Summary\n\nx\n\n## Stray\n\ny\n', ctx).findings).toEqual([])
  })

  it('hoisted sections: a nested level sits directly on the section node (no children: wrapper)', () => {
    const c = build({
      order: 'none',
      sections: [
        {
          section: 'Decision',
          sections: [{ section: 'Rationale' }],
          order: 'strict',
        },
      ],
    })
    const ids = c.validate('## Decision\n\nx\n\n### Other\n\ny\n', ctx).findings.map((f) => f.id)
    expect(ids).toContain('structure/section-missing') // Rationale missing under Decision
    expect(c.validate('## Decision\n\nx\n\n### Rationale\n\ny\n', ctx).findings).toEqual([])
  })

  it('order / additionalSections without a hoisted sections list is an error', () => {
    expect(() => build({ sections: [{ section: 'A', order: 'strict' }] })).toThrow(
      /'order' requires a nested 'sections' list/,
    )
  })
})

describe('compileBodyV2 — occurrence (minContains / maxContains), the full recipe', () => {
  const counted = (occ: Record<string, unknown>) =>
    build({ order: 'none', sections: [{ section: 'Entry', ...occ }, { section: 'Tail' }] })

  it('both absent → a plain slot: required once, duplicates rejected', () => {
    const c = counted({})
    expect(c.validate(entries(0), ctx).findings.map((f) => f.id)).toContain(
      'structure/section-missing',
    )
    expect(c.validate(entries(1), ctx).findings).toEqual([])
    expect(c.validate(entries(2), ctx).findings.map((f) => f.id)).toContain(
      'structure/duplicate-section',
    )
  })

  it('minContains: 0, maxContains: 1 → optional, NOT repeatable', () => {
    const c = counted({ minContains: 0, maxContains: 1 })
    expect(c.validate(entries(0), ctx).findings).toEqual([])
    expect(c.validate(entries(1), ctx).findings).toEqual([])
    expect(c.validate(entries(2), ctx).findings.map((f) => f.id)).toContain(
      'structure/duplicate-section',
    )
  })

  it('minContains: 1, maxContains: 1 → a plain slot (same as both absent)', () => {
    const c = counted({ minContains: 1, maxContains: 1 })
    expect(c.validate(entries(0), ctx).findings.map((f) => f.id)).toContain(
      'structure/section-missing',
    )
    expect(c.validate(entries(1), ctx).findings).toEqual([])
  })

  it('minContains: 0 → optional + repeatable, unbounded', () => {
    const c = counted({ minContains: 0 })
    expect(c.validate(entries(0), ctx).findings).toEqual([])
    expect(c.validate(entries(3), ctx).findings).toEqual([])
  })

  it('minContains: 0, maxContains: 3 → optional + repeatable with max', () => {
    const c = counted({ minContains: 0, maxContains: 3 })
    expect(c.validate(entries(0), ctx).findings).toEqual([])
    expect(c.validate(entries(3), ctx).findings).toEqual([])
    expect(c.validate(entries(4), ctx).findings.map((f) => f.id)).toContain(
      'structure/repeat-count',
    )
  })

  it('minContains: 1 → required + repeatable, unbounded', () => {
    const c = counted({ minContains: 1 })
    expect(c.validate(entries(0), ctx).findings.map((f) => f.id)).toContain(
      'structure/section-missing',
    )
    expect(c.validate(entries(1), ctx).findings).toEqual([])
    expect(c.validate(entries(4), ctx).findings).toEqual([])
  })

  it('maxContains: 3 alone → lo defaults to 1: required, repeatable, capped', () => {
    const c = counted({ maxContains: 3 })
    expect(c.validate(entries(0), ctx).findings.map((f) => f.id)).toContain(
      'structure/section-missing',
    )
    expect(c.validate(entries(3), ctx).findings).toEqual([])
    expect(c.validate(entries(4), ctx).findings.map((f) => f.id)).toContain(
      'structure/repeat-count',
    )
  })

  it('minContains: 2 → repeatable with min (no optional wrapper)', () => {
    const c = counted({ minContains: 2 })
    expect(c.validate(entries(1), ctx).findings.map((f) => f.id)).toContain(
      'structure/repeat-count',
    )
    expect(c.validate(entries(2), ctx).findings).toEqual([])
  })

  it('minContains: 2, maxContains: 3 → repeatable with both bounds', () => {
    const c = counted({ minContains: 2, maxContains: 3 })
    expect(c.validate(entries(2), ctx).findings).toEqual([])
    expect(c.validate(entries(3), ctx).findings).toEqual([])
    expect(c.validate(entries(4), ctx).findings.map((f) => f.id)).toContain(
      'structure/repeat-count',
    )
  })

  it('bounds must be sane: non-negative integers, maxContains ≥ 1, max ≥ min', () => {
    expect(() => counted({ minContains: -1 })).toThrow(/must be a non-negative integer/)
    expect(() => counted({ minContains: 1.5 })).toThrow(/must be a non-negative integer/)
    expect(() => counted({ maxContains: 0 })).toThrow(/maxContains must be at least 1/)
    expect(() => counted({ minContains: 3, maxContains: 2 })).toThrow(
      /maxContains \(2\) is below minContains \(3\)/,
    )
  })
})

describe('compileBodyV2 — content leaves', () => {
  it('list items: checkbox gate', () => {
    const c = build({
      order: 'none',
      sections: [{ section: 'Tasks', content: { list: { items: 'checkbox', minItems: 1 } } }],
    })
    expect(c.validate('## Tasks\n\n- [ ] one\n- [x] two\n', ctx).findings).toEqual([])
    expect(c.validate('## Tasks\n\n- plain item\n', ctx).findings.map((f) => f.id)).toContain(
      'content/list/item-kind',
    )
  })

  it("list items: a v2 schema node validates each item's text", () => {
    const c = build({
      order: 'none',
      sections: [
        { section: 'Refs', content: { list: { items: { type: 'string', pattern: '^D-' } } } },
      ],
    })
    expect(c.validate('## Refs\n\n- D-0001\n', ctx).findings).toEqual([])
    expect(c.validate('## Refs\n\n- T-0001\n', ctx).findings.map((f) => f.id)).toContain(
      'content/list/item-kind',
    )
  })

  it('table cells compile through the v2 schema subset', () => {
    const c = build({
      order: 'none',
      sections: [
        {
          section: 'Rows',
          content: {
            table: { columns: ['Id'], cells: { Id: { type: 'string', pattern: '^R-' } } },
          },
        },
      ],
    })
    expect(c.validate('## Rows\n\n| Id |\n| -- |\n| R-1 |\n', ctx).findings).toEqual([])
    expect(
      c.validate('## Rows\n\n| Id |\n| -- |\n| X-1 |\n', ctx).findings.map((f) => f.id),
    ).toContain('content/table/cell')
  })

  it('leaf configs are closed — everyItem gets its v1→v2 hint, an unknown key errors', () => {
    expect(() =>
      build({
        order: 'none',
        sections: [{ section: 'L', content: { list: { everyItem: 'checkbox' } } }],
      }),
    ).toThrow(/'everyItem' is the v1 spelling — v2 uses 'items'/)
    expect(() =>
      build({
        order: 'none',
        sections: [{ section: 'T', content: { table: { columns: ['A'], wat: 1 } } }],
      }),
    ).toThrow(/unknown key 'wat'/)
  })
})

describe('compileBodyV2 — v1 keys are rejected with migration hints', () => {
  const node = (extra: Record<string, unknown>) =>
    build({ order: 'none', sections: [{ section: 'S', ...extra }] })

  it('optional / repeatable / min / max name the occurrence keys', () => {
    expect(() => node({ optional: true })).toThrow(
      /'optional' is the v1 spelling — v2 uses 'minContains: 0'/,
    )
    expect(() => node({ repeatable: true })).toThrow(
      /'repeatable' is the v1 spelling — v2 uses 'minContains' \/ 'maxContains'/,
    )
    expect(() => node({ min: 2 })).toThrow(/'min' is the v1 spelling — v2 uses 'minContains'/)
    expect(() => node({ max: 3 })).toThrow(/'max' is the v1 spelling — v2 uses 'maxContains'/)
  })

  it('children names the hoisted sections form', () => {
    expect(() => node({ children: { sections: [] } })).toThrow(
      /'children' is the v1 spelling — v2 uses a hoisted 'sections' list on the node/,
    )
  })

  it('allowUnknown (level) names additionalSections', () => {
    expect(() => build({ order: 'none', allowUnknown: true, sections: [] })).toThrow(
      /'allowUnknown' is the v1 spelling — v2 uses 'additionalSections'/,
    )
  })

  it('the node vocabulary is closed — an unknown node or level key errors (v1 ignored them)', () => {
    expect(() => node({ wat: 1 })).toThrow(/unknown key 'wat'/)
    expect(() => build({ order: 'none', sections: [], wat: 1 })).toThrow(/unknown key 'wat'/)
    expect(() => node({ oneOf: ['A'] })).toThrow(
      /needs exactly one of section \/ oneOf \/ gap \(got section \+ oneOf\)/,
    )
  })
})

describe('compileBodyV2 — gap and oneOf nodes', () => {
  it('a bare gap admits unknown sections between strict neighbours', () => {
    const c = build({
      order: 'strict',
      sections: [{ section: 'A' }, { gap: null }, { section: 'B' }],
    })
    expect(c.validate('## A\n\nx\n\n## Stray\n\ny\n\n## B\n\nz\n', ctx).findings).toEqual([])
  })

  it('gap bounds ride through ({ min, max } → structure/gap-count)', () => {
    const c = build({
      order: 'strict',
      sections: [{ section: 'A' }, { gap: { min: 1, max: 1 } }, { section: 'B' }],
    })
    expect(c.validate('## A\n\nx\n\n## B\n\nz\n', ctx).findings.map((f) => f.id)).toContain(
      'structure/gap-count',
    )
  })

  it('gap value is closed: a non-mapping, an unknown key, or a non-number bound errors', () => {
    expect(() => build({ sections: [{ gap: 'wide' }] })).toThrow(/gap must be a mapping/)
    expect(() => build({ sections: [{ gap: { wat: 1 } }] })).toThrow(/gap: unknown key 'wat'/)
    expect(() => build({ sections: [{ gap: { min: 'lots' } }] })).toThrow(
      /gap.min must be a number/,
    )
  })

  it('oneOf compiles an alias-set slot; occurrence keys apply to it too', () => {
    const c = build({
      order: 'none',
      sections: [{ oneOf: ['Result', 'Outcome'], minContains: 0 }],
    })
    expect(c.validate('## Outcome\n\nx\n', ctx).findings).toEqual([])
    expect(c.validate('## Unrelated\n\nx\n', ctx).findings).toEqual([]) // optional
  })

  it('oneOf must be a non-empty list of names', () => {
    expect(() => build({ sections: [{ oneOf: [] }] })).toThrow(
      /oneOf must be a non-empty list of section names/,
    )
    expect(() => build({ sections: [{ oneOf: [1] }] })).toThrow(DeclarativeError)
  })

  it('section aliases ride through; malformed aliases error', () => {
    const c = build({ order: 'none', sections: [{ section: 'Summary', aliases: ['Overview'] }] })
    expect(c.validate('## Overview\n\nx\n', ctx).findings).toEqual([])
    expect(() => build({ sections: [{ section: 'S', aliases: 'Overview' }] })).toThrow(
      /aliases must be a list of alias spellings/,
    )
  })

  it('anchor compiles to a required block-id', () => {
    const c = build({ order: 'none', sections: [{ section: 'S', anchor: 'pin' }] })
    expect(c.validate('## S\n\nx\n', ctx).findings.map((f) => f.id)).toContain(
      'structure/anchor-missing',
    )
    expect(c.validate('## S\n\nx ^pin\n', ctx).findings).toEqual([])
  })
})

describe('compileBodyV2 — malformed levels and nodes are rejected', () => {
  it('the body / a node / a leaf must be the right shape', () => {
    expect(() => compileBodyV2('nope')).toThrow(/must be a mapping with a 'sections' list/)
    expect(() => build({ sections: 'nope' })).toThrow(/sections must be a list of nodes/)
    expect(() => build({ sections: ['nope'] })).toThrow(/a body node must be a mapping/)
    expect(() => build({ sections: [{}] })).toThrow(
      /a body node needs exactly one of section \/ oneOf \/ gap/,
    )
    expect(() => build({ sections: [{ section: 7 }] })).toThrow(/section must be a heading name/)
  })

  it('level knobs are type-checked', () => {
    expect(() => build({ order: 'alphabetical', sections: [] })).toThrow(
      /order must be none \| recognized-relative \| strict/,
    )
    expect(() => build({ additionalSections: 'yes', sections: [] })).toThrow(
      /additionalSections must be a boolean/,
    )
    expect(() => build({ sections: [{ section: 'S', additionalSections: true }] })).toThrow(
      /'additionalSections' requires a nested 'sections' list/,
    )
    expect(() => build({ sections: [{ section: 'S', description: 7 }] })).toThrow(
      /description must be a string/,
    )
  })
})

describe('compileBodyV2 — the remaining leaves', () => {
  it('maxWords bounds a paragraph; a non-number errors', () => {
    const c = build({
      order: 'none',
      sections: [{ section: 'S', content: { maxWords: 2 } }],
    })
    expect(c.validate('## S\n\ntoo many words here\n', ctx).findings.map((f) => f.id)).toContain(
      'content/max-words',
    )
    expect(() => build({ sections: [{ section: 'S', content: { maxWords: 'few' } }] })).toThrow(
      /maxWords must be a number/,
    )
  })

  it('code pins a language; an empty code leaf allows any', () => {
    const c = build({
      order: 'none',
      sections: [{ section: 'S', content: { code: { lang: 'ts' } } }],
    })
    expect(c.validate('## S\n\n```ts\nx\n```\n', ctx).findings).toEqual([])
    expect(c.validate('## S\n\n```js\nx\n```\n', ctx).findings.map((f) => f.id)).toContain(
      'content/code/lang',
    )
    const anyLang = build({
      order: 'none',
      sections: [{ section: 'S', content: { code: null } }],
    })
    expect(anyLang.validate('## S\n\n```js\nx\n```\n', ctx).findings).toEqual([])
  })

  it('code config is closed and type-checked', () => {
    expect(() => build({ sections: [{ section: 'S', content: { code: { lang: 7 } } }] })).toThrow(
      /code.lang must be a string/,
    )
    expect(() => build({ sections: [{ section: 'S', content: { code: { wat: 1 } } }] })).toThrow(
      /unknown key 'wat'/,
    )
    expect(() => build({ sections: [{ section: 'S', content: { code: 'bash' } }] })).toThrow(
      /code must be a mapping/,
    )
  })

  it('table knobs: minRows, extraColumns, and their type checks', () => {
    const c = build({
      order: 'none',
      sections: [
        {
          section: 'S',
          content: { table: { columns: ['A'], minRows: 2, extraColumns: 'error' } },
        },
      ],
    })
    const ids = c
      .validate('## S\n\n| A | B |\n| - | - |\n| 1 | 2 |\n', ctx)
      .findings.map((f) => f.id)
    expect(ids).toContain('content/table/min-rows')
    expect(ids).toContain('content/table/column-extra')
    expect(() => build({ sections: [{ section: 'S', content: { table: 'flat' } }] })).toThrow(
      /table must be a mapping/,
    )
    expect(() =>
      build({ sections: [{ section: 'S', content: { table: { columns: [1] } } }] }),
    ).toThrow(/columns must be a list of column names/)
    expect(() =>
      build({
        sections: [{ section: 'S', content: { table: { columns: ['A'], minRows: '2' } } }],
      }),
    ).toThrow(/minRows must be a number/)
    expect(() =>
      build({
        sections: [{ section: 'S', content: { table: { columns: ['A'], extraColumns: 'warn' } } }],
      }),
    ).toThrow(/extraColumns must be "ignore" or "error"/)
    expect(() =>
      build({
        sections: [{ section: 'S', content: { table: { columns: ['A'], cells: 'x' } } }],
      }),
    ).toThrow(/cells must be a mapping of column → schema/)
  })

  it('list knobs are type-checked', () => {
    expect(() => build({ sections: [{ section: 'S', content: { list: 'flat' } }] })).toThrow(
      /list must be a mapping/,
    )
    expect(() =>
      build({ sections: [{ section: 'S', content: { list: { ordered: 'yes' } } }] }),
    ).toThrow(/ordered must be a boolean/)
    expect(() =>
      build({ sections: [{ section: 'S', content: { list: { minItems: '1' } } }] }),
    ).toThrow(/minItems must be a number/)
  })

  it('a named-leaf record binds leaves by ^anchor; malformed content errors', () => {
    const c = build({
      order: 'none',
      sections: [
        {
          section: 'S',
          content: {
            spec: { table: { columns: ['A'] } },
          },
        },
      ],
    })
    expect(c.validate('## S\n\n| A |\n| - |\n| 1 |\n^spec\n', ctx).findings).toEqual([])
    expect(c.validate('## S\n\nprose only\n', ctx).findings.map((f) => f.id)).toContain(
      'structure/block-missing',
    )
    expect(() => build({ sections: [{ section: 'S', content: 'prose' }] })).toThrow(
      /must be a leaf \(table\/list\/code\/maxWords\) or a named-leaf map/,
    )
    expect(() =>
      build({ sections: [{ section: 'S', content: { spec: { table: {}, list: {} } } }] }),
    ).toThrow(/a leaf must be a single-key mapping/)
  })
})

describe('compileBodyV2 — description capture', () => {
  it('level, node, and leaf descriptions land on LevelOpts / SectionOpts / leaf config', () => {
    const seq = compileBodyV2({
      order: 'none',
      description: 'the body root',
      sections: [
        {
          section: 'Summary',
          description: 'one-paragraph summary',
          content: { maxWords: 50 },
        },
        {
          section: 'Tasks',
          content: { list: { items: 'checkbox', description: 'tick every box' } },
        },
      ],
    })
    expect(seq.opts.description).toBe('the body root')
    const [summary, tasks] = seq.specs as [SectionSpec, SectionSpec]
    expect(summary.opts?.description).toBe('one-paragraph summary')
    const leaf = tasks.opts?.content
    expect((leaf as { config?: { description?: string } }).config?.description).toBe(
      'tick every box',
    )
  })

  it('description must be a string', () => {
    expect(() => compileBodyV2({ description: 7, sections: [] })).toThrow(
      /description must be a string/,
    )
  })
})
