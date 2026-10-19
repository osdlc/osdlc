import { describe, expect, test } from 'vitest'
import { blocksOfKind, findSection, sectionForLine, sectionSpans, sectionsAt } from './navigate.js'
import { parse } from './projection.js'

// navigate.ts holds the section-lookup primitives consumers build on `root.sections`.
// Each case parses a small document and reads back exactly what the helper returns.

const DOC = [
  '# Title', // 1
  '', // 2
  '## Operations', // 3
  '', // 4
  '| Name | Description |', // 5
  '| ---- | ----------- |', // 6
  '| foo | does foo |', // 7
  '', // 8
  '## Notes', // 9
  '', // 10
  'Some prose.', // 11
  '', // 12
  '### Sub', // 13
  '', // 14
  'nested prose', // 15
].join('\n')

describe('findSection — first matching top-level section', () => {
  const { root } = parse(DOC)

  test('finds a section by exact name', () => {
    expect(findSection(root, 'Operations')?.name).toBe('Operations')
  })

  test('depth filter restricts to that heading depth', () => {
    // "Sub" is a depth-3 subsection nested under Notes, not a top-level section.
    expect(findSection(root, 'Sub', { depth: 2 })).toBeUndefined()
    expect(findSection(root, 'Operations', { depth: 2 })?.name).toBe('Operations')
  })

  test('an alias array matches any spelling', () => {
    expect(findSection(root, ['Changelog', 'Notes'])?.name).toBe('Notes')
  })

  test('ci matches case-insensitively; without it the match is exact', () => {
    expect(findSection(root, 'operations')).toBeUndefined()
    expect(findSection(root, 'operations', { ci: true })?.name).toBe('Operations')
  })

  test('no match → undefined', () => {
    expect(findSection(root, 'Nope')).toBeUndefined()
  })
})

describe('sectionsAt — top-level sections at a depth', () => {
  test('depth 2 returns the two H2 sections', () => {
    const { root } = parse(DOC)
    expect(sectionsAt(root, 2).map((s) => s.name)).toEqual(['Operations', 'Notes'])
  })
})

describe('sectionForLine — the section enclosing a source line', () => {
  const { root } = parse(DOC)

  test('a line inside a section resolves to it', () => {
    expect(sectionForLine(root, 5)?.name).toBe('Operations') // table header line
    expect(sectionForLine(root, 11)?.name).toBe('Notes') // prose in Notes
  })

  test('a line inside a nested subsection resolves to its top-level section', () => {
    expect(sectionForLine(root, 15)?.name).toBe('Notes')
  })

  test('a line before the first section → undefined', () => {
    expect(sectionForLine(root, 1)).toBeUndefined()
  })
})

describe("sectionSpans — each section's body extent", () => {
  test('start is the line after the heading; end is the line before the next H2 (or EOF)', () => {
    const { root } = parse(DOC)
    const spans = sectionSpans(root, 15).map((s) => ({
      name: s.section.name,
      start: s.start,
      end: s.end,
    }))
    expect(spans).toEqual([
      { name: 'Operations', start: 4, end: 8 }, // Operations heading @3, next H2 @9
      { name: 'Notes', start: 10, end: 15 }, // Notes heading @9, EOF @15
    ])
  })
})

describe('blocksOfKind — narrowed block accessor', () => {
  test("returns the section's blocks of a kind (take [0] for the sole one)", () => {
    const { root } = parse(DOC)
    const ops = findSection(root, 'Operations')!
    const tables = blocksOfKind(ops, 'table')
    expect(tables).toHaveLength(1)
    expect(tables[0]!.columns).toEqual(['Name', 'Description'])
  })

  test('recursive descends subsections', () => {
    const { root } = parse(DOC)
    const notes = findSection(root, 'Notes')!
    // Non-recursive: only Notes' own paragraph; the nested Sub paragraph is not counted.
    expect(blocksOfKind(notes, 'paragraph')).toHaveLength(1)
    // Recursive: Notes' paragraph plus the Sub subsection's paragraph.
    expect(blocksOfKind(notes, 'paragraph', { recursive: true })).toHaveLength(2)
  })
})
