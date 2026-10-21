import { describe, expect, test } from 'vitest'

import { contract, docRule, section, sections } from '../../src/index.js'
import { defaultRegistry, makeCtx } from '../../src/core/registry.js'
import {
  buildTextFindings,
  matchText,
  synthesizeTextId,
  type TextMatchSpec,
} from '../../src/core/text-match.js'

// text-match.ts owns the pure text matcher, the `text/*` finding-builder, and the stable
// finding-id synthesis. These tests double as the module's contract: each `matchText`
// / `synthesizeTextId` case is an input and the exact value it returns; the builder cases pin the
// exact finding emitted for a present / absent / counted phrase.

describe("matchText — count occurrences and pin each hit's source position", () => {
  test("a present literal → count 1 and the hit's { line, col }", () => {
    expect(matchText('the widget protocol', { pattern: 'widget' })).toEqual({
      count: 1,
      positions: [{ line: 1, col: 5 }],
    })
  })

  test('an absent literal → count 0, no positions', () => {
    expect(matchText('nothing here', { pattern: 'widget' })).toEqual({ count: 0, positions: [] })
  })

  test('a repeated literal → count N, one position per hit', () => {
    expect(matchText('na na na', { pattern: 'na' })).toEqual({
      count: 3,
      positions: [
        { line: 1, col: 1 },
        { line: 1, col: 4 },
        { line: 1, col: 7 },
      ],
    })
  })

  test('a regex → every match, each pinned', () => {
    expect(matchText('cat bat', { regex: '[cb]at' })).toEqual({
      count: 2,
      positions: [
        { line: 1, col: 1 },
        { line: 1, col: 5 },
      ],
    })
  })

  test('a hit on a later line carries that line number', () => {
    expect(matchText('line one\nhas widget', { pattern: 'widget' })).toEqual({
      count: 1,
      positions: [{ line: 2, col: 5 }],
    })
  })

  test('matches text inside an inline code span', () => {
    expect(matchText('run `tool task close` now', { pattern: 'tool task close' })).toEqual({
      count: 1,
      positions: [{ line: 1, col: 6 }],
    })
  })

  describe('normalize — collapse whitespace runs (default true)', () => {
    test('on (default): a phrase split across a wrapped line still matches', () => {
      expect(matchText('the widget\nprotocol here', { pattern: 'widget protocol' })).toEqual({
        count: 1,
        positions: [{ line: 1, col: 5 }],
      })
    })

    test('off: exact bytes — the wrapped phrase no longer matches', () => {
      expect(
        matchText('the widget\nprotocol here', { pattern: 'widget protocol', normalize: false }),
      ).toEqual({ count: 0, positions: [] })
    })

    test('off: an exact single-space occurrence still matches', () => {
      expect(
        matchText('a widget protocol b', { pattern: 'widget protocol', normalize: false }),
      ).toEqual({
        count: 1,
        positions: [{ line: 1, col: 3 }],
      })
    })
  })

  test('ignoreCase folds case', () => {
    expect(matchText('The WIDGET', { pattern: 'widget', ignoreCase: true })).toEqual({
      count: 1,
      positions: [{ line: 1, col: 5 }],
    })
  })

  test('a spec with neither pattern nor regex throws', () => {
    expect(() => matchText('x', {})).toThrow(/pattern.*regex/)
  })
})

describe('synthesizeTextId — text/<kind>/<scopeKey>/<patternHash>, stable and override-able', () => {
  test('shape: text/<kind>/<scopeKey>/<hash>', () => {
    expect(synthesizeTextId('requires', 'doc', { pattern: 'tool task close' })).toMatch(
      /^text\/requires\/doc\/[0-9a-z]+$/,
    )
    expect(synthesizeTextId('forbids', 'doc', { pattern: 'WARNING' })).toMatch(
      /^text\/forbids\/doc\/[0-9a-z]+$/,
    )
    expect(synthesizeTextId('count', 'summary', { pattern: 'x' })).toMatch(
      /^text\/count\/summary\/[0-9a-z]+$/,
    )
  })

  test('stable across entry reordering — same spec → same id (not index-based)', () => {
    const a = synthesizeTextId('requires', 'doc', { pattern: 'alpha' })
    const b = synthesizeTextId('requires', 'doc', { pattern: 'alpha' })
    expect(a).toBe(b)
  })

  test('a different pattern or scope → a different id', () => {
    const base = synthesizeTextId('requires', 'doc', { pattern: 'alpha' })
    expect(synthesizeTextId('requires', 'doc', { pattern: 'beta' })).not.toBe(base)
    expect(synthesizeTextId('requires', 'summary', { pattern: 'alpha' })).not.toBe(base)
  })

  test('an explicit id on the spec is returned verbatim', () => {
    expect(synthesizeTextId('requires', 'doc', { pattern: 'x', id: 'custom/my-id' })).toBe(
      'custom/my-id',
    )
  })
})

describe('buildTextFindings — requires / forbids / count, positioned per', () => {
  const ctx = makeCtx('doc.md', defaultRegistry())

  test('requires miss → one text/requires at the scope heading, default error level', () => {
    const spec: TextMatchSpec = { pattern: 'outcome' }
    const match = matchText('no mention of it here', spec)
    expect(
      buildTextFindings({
        kind: 'requires',
        spec,
        match,
        scopeKey: 'summary',
        scope: 'Summary',
        scopePos: { line: 6, col: 1 },
        ctx,
      }),
    ).toEqual([
      {
        id: synthesizeTextId('requires', 'summary', spec),
        level: 'error',
        path: 'doc.md',
        message: 'required phrase "outcome" not found in Summary',
        pos: { line: 6, col: 1 },
      },
    ])
  })

  test('requires satisfied → no finding', () => {
    const spec: TextMatchSpec = { pattern: 'outcome' }
    const match = matchText('the outcome is clear', spec)
    expect(
      buildTextFindings({
        kind: 'requires',
        spec,
        match,
        scopeKey: 'summary',
        scopePos: { line: 6, col: 1 },
        ctx,
      }),
    ).toEqual([])
  })

  test("requires miss at the body root → a document-level finding (no pos), 'document' scope", () => {
    const spec: TextMatchSpec = { pattern: 'tool task close' }
    const match = matchText('unrelated prose', spec)
    expect(buildTextFindings({ kind: 'requires', spec, match, scopeKey: 'doc', ctx })).toEqual([
      {
        id: synthesizeTextId('requires', 'doc', spec),
        level: 'error',
        path: 'doc.md',
        message: 'required phrase "tool task close" not found in document',
      },
    ])
  })

  test("the spec's note is appended to the message", () => {
    const spec: TextMatchSpec = { pattern: 'outcome', note: 'the decision outcome' }
    const match = matchText('nope', spec)
    const f = buildTextFindings({
      kind: 'requires',
      spec,
      match,
      scopeKey: 'summary',
      scope: 'Summary',
      scopePos: { line: 6, col: 1 },
      ctx,
    })[0]!
    expect(f.message).toBe('required phrase "outcome" not found in Summary — the decision outcome')
  })

  test('forbids hit → one text/forbids at the offending line', () => {
    const spec: TextMatchSpec = { pattern: 'WARNING' }
    const match = matchText('a WARNING here', spec)
    expect(buildTextFindings({ kind: 'forbids', spec, match, scopeKey: 'doc', ctx })).toEqual([
      {
        id: synthesizeTextId('forbids', 'doc', spec),
        level: 'error',
        path: 'doc.md',
        message: 'forbidden phrase "WARNING" present',
        pos: { line: 1, col: 3 },
      },
    ])
  })

  test('forbids absent → no finding', () => {
    const spec: TextMatchSpec = { pattern: 'WARNING' }
    const match = matchText('all clear', spec)
    expect(buildTextFindings({ kind: 'forbids', spec, match, scopeKey: 'doc', ctx })).toEqual([])
  })

  test('forbids with several hits → one finding per offending location', () => {
    const spec: TextMatchSpec = { pattern: 'WARNING' }
    const match = matchText('WARNING and WARNING', spec)
    const findings = buildTextFindings({ kind: 'forbids', spec, match, scopeKey: 'doc', ctx })
    expect(findings.map((f) => f.pos)).toEqual([
      { line: 1, col: 1 },
      { line: 1, col: 13 },
    ])
    expect(findings.every((f) => f.id === synthesizeTextId('forbids', 'doc', spec))).toBe(true)
  })

  test("count overflow (requires max) → text/count 'found N times, expected at most M'", () => {
    const spec: TextMatchSpec = { pattern: 'na', min: 1, max: 1 }
    const match = matchText('na na', spec)
    expect(
      buildTextFindings({
        kind: 'requires',
        spec,
        match,
        scopeKey: 'doc',
        scopePos: { line: 1, col: 1 },
        ctx,
      }),
    ).toEqual([
      {
        id: synthesizeTextId('count', 'doc', spec),
        level: 'error',
        path: 'doc.md',
        message: '"na" found 2 times, expected at most 1',
        pos: { line: 1, col: 1 },
      },
    ])
  })

  test("count shortfall (requires min ≥ 2) → text/count 'expected at least M'", () => {
    const spec: TextMatchSpec = { pattern: 'na', min: 2 }
    const match = matchText('na', spec)
    const f = buildTextFindings({
      kind: 'requires',
      spec,
      match,
      scopeKey: 'doc',
      scopePos: { line: 1, col: 1 },
      ctx,
    })[0]!
    expect(f.id).toBe(synthesizeTextId('count', 'doc', spec))
    expect(f.message).toBe('"na" found 1 times, expected at least 2')
  })

  test('forbids with a positive max → text/count when the cap is exceeded', () => {
    const spec: TextMatchSpec = { pattern: 'na', max: 2 }
    const match = matchText('na na na', spec)
    const f = buildTextFindings({
      kind: 'forbids',
      spec,
      match,
      scopeKey: 'doc',
      scopePos: { line: 1, col: 1 },
      ctx,
    })[0]!
    expect(f.id).toBe(synthesizeTextId('count', 'doc', spec))
    expect(f.message).toBe('"na" found 3 times, expected at most 2')
  })

  test("a spec's explicit level overrides the registry default", () => {
    const spec: TextMatchSpec = { pattern: 'X', level: 'warn' }
    const match = matchText('X', spec)
    const f = buildTextFindings({ kind: 'forbids', spec, match, scopeKey: 'doc', ctx })[0]!
    expect(f.level).toBe('warn')
  })
})

describe('the text plane is registered', () => {
  test('the registry seeds text/requires, text/forbids, text/count at error', () => {
    const reg = defaultRegistry()
    expect(reg['text/requires']).toBe('error')
    expect(reg['text/forbids']).toBe('error')
    expect(reg['text/count']).toBe('error')
  })

  test('text/* findings sort into their own plane — after content, before rule', () => {
    // A docRule that emits, all at the same { line, col }, one finding in each of the content /
    // text / rule planes (out of emission order). The deterministic sort breaks the pos tie by
    // plane, so the order proves `text` sits between `content` and `rule` in PLANE_ORDER.
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [section('S')]),
      rules: [
        docRule('probe', (_doc, ctx) => {
          const at = { line: 1, col: 1 }
          const textFindings = buildTextFindings({
            kind: 'forbids',
            spec: { pattern: 'X' },
            match: matchText('X', { pattern: 'X' }), // count 1 at line 1, col 1
            scopeKey: 'doc',
            ctx,
          })
          return [
            ctx.finding({ id: 'rule/probe', message: 'r', pos: at }),
            ...textFindings,
            ctx.finding({ id: 'content/probe', message: 'c', pos: at }),
          ]
        }),
      ],
    })
    const { findings } = c.validate('## S\n\nbody\n', { path: 'doc.md' })
    const tied = findings.filter((f) => f.pos?.line === 1 && f.pos?.col === 1)
    expect(tied[0]?.id).toBe('content/probe')
    expect(tied[1]?.id).toMatch(/^text\/forbids\/doc\//)
    expect(tied[2]?.id).toBe('rule/probe')
  })
})
