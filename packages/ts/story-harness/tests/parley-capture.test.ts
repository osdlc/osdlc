import { describe, expect, it } from 'vitest'
import {
  figure,
  finding,
  heading,
  idAllocator,
  parleyDocument,
  regionFromBox,
  slug,
  steps,
} from '../src/runner/parley-capture.ts'

const VIEWPORT = { width: 1000, height: 500 }
const ID = /^[a-z0-9][a-z0-9-]*$/

describe('slug', () => {
  it('makes ids parley accepts', () => {
    expect(slug('Button/Primary -- Default')).toBe('button-primary-default')
    expect(slug('  --  ')).toBe('x')
    expect(slug('', 'stop')).toBe('stop')
    for (const s of ['A.b', '9 lives', 'ünï']) expect(slug(s)).toMatch(ID)
  })
})

describe('idAllocator', () => {
  it('suffixes a repeat', () => {
    const next = idAllocator()
    expect([next('A b'), next('a-b'), next('a_b')]).toEqual(['a-b', 'a-b-2', 'a-b-3'])
  })
})

describe('regionFromBox', () => {
  it('converts pixels to fractions', () => {
    expect(
      regionFromBox({ x: 100, y: 50, w: 200, h: 100 }, VIEWPORT, { id: 'a', title: 'A' }),
    ).toEqual({
      id: 'a',
      title: 'A',
      box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    })
  })
  it('clips a box that overhangs the image', () => {
    const r = regionFromBox({ x: -50, y: 450, w: 200, h: 200 }, VIEWPORT, { id: 'a', title: 'A' })!
    expect(r.box).toEqual({ x: 0, y: 0.9, w: 0.15, h: 0.1 })
  })
  it('keeps x + w and y + h inside 1 after rounding', () => {
    for (const x of [0.3333, 333.333, 999.9, 1]) {
      const r = regionFromBox({ x, y: x / 3, w: 777.777, h: 400 }, VIEWPORT, {
        id: 'a',
        title: 'A',
      })!
      expect(r.box.x + r.box.w).toBeLessThanOrEqual(1)
      expect(r.box.y + r.box.h).toBeLessThanOrEqual(1)
      expect(r.box.w).toBeGreaterThan(0)
    }
  })
  it('has no region for a box outside the image, empty, or not finite', () => {
    const meta = { id: 'a', title: 'A' }
    expect(regionFromBox({ x: 1000, y: 0, w: 10, h: 10 }, VIEWPORT, meta)).toBeNull()
    expect(regionFromBox({ x: 0, y: 600, w: 10, h: 10 }, VIEWPORT, meta)).toBeNull()
    expect(regionFromBox({ x: 5, y: 5, w: 0, h: 10 }, VIEWPORT, meta)).toBeNull()
    expect(regionFromBox({ x: NaN, y: 5, w: 4, h: 10 }, VIEWPORT, meta)).toBeNull()
  })
  it('slugs the id and carries detail', () => {
    const r = regionFromBox({ x: 0, y: 0, w: 10, h: 10 }, VIEWPORT, {
      id: 'Stop 1',
      title: 'T',
      detail: 'd',
    })!
    expect(r.id).toBe('stop-1')
    expect(r.detail).toBe('d')
  })
})

describe('blocks', () => {
  const region = regionFromBox({ x: 0, y: 0, w: 10, h: 10 }, VIEWPORT, { id: 'r', title: 'R' })

  it('figure drops null regions and the empty list', () => {
    const f = figure({ id: 'Map', src: 'x/a.png', alt: 'a', regions: [null, region] })
    expect(f).toMatchObject({ id: 'map', type: 'figure', regions: [{ id: 'r' }] })
    expect('regions' in figure({ id: 'm', src: 'x/a.png', alt: 'a', regions: [null] })).toBe(false)
  })

  it('steps needs two frames and unique frame ids', () => {
    const frame = (id: string) => ({ id, src: `x/${id}.png`, alt: id })
    expect(() => steps({ id: 's', frames: [frame('a')] })).toThrow(/at least 2/)
    expect(() => steps({ id: 's', frames: [frame('a'), frame('A')] })).toThrow(/duplicate/)
    expect(steps({ id: 's', frames: [frame('a'), frame('b')] }).frames).toHaveLength(2)
  })

  it('finding defaults status to open and takes both evidence shapes', () => {
    const frame = (id: string) => ({ id, src: `x/${id}.png`, alt: id })
    const f = finding({
      id: 'F 1',
      ref: 'KW-1',
      summary: 's',
      severity: 'should',
      evidence: [
        { id: 'one', src: 'x/a.png', alt: 'a' },
        { id: 'many', frames: [frame('a'), frame('b')] },
      ],
    })
    expect(f.status).toBe('open')
    expect(f.evidence).toHaveLength(2)
    expect(() =>
      finding({
        id: 'f',
        ref: 'r',
        summary: 's',
        severity: 'nice',
        evidence: [{ id: 'e', frames: [frame('a')] }],
      }),
    ).toThrow()
  })

  it('parleyDocument dates itself, and refuses an empty or id-clashing document', () => {
    const f = figure({ id: 'a', src: 'x/a.png', alt: 'a' })
    const doc = parleyDocument({ id: 'Doc One', title: 't', blocks: [f] })
    expect(doc.id).toBe('doc-one')
    expect(doc.created).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(() => parleyDocument({ id: 'd', title: 't', blocks: [] })).toThrow()
    expect(() => parleyDocument({ id: 'd', title: 't', blocks: [f, f] })).toThrow(/duplicate/)
  })
})

// parley's own schema is not published where a test can read it, so this checks
// the constraints this module documents for it: ids that match the id pattern,
// unique across the document, at least two frames in a slide show, regions
// inside the image, and the enumerated words. The result also has to survive
// `JSON.stringify`, which is how a caller writes it.
describe('parleyDocument output shape', () => {
  const frame = (id: string) => ({
    id,
    src: `x/${id}.png`,
    alt: id,
    regions: [regionFromBox({ x: 10, y: 10, w: 100, h: 50 }, VIEWPORT, { id: 'r', title: 'R' })],
  })
  const doc = parleyDocument({
    id: 'Review 1',
    title: 'Review',
    summary: 's',
    keep: true,
    created: '2026-11-24',
    blocks: [
      heading({ id: 'Top', title: 'Top', level: 2 }),
      figure({ id: 'Map', src: 'x/map.png', alt: 'map', regions: [frame('a').regions[0]!, null] }),
      steps({ id: 'Walk', frames: [frame('a'), frame('b')] }),
      finding({
        id: 'F 1',
        ref: 'R-1',
        summary: 's',
        severity: 'blocker',
        evidence: [
          { id: 'one', src: 'x/a.png', alt: 'a', regions: [null] },
          { id: 'many', frames: [frame('a'), frame('b')] },
        ],
      }),
    ],
  })
  const ID = /^[a-z0-9][a-z0-9-]*$/

  const regionsOf = (item: { regions?: Array<{ id: string; box: object }> }) => item.regions ?? []

  it('uses ids parley accepts, unique among blocks', () => {
    expect(doc.id).toMatch(ID)
    const ids = doc.blocks.map((b) => b.id)
    for (const id of ids) expect(id).toMatch(ID)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries the required fields of each block type', () => {
    expect(doc.created).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    for (const block of doc.blocks) {
      if (block.type === 'heading') expect([1, 2, 3]).toContain(block.level)
      if (block.type === 'figure') expect(block.src && block.alt).toBeTruthy()
      if (block.type === 'steps') expect(block.frames.length).toBeGreaterThanOrEqual(2)
      if (block.type === 'finding') {
        expect(['blocker', 'should', 'nice']).toContain(block.severity)
        expect(['open', 'fixed', 'wontfix']).toContain(block.status)
        expect(block.ref && block.summary).toBeTruthy()
        for (const e of block.evidence ?? [])
          expect('frames' in e ? e.frames.length : e.src).toBeTruthy()
      }
    }
  })

  it('keeps every region inside the image and leaves no null in the output', () => {
    const regions = doc.blocks.flatMap((b) => {
      if (b.type === 'figure') return regionsOf(b)
      if (b.type === 'steps') return b.frames.flatMap(regionsOf)
      if (b.type === 'finding')
        return (b.evidence ?? []).flatMap((e) =>
          'frames' in e ? e.frames.flatMap(regionsOf) : regionsOf(e),
        )
      return []
    }) as Array<{ id: string; box: { x: number; y: number; w: number; h: number } }>
    expect(regions.length).toBeGreaterThan(0)
    for (const r of regions) {
      expect(r.id).toMatch(ID)
      expect(r.box.x).toBeGreaterThanOrEqual(0)
      expect(r.box.x + r.box.w).toBeLessThanOrEqual(1)
      expect(r.box.y + r.box.h).toBeLessThanOrEqual(1)
    }
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc)
  })
})
