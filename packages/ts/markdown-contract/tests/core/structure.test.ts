/**
 * Direct unit tests for the structure plane.
 *
 * They cover the block-kind check (`structure/block-missing`, `structure/block-kind`),
 * `structure/anchor-missing`, the `contract/key-collision` throw at build time, the
 * `structure/key-collision` finding on a document, `gap({min,max})` bounds, repeatable sections
 * and the line of `structure/duplicate-section`. They run through `contract().validate(...)`,
 * which returns findings as data.
 */
import { describe, expect, test } from 'vitest'
import type { Finding } from '../../src/index.js'
import {
  code,
  contract,
  gap,
  list,
  maxWords,
  optional,
  section,
  sections,
  table,
} from '../../src/index.js'
import { ContractBuildError } from '../../src/core/grammar.js'

const ctx = { path: 'fixture.md' }

function ids(findings: Finding[]): string[] {
  return findings.map((f) => f.id)
}

describe('kind-gate · block-missing / block-kind', () => {
  test('a declared table slot with no block → structure/block-missing', () => {
    const c = contract({
      body: sections({}, [
        section('Components', { content: table({ columns: ['#', 'Component'] }) }),
      ]),
    })
    const { findings } = c.validate('## Components\n', ctx)
    expect(ids(findings)).toEqual(['structure/block-missing'])
    expect(findings[0]?.level).toBe('error')
  })

  test('a declared table slot filled by a list → structure/block-kind', () => {
    const c = contract({
      body: sections({}, [
        section('Components', { content: table({ columns: ['#', 'Component'] }) }),
      ]),
    })
    const source = ['## Components', '', '- a', '- b', ''].join('\n')
    const { findings } = c.validate(source, ctx)
    expect(ids(findings)).toEqual(['structure/block-kind'])
  })

  test('a correct-kind block passes the kind-gate (no structure finding)', () => {
    const c = contract({
      body: sections({}, [
        section('Components', { content: table({ columns: ['#', 'Component'] }) }),
      ]),
    })
    const source = [
      '## Components',
      '',
      '| # | Component |',
      '| - | --------- |',
      '| 1 | engine    |',
      '',
    ].join('\n')
    const { findings } = c.validate(source, ctx)
    expect(findings).toEqual([])
  })

  test('a list leaf gates list presence and kind', () => {
    const c = contract({
      body: sections({}, [section('Tasks', { content: list({ minItems: 1 }) })]),
    })
    expect(ids(c.validate('## Tasks\n\nplain prose\n', ctx).findings)).toEqual([
      'structure/block-kind',
    ])
    expect(c.validate('## Tasks\n\n- one\n', ctx).findings).toEqual([])
  })

  test('a code leaf gates code presence and kind', () => {
    const c = contract({
      body: sections({}, [section('Example', { content: code({ lang: 'ts' }) })]),
    })
    expect(ids(c.validate('## Example\n\nprose only\n', ctx).findings)).toEqual([
      'structure/block-kind',
    ])
    expect(c.validate('## Example\n\n```ts\nconst x = 1;\n```\n', ctx).findings).toEqual([])
  })

  test('a maxWords leaf gates a paragraph block (no data check here)', () => {
    const c = contract({
      body: sections({}, [section('Summary', { content: maxWords(50) })]),
    })
    // A paragraph passes the kind check. Word count belongs to the content plane and is not checked here.
    expect(c.validate('## Summary\n\nshort prose\n', ctx).findings).toEqual([])
    // A table where a paragraph is expected → wrong kind.
    const tableDoc = ['## Summary', '', '| a |', '| - |', '| 1 |', ''].join('\n')
    expect(ids(c.validate(tableDoc, ctx).findings)).toEqual(['structure/block-kind'])
  })

  test('named-content leaves gate each by anchor', () => {
    const c = contract({
      body: sections({}, [
        section('Decision', {
          content: {
            components: table({ anchor: 'components', columns: ['#'] }),
            risks: table({ anchor: 'risks', columns: ['Risk'] }),
          },
        }),
      ]),
    })
    const source = ['## Decision', '', '| # |', '| - |', '| 1 |', '^components', ''].join('\n')
    // components present; risks anchor missing → one block-missing.
    expect(ids(c.validate(source, ctx).findings)).toEqual(['structure/block-missing'])
  })
})

describe('anchors · structure/anchor-missing', () => {
  test('a declared anchor with no matching block-id → anchor-missing', () => {
    const c = contract({
      body: sections({}, [section('Summary', { anchor: 'summary' })]),
    })
    expect(ids(c.validate('## Summary\n\nprose\n', ctx).findings)).toEqual([
      'structure/anchor-missing',
    ])
  })

  test('a present block-bound anchor resolves (no finding)', () => {
    const c = contract({
      body: sections({}, [section('Summary', { anchor: 'summary' })]),
    })
    expect(c.validate('## Summary\n\nprose ^summary\n', ctx).findings).toEqual([])
  })
})

describe('build-time contract/key-collision', () => {
  test('two declared sibling names colliding in camelCase throw at construction', () => {
    expect(() =>
      contract({
        body: sections({ order: 'none', allowUnknown: true }, [
          section('Files to touch'),
          section('Files To Touch'),
        ]),
      }),
    ).toThrow(ContractBuildError)
  })

  test('distinct camelCase keys build cleanly', () => {
    expect(() =>
      contract({
        body: sections({ order: 'none', allowUnknown: true }, [
          section('Files to touch'),
          section('Files changed'),
        ]),
      }),
    ).not.toThrow()
  })

  test('alias spellings within one slot are not a collision', () => {
    expect(() =>
      sections({ order: 'none', allowUnknown: true }, [section(['Goal', 'Goal statement'])]),
    ).not.toThrow()
  })
})

describe('document-time structure/key-collision', () => {
  test('two distinct document headings collapsing to one key → key-collision', () => {
    // The contract declares neither heading; both are unknown sections under allowUnknown,
    // so the only finding is the camelCase collision between the two document headings.
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, []),
    })
    const source = ['## Files to touch', '', '## Files To Touch', ''].join('\n')
    expect(ids(c.validate(source, ctx).findings)).toEqual(['structure/key-collision'])
  })
})

describe('gap({min,max}) bounds', () => {
  const c = contract({
    body: sections({ order: 'strict', allowUnknown: false }, [
      section('Summary'),
      gap({ min: 1, max: 2 }),
      section('Sign-off'),
    ]),
  })

  test('within [min,max] passes', () => {
    const source = ['## Summary', '', '## Extra', '', '## Sign-off', ''].join('\n')
    expect(c.validate(source, ctx).findings).toEqual([])
  })

  test('below min → gap-count', () => {
    const source = ['## Summary', '', '## Sign-off', ''].join('\n')
    expect(ids(c.validate(source, ctx).findings)).toEqual(['structure/gap-count'])
  })

  test('above max → gap-count', () => {
    const source = [
      '## Summary',
      '',
      '## E1',
      '',
      '## E2',
      '',
      '## E3',
      '',
      '## Sign-off',
      '',
    ].join('\n')
    expect(ids(c.validate(source, ctx).findings)).toEqual(['structure/gap-count'])
  })
})

describe('gap({min,max}) bounds on a level that is not strict', () => {
  for (const order of ['none', 'recognized-relative'] as const) {
    const c = contract({
      body: sections({ order, allowUnknown: false }, [
        section('A'),
        gap({ min: 1, max: 1 }),
        section('B'),
      ]),
    })

    test(`${order}: one undeclared section anywhere is within bounds`, () => {
      expect(c.validate('## X\n\n## A\n\n## B\n', ctx).findings).toEqual([])
    })

    test(`${order}: every undeclared section counts, wherever it sits → gap-count`, () => {
      const { findings } = c.validate('## X\n\n## A\n\n## B\n\n## Y\n', ctx)
      expect(ids(findings)).toEqual(['structure/gap-count'])
      expect(findings[0]?.message).toBe('gap admitted 2 unknown sections; expected at most 1')
    })

    test(`${order}: no undeclared section is below min → gap-count`, () => {
      const { findings } = c.validate('## A\n\n## B\n', ctx)
      expect(ids(findings)).toEqual(['structure/gap-count'])
      expect(findings[0]?.message).toBe('gap admitted 0 unknown sections; expected at least 1')
    })
  }
})

describe('repeatable sections', () => {
  test('a declared-repeatable heading repeated as peers validates cleanly', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Entry', { repeatable: true }),
      ]),
    })
    const source = ['## Entry', '', 'a', '', '## Entry', '', 'b', '', '## Entry', '', 'c', ''].join(
      '\n',
    )
    // No structure/duplicate-section and no structure/key-collision: the repeated sections form the collection.
    expect(c.validate(source, ctx).findings).toEqual([])
  })

  test('the SAME heading repeated but NOT declared repeatable still errors', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [section('Entry')]),
    })
    const source = ['## Entry', '', 'a', '', '## Entry', '', 'b', ''].join('\n')
    expect(ids(c.validate(source, ctx).findings)).toEqual(['structure/duplicate-section'])
  })

  test('min/max — too few occurrences → structure/repeat-count', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Entry', { repeatable: true, min: 2, max: 3 }),
      ]),
    })
    const one = ['## Entry', '', 'a', ''].join('\n')
    const findings = c.validate(one, ctx).findings
    expect(ids(findings)).toEqual(['structure/repeat-count'])
    expect(findings[0]?.level).toBe('error')
    expect(findings[0]?.message).toContain('at least 2')
  })

  test('min/max — too many occurrences → structure/repeat-count (pinned at the surplus)', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Entry', { repeatable: true, min: 2, max: 3 }),
      ]),
    })
    const four = [
      '## Entry',
      '',
      '## Entry',
      '',
      '## Entry',
      '',
      '## Entry', // the 4th — one past max
      '',
    ].join('\n')
    const findings = c.validate(four, ctx).findings
    expect(ids(findings)).toEqual(['structure/repeat-count'])
    expect(findings[0]?.message).toContain('at most 3')
    expect(findings[0]?.pos?.line).toBe(7) // the 4th ## Entry
  })

  test('min/max — a count within [min,max] passes', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Entry', { repeatable: true, min: 2, max: 3 }),
      ]),
    })
    const two = ['## Entry', '', '## Entry', ''].join('\n')
    expect(c.validate(two, ctx).findings).toEqual([])
  })

  test('a required repeatable slot that is entirely absent is section-missing, not repeat-count', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [
        section('Title'),
        section('Entry', { repeatable: true, min: 2 }),
      ]),
    })
    expect(ids(c.validate('## Title\n\nx\n', ctx).findings)).toEqual(['structure/section-missing'])
  })

  test('consecutive repeats under order: strict do not misfire structure/section-order', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        section('Title'),
        section('Entry', { repeatable: true }),
        section('End'),
      ]),
    })
    const source = ['## Title', '', '## Entry', '', '## Entry', '', '## End', ''].join('\n')
    expect(c.validate(source, ctx).findings).toEqual([])
  })

  test('repeats under order: recognized-relative stay in order', () => {
    const c = contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        section('Title'),
        section('Entry', { repeatable: true }),
      ]),
    })
    const source = ['## Title', '', '## Entry', '', '## Entry', ''].join('\n')
    expect(c.validate(source, ctx).findings).toEqual([])
  })
})

describe('duplicate-section pins the later occurrence', () => {
  test('a repeated sibling heading flags the second', () => {
    const c = contract({
      body: sections({ order: 'none', allowUnknown: true }, [section('Title')]),
    })
    const source = ['## Title', '', '## Overview', '', '## Overview', ''].join('\n')
    const { findings } = c.validate(source, ctx)
    expect(ids(findings)).toEqual(['structure/duplicate-section'])
    expect(findings[0]?.pos?.line).toBe(5) // the second ## Overview
  })
})

describe('order: strict — a section whose slot the walk already passed', () => {
  test('an optional section after a later one → structure/section-order', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        optional(section('A')),
        section('B'),
      ]),
    })
    const { findings } = c.validate('## B\n\n## A\n', ctx)
    expect(ids(findings)).toEqual(['structure/section-order'])
    expect(findings[0]?.pos?.line).toBe(3)
  })

  test('a filled repeatable section repeated after a later one → structure/section-order', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        section('R', { repeatable: true }),
        section('B'),
      ]),
    })
    const { findings } = c.validate('## R\n\n## B\n\n## R\n', ctx)
    expect(ids(findings)).toEqual(['structure/section-order'])
    expect(findings[0]?.pos?.line).toBe(5)
  })

  test('a declared section after a gap is not counted toward the gap', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        optional(section('A')),
        gap({ max: 1 }),
        section('B'),
      ]),
    })
    const { findings } = c.validate('## X\n\n## A\n\n## B\n', ctx)
    expect(ids(findings)).toEqual(['structure/section-order'])
  })

  test('a required section reported on the early section is not reported twice', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: false }, [section('A'), section('B')]),
    })
    expect(ids(c.validate('## B\n\n## A\n', ctx).findings)).toEqual(['structure/section-order'])
  })

  test('a repeatable section reached past a skipped optional one may repeat', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        optional(section('A')),
        optional(section('R', { repeatable: true })),
      ]),
    })
    expect(c.validate('## R\n\n## R\n', ctx).findings).toEqual([])
  })

  test('a non-repeatable section reached past a skipped optional one, repeated → duplicate only', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        optional(section('A')),
        optional(section('B')),
      ]),
    })
    expect(ids(c.validate('## B\n\n## B\n', ctx).findings)).toEqual(['structure/duplicate-section'])
  })
})

describe('order: strict — an unknown section does not move the walk past declared slots', () => {
  test('an optional section after an unknown one, allowUnknown: true → no findings', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: true }, [
        section('A'),
        section('B'),
        optional(section('D')),
      ]),
    })
    expect(c.validate('## A\n\n## B\n\n## X\n\n## D\n', ctx).findings).toEqual([])
  })

  test('several optional sections after unknown ones, allowUnknown: true → no findings', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: true }, [
        section('A'),
        optional(section('B')),
        optional(section('C')),
        optional(section('D')),
      ]),
    })
    const source = '## A\n\n## X\n\n## B\n\n## Y\n\n## Z\n\n## D\n'
    expect(c.validate(source, ctx).findings).toEqual([])
  })

  test('a filled repeatable section repeated after an unknown one → no findings', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: true }, [
        section('A'),
        section('R', { repeatable: true }),
        optional(section('D')),
      ]),
    })
    expect(c.validate('## A\n\n## R\n\n## X\n\n## R\n\n## D\n', ctx).findings).toEqual([])
  })

  test('a required section after an unknown one, allowUnknown: true → no findings', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: true }, [
        section('A'),
        optional(section('B')),
        section('D'),
      ]),
    })
    expect(c.validate('## A\n\n## X\n\n## D\n', ctx).findings).toEqual([])
  })

  test('a declared section really out of order with unknown ones between → structure/section-order', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: true }, [
        section('A'),
        optional(section('B')),
        optional(section('D')),
      ]),
    })
    const { findings } = c.validate('## A\n\n## X\n\n## D\n\n## Y\n\n## B\n', ctx)
    expect(ids(findings)).toEqual(['structure/section-order'])
    expect(findings[0]?.pos?.line).toBe(9) // ## B
  })

  test('allowUnknown: false reports the unknown section only, not the declared one after it', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: false }, [
        section('A'),
        section('B'),
        optional(section('D')),
      ]),
    })
    const { findings } = c.validate('## A\n\n## B\n\n## X\n\n## D\n', ctx)
    expect(ids(findings)).toEqual(['structure/section-order'])
    expect(findings[0]?.pos?.line).toBe(5) // ## X
  })

  test('an unknown section still moves the walk to a gap that takes it', () => {
    const c = contract({
      body: sections({ order: 'strict', allowUnknown: true }, [
        section('A'),
        optional(section('B')),
        gap({ max: 1 }),
        section('D'),
      ]),
    })
    expect(c.validate('## A\n\n## X\n\n## D\n', ctx).findings).toEqual([])
    expect(ids(c.validate('## A\n\n## X\n\n## Y\n\n## D\n', ctx).findings)).toEqual([
      'structure/gap-count',
    ])
  })
})
