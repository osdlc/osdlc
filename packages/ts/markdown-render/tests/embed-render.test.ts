import { describe, expect, test } from 'vitest'
import {
  embedAlt,
  embedBlocker,
  embedMedia,
  embedPlaceholder,
  embedSize,
  MAX_EMBED_DEPTH,
} from '../src/plugins/index.ts'

describe('embed rendering rules shared by every host', () => {
  test('a numeric display is a size, not a label', () => {
    expect(embedSize('300')).toEqual({ width: 300 })
    expect(embedSize('300x200')).toEqual({ width: 300, height: 200 })
    expect(embedSize('Caption|300')).toEqual({ width: 300 })
    expect(embedSize('Caption|300x200')).toEqual({ width: 300, height: 200 })
    expect(embedSize('Caption')).toBeUndefined()
    expect(embedSize('300|Caption')).toBeUndefined()
    expect(embedSize(undefined)).toBeUndefined()
  })

  test('alt text is the display unless it is a size, else the target', () => {
    expect(embedAlt('a.png', 'A caption')).toBe('A caption')
    expect(embedAlt('a.png', '300')).toBe('a.png')
    expect(embedAlt('a.png', undefined)).toBe('a.png')
    expect(embedAlt('a.png', 'A caption|300')).toBe('A caption')
    expect(embedAlt('a.png', 'A|b')).toBe('A|b')
  })

  test('the guards run in order: missing, cycle, depth, budget', () => {
    const deep = Array.from({ length: MAX_EMBED_DEPTH }, (_, i) => `n${i}`)
    expect(embedBlocker(undefined, ['n0'], false)).toBe('missing')
    expect(embedBlocker('n0', deep, false)).toBe('cycle')
    expect(embedBlocker('x', deep, false)).toBe('too-deep')
    expect(embedBlocker('x', deep.slice(1), false)).toBe('over-budget')
    expect(embedBlocker('x', deep.slice(1), true)).toBeNull()
  })

  test('each placeholder names its state and target', () => {
    const missing = embedPlaceholder('missing-attachment', 'a.mp4')
    expect(missing.properties).toEqual({
      className: ['markdown-embed', 'markdown-embed-missing'],
      dataEmbedTarget: 'a.mp4',
    })
    expect(missing.children).toEqual([{ type: 'text', value: 'Missing attachment: a.mp4' }])
    expect(embedPlaceholder('too-deep', 'n').children).toEqual([
      { type: 'text', value: `Embed nested deeper than ${MAX_EMBED_DEPTH}` },
    ])
  })

  test('each media kind gets its element', () => {
    expect(embedMedia('video', '/v.mp4', 'v.mp4', '300').properties).toMatchObject({
      src: '/v.mp4',
      controls: true,
      width: 300,
    })
    expect(embedMedia('audio', '/s.mp3', 's.mp3', undefined).tagName).toBe('audio')
    const pdf = embedMedia('pdf', '/d.pdf', 'd.pdf', 'Spec')
    expect(pdf.tagName).toBe('a')
    expect(pdf.properties).toMatchObject({ href: '/d.pdf', target: '_blank' })
    expect(pdf.children).toEqual([{ type: 'text', value: 'Spec' }])
    expect(
      embedMedia('pdf', '/d.pdf', 'd.pdf', undefined, { fragment: 'page=3' }).properties.href,
    ).toBe('/d.pdf#page=3')
    // Only a page number rides along; any other fragment is dropped.
    expect(
      embedMedia('pdf', '/d.pdf', 'd.pdf', undefined, { fragment: 'Intro' }).properties.href,
    ).toBe('/d.pdf')
    expect(embedMedia('image', '/p.png', 'p.png', '300x200').properties).toMatchObject({
      alt: 'p.png',
      width: 300,
      height: 200,
    })
  })
})
