/**
 * Peer test for the text-constraint builders.
 *
 * `requires` / `forbids` build a `Rule` over the text of the bound section and its subsections.
 * `textRule` builds a whole-document `DocRule`. Each uses the matcher in `text-match.ts` and
 * emits `text/*` findings. The first cases are meant to read as documentation: a section
 * `requires` pass and fail, and a document `forbids` pass and fail (unit versions of fixtures
 * 22 and 23). Later cases cover counts, regex, normalize/ignoreCase, passing note and level
 * through, the generated per-entry id, and the check on the `requires` absence form.
 */
import { describe, expect, it } from 'vitest'

import { contract, section, sections } from '../../src/index.js'
import { ContractBuildError } from '../../src/core/grammar.js'
import { parse } from '../../src/core/projection.js'
import { defaultRegistry, makeCtx } from '../../src/core/registry.js'
import { forbids, requires, textRule } from '../../src/core/text-constraints.js'
import type { BlockNode, Ctx, SectionNode } from '../../src/core/types.js'

const ctx: Ctx = makeCtx('fixture.md', defaultRegistry())

/** A heading-direct paragraph block at a given source line. */
function para(line: number, text: string): BlockNode {
  return { kind: 'paragraph', text, pos: { line, col: 1 }, inlineSpans: () => [] }
}

/** A heading-direct unordered list block. */
function listBlock(
  line: number,
  items: { text: string; pos: { line: number; col: number } }[],
): BlockNode {
  return { kind: 'list', ordered: false, pos: { line, col: 1 }, items }
}

/** A minimal projected `SectionNode` for direct-run unit cases. */
function sectionNode(
  name: string,
  line: number,
  blocks: BlockNode[],
  sub: SectionNode[] = [],
): SectionNode {
  return { name, depth: 2, pos: { line, col: 1 }, sections: sub, blocks, anchors: [] }
}

// ── Documentation-leading cases: section `requires`, document `forbids` ──────────────────

describe('requires — a section must CONTAIN a phrase', () => {
  const c = contract({
    body: sections({ order: 'recognized-relative', allowUnknown: true }, [
      section('Summary', { rules: [requires([{ pattern: 'outcome' }])] }),
    ]),
  })

  it('passes when the phrase is present in the section', () => {
    const { findings } = c.validate('## Summary\n\nThe chosen outcome is X.\n', { path: 'd.md' })
    expect(findings).toEqual([])
  })

  it('fails at the heading, with a synthesized per-entry id, when the phrase is absent', () => {
    const { findings } = c.validate('## Summary\n\nThe chosen direction is X.\n', { path: 'd.md' })
    expect(findings).toEqual([
      {
        id: 'text/requires/summary/1tc7itx',
        level: 'error',
        path: 'd.md',
        message: 'required phrase "outcome" not found in Summary',
        pos: { line: 1, col: 1 },
      },
    ])
  })
})

describe('textRule — a document must NOT contain a phrase (forbids)', () => {
  const c = contract({
    body: sections({ order: 'recognized-relative', allowUnknown: true }, [section('Summary')]),
    rules: [textRule({ forbids: [{ pattern: 'TODO' }] })],
  })

  it('passes when the phrase appears nowhere', () => {
    const { findings } = c.validate('## Summary\n\nAll steps are complete.\n', { path: 'd.md' })
    expect(findings).toEqual([])
  })

  it('fails at the offending line when the phrase appears', () => {
    const { findings } = c.validate('## Summary\n\nThere is a TODO left here.\n', { path: 'd.md' })
    expect(findings).toHaveLength(1)
    const f = findings[0]!
    expect(f.id).toBe('text/forbids/doc/mf4oln')
    expect(f.level).toBe('error')
    expect(f.message).toBe('forbidden phrase "TODO" present')
    // The whole-document scope now uses the projected tree, reconstructing text from
    // `tree.root` at real source lines, so the forbid pins at the exact offending line (line 3).
    expect(f.pos?.line).toBe(3)
  })
})

// ── forbids on a section reports the real source line ─────────────────────────────

describe('forbids — a section must NOT contain a phrase, reported at the source line', () => {
  it('emits one text/forbids per hit at the offending line', () => {
    const node = sectionNode('Notes', 1, [para(3, 'ok'), para(5, 'a TODO and another TODO')])
    const out = forbids([{ pattern: 'TODO' }]).run(node, ctx)
    expect(out).toHaveLength(2)
    expect(out.every((f) => f.id === 'text/forbids/notes/mf4oln')).toBe(true)
    expect(out.map((f) => f.pos?.line)).toEqual([5, 5])
    expect(out[0]!.message).toBe('forbidden phrase "TODO" present')
  })

  it('emits nothing when the phrase is absent', () => {
    const node = sectionNode('Notes', 1, [para(3, 'all clear')])
    expect(forbids([{ pattern: 'TODO' }]).run(node, ctx)).toEqual([])
  })
})

// ── : counts, regex, normalize, ignoreCase, note, level ──────────────────────────────

describe('count bounds', () => {
  it('a below-min count is a text/count finding at the heading', () => {
    const node = sectionNode('Summary', 1, [para(3, 'na once')])
    const out = requires([{ pattern: 'na', min: 2 }]).run(node, ctx)
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('text/count/summary/1jqz098')
    expect(out[0]!.message).toBe('"na" found 1 times, expected at least 2')
    expect(out[0]!.pos?.line).toBe(1)
  })

  it('a satisfied minimum emits nothing — DONE markers counted across list items', () => {
    const node = sectionNode('Checklist', 1, [
      listBlock(3, [
        { text: 'Step one DONE', pos: { line: 3, col: 3 } },
        { text: 'Step two DONE', pos: { line: 4, col: 3 } },
      ]),
    ])
    expect(requires([{ pattern: 'DONE', min: 2 }]).run(node, ctx)).toEqual([])
  })
})

describe('regex / normalize / ignoreCase', () => {
  it('a regex entry expresses an OR-of-literals', () => {
    const present = sectionNode('Failure modes', 1, [para(3, 'emits LEASE-CONFLICT ref=abc')])
    const absent = sectionNode('Failure modes', 1, [para(3, 'just a generic warning')])
    const spec = { regex: 'LEASE-(CONFLICT|MISSING) ref=' }
    expect(requires([spec]).run(present, ctx)).toEqual([])
    expect(requires([spec]).run(absent, ctx)).toHaveLength(1)
  })

  it('normalize (default) tolerates a phrase wrapped across a soft line break', () => {
    const wrapped = sectionNode('Summary', 1, [para(3, 'the widget\nprotocol here')])
    expect(requires([{ pattern: 'widget protocol' }]).run(wrapped, ctx)).toEqual([])
    expect(
      requires([{ pattern: 'widget protocol', normalize: false }]).run(wrapped, ctx),
    ).toHaveLength(1)
  })

  it('ignoreCase folds case', () => {
    const node = sectionNode('Summary', 1, [para(3, 'the WIDGET')])
    expect(requires([{ pattern: 'widget', ignoreCase: true }]).run(node, ctx)).toEqual([])
    expect(requires([{ pattern: 'widget' }]).run(node, ctx)).toHaveLength(1)
  })
})

describe('note and level flow onto the finding', () => {
  it("appends the note and rides the spec's level", () => {
    const node = sectionNode('Summary', 1, [para(3, 'no mention')])
    const out = requires([
      { pattern: 'outcome', note: 'name the decision outcome', level: 'warn' },
    ]).run(node, ctx)
    expect(out[0]!.level).toBe('warn')
    expect(out[0]!.message).toBe(
      'required phrase "outcome" not found in Summary — name the decision outcome',
    )
  })
})

// ── : stable per-entry id; distinct entries are distinct findings ─────────────────────

describe('per-entry id', () => {
  it('two distinct requirements on one section are two distinct findings', () => {
    const node = sectionNode('Summary', 1, [para(3, 'neither token here')])
    const out = requires([{ pattern: 'alpha' }, { pattern: 'beta' }]).run(node, ctx)
    expect(out.map((f) => f.id)).toEqual([
      'text/requires/summary/1nxahr1',
      'text/requires/summary/wfa6k9',
    ])
  })

  it('an explicit id on the spec pins the finding id', () => {
    const node = sectionNode('Summary', 1, [para(3, 'nope')])
    const out = requires([{ pattern: 'outcome', id: 'decision/names-outcome' }]).run(node, ctx)
    expect(out[0]!.id).toBe('decision/names-outcome')
  })
})

// ── : requires purity — the absence form is forbids ───────────────────────────────────

describe('requires purity', () => {
  it('rejects max:0 at construction (use forbids)', () => {
    expect(() => requires([{ pattern: 'x', max: 0 }])).toThrow(ContractBuildError)
    expect(() => requires([{ pattern: 'x', max: 0 }])).toThrow(/absence/)
  })

  it('rejects max < min at construction', () => {
    expect(() => requires([{ pattern: 'x', min: 2, max: 1 }])).toThrow(ContractBuildError)
  })

  it("rejects an absence-form entry in textRule's requires arm", () => {
    expect(() => textRule({ requires: [{ pattern: 'x', max: 0 }] })).toThrow(ContractBuildError)
  })

  it('forbids IS the absence form — max:0 is fine', () => {
    expect(() => forbids([{ pattern: 'x', max: 0 }])).not.toThrow()
    expect(() => forbids([{ pattern: 'x' }])).not.toThrow()
  })

  it('names a regex needle as /source/ in the absence-form error', () => {
    expect(() => requires([{ regex: 'foo|bar', max: 0 }])).toThrow(/\/foo\|bar\//)
  })
})

// ── scope text spans every block kind (code + table cells are searched too) ───────────────

describe('scope text is reconstructed from every block kind', () => {
  const doc = [
    '## Notes', // 1
    '', // 2
    '```txt', // 3
    'findme in code', // 4
    '```', // 5
    '', // 6
    '| Header |', // 7
    '| ------ |', // 8
    '| tablecell |', // 9
  ].join('\n')
  const notes = parse(doc).root.sections[0]!

  it('a required phrase living only in a fenced code block is found', () => {
    expect(requires([{ pattern: 'findme in code' }]).run(notes, ctx)).toEqual([])
  })

  it('a required phrase living only in a table cell is found', () => {
    expect(requires([{ pattern: 'tablecell' }]).run(notes, ctx)).toEqual([])
  })
})

// ── document-level requires miss has no position ──────────────────────────────────────────

describe('textRule requires — a document-level miss has no position', () => {
  it("a missing required phrase reports document-level (no pos), scope 'document'", () => {
    const c = contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [section('Summary')]),
      rules: [textRule({ requires: [{ pattern: 'tool task close' }] })],
    })
    const { findings } = c.validate('## Summary\n\nunrelated prose.\n', { path: 'd.md' })
    expect(findings).toHaveLength(1)
    const f = findings[0]!
    expect(f.id).toBe('text/requires/doc/19gxot0')
    expect(f.message).toBe('required phrase "tool task close" not found in document')
    expect(f.pos).toBeUndefined()
  })
})
