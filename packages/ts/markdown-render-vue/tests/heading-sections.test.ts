/**
 * `groupHeadingSections`, tested in isolation: pure data in, pure data out,
 * no DOM and no Vue.
 */

import { describe, expect, test } from 'vitest'
import { groupHeadingSections } from '../src/heading-sections.ts'
import type { HastNode } from '../src/render.ts'

function heading(depth: number, text: string): HastNode {
  return {
    type: 'element',
    tagName: `h${depth}`,
    properties: { id: text.toLowerCase() },
    children: [{ type: 'text', value: text }],
  }
}

function p(text: string): HastNode {
  return {
    type: 'element',
    tagName: 'p',
    properties: {},
    children: [{ type: 'text', value: text }],
  }
}

describe('groupHeadingSections', () => {
  test('no headings: one leading segment holding everything', () => {
    const children = [p('a'), p('b')]
    expect(groupHeadingSections(children)).toEqual([{ body: children }])
  })

  test('empty input: no segments at all', () => {
    expect(groupHeadingSections([])).toEqual([])
  })

  test('a heading with no leading content: one segment, no leading one', () => {
    const h1 = heading(1, 'Title')
    const para = p('body')
    expect(groupHeadingSections([h1, para])).toEqual([{ heading: h1, depth: 1, body: [para] }])
  })

  test('content before the first heading becomes a leading segment', () => {
    const lead = p('intro')
    const h1 = heading(1, 'Title')
    const para = p('body')
    expect(groupHeadingSections([lead, h1, para])).toEqual([
      { body: [lead] },
      { heading: h1, depth: 1, body: [para] },
    ])
  })

  test('two headings of the same depth are sibling segments, not nested', () => {
    const h1a = heading(2, 'A')
    const pa = p('a-body')
    const h1b = heading(2, 'B')
    const pb = p('b-body')
    expect(groupHeadingSections([h1a, pa, h1b, pb])).toEqual([
      { heading: h1a, depth: 2, body: [pa] },
      { heading: h1b, depth: 2, body: [pb] },
    ])
  })

  test('a deeper heading is absorbed into the still-open shallower section', () => {
    const h1 = heading(1, 'One')
    const pa = p('a')
    const h2 = heading(2, 'Two')
    const pb = p('b')
    // The H2 and everything under it are inside H1's body as plain nodes —
    // one level of grouping does not split them out on their own.
    expect(groupHeadingSections([h1, pa, h2, pb])).toEqual([
      { heading: h1, depth: 1, body: [pa, h2, pb] },
    ])
  })

  test('a same-or-shallower heading ends an open section even after deeper ones', () => {
    const h1 = heading(1, 'One')
    const h2 = heading(2, 'Two')
    const h3 = heading(3, 'Three')
    const h2b = heading(2, 'Two B')
    const h1b = heading(1, 'One B')
    // Only a heading whose depth is <= the OPEN section's depth closes it.
    // H1 is open at depth 1, so H2, H3 and H2B all absorb into its body; H1B
    // is the first heading shallow enough to end it.
    expect(groupHeadingSections([h1, h2, h3, h2b, h1b])).toEqual([
      { heading: h1, depth: 1, body: [h2, h3, h2b] },
      { heading: h1b, depth: 1, body: [] },
    ])
  })

  test('a heading with an empty body still gets its own segment', () => {
    const h1 = heading(1, 'One')
    const h2 = heading(1, 'Two')
    expect(groupHeadingSections([h1, h2])).toEqual([
      { heading: h1, depth: 1, body: [] },
      { heading: h2, depth: 1, body: [] },
    ])
  })

  test('re-grouping a section body recovers one nested level at a time', () => {
    const h1 = heading(1, 'One')
    const pa = p('a')
    const h2 = heading(2, 'Two')
    const pb = p('b')
    const [outer] = groupHeadingSections([h1, pa, h2, pb])
    expect(outer!.body).toEqual([pa, h2, pb])
    // The render layer calls this again on `body` to find H2 and give it its
    // own fold toggle — exactly this second pass.
    expect(groupHeadingSections(outer!.body)).toEqual([
      { body: [pa] },
      { heading: h2, depth: 2, body: [pb] },
    ])
  })

  test('depths 1 through 6 are all recognised as headings', () => {
    for (let depth = 1; depth <= 6; depth += 1) {
      const h = heading(depth, `H${depth}`)
      expect(groupHeadingSections([h])).toEqual([{ heading: h, depth, body: [] }])
    }
  })

  test('a text node with no tagName never opens a section', () => {
    const text: HastNode = { type: 'text', value: 'loose text' }
    expect(groupHeadingSections([text])).toEqual([{ body: [text] }])
  })
})
