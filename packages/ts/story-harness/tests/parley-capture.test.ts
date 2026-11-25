import { describe, expect, it } from 'vitest'
import {
  figure,
  finding,
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
