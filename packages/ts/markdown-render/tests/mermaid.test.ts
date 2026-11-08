/**
 * The framework-free mermaid seam, over a fake module: initialize once per
 * theme, one id sequence, the module loaded once, and errors left to the
 * caller. No DOM and no real mermaid.
 */

import { describe, expect, test } from 'vitest'
import GithubSlugger from 'github-slugger'
import { createMermaidRenderer, renderMermaid, type MermaidLike } from '../src/mermaid.ts'
import { BLOCK_ID_RE } from '../src/plugins/block-ids.ts'

interface FakeMermaid extends MermaidLike {
  initializeCalls: object[]
  renderCalls: { id: string; source: string }[]
}

function fakeMermaid(): FakeMermaid {
  const fake: FakeMermaid = {
    initializeCalls: [],
    renderCalls: [],
    initialize(config) {
      fake.initializeCalls.push(config)
    },
    async render(id, source) {
      fake.renderCalls.push({ id, source })
      return { svg: `<svg data-id="${id}"/>` }
    },
  }
  return fake
}

function fakeLoader(fake = fakeMermaid()) {
  let loads = 0
  const load = async (): Promise<MermaidLike> => {
    loads++
    return fake
  }
  return { fake, load, loads: () => loads }
}

function idNumber(id: string): number {
  const m = /^markdownRender_mermaid-(\d+)$/.exec(id)
  if (!m) throw new Error(`unexpected mermaid id: ${id}`)
  return Number(m[1])
}

describe('createMermaidRenderer', () => {
  test('initializes once per theme, `default` when the theme is omitted', async () => {
    const { fake, load } = fakeLoader()
    const render = createMermaidRenderer(load)

    await render('graph TD; a-->b')
    await render('graph TD; b-->c')
    expect(fake.initializeCalls).toEqual([
      {
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
        suppressErrorRendering: true,
      },
    ])

    await render('graph TD; c-->d', 'dark')
    await render('graph TD; d-->e', 'dark')
    expect(fake.initializeCalls).toEqual([
      {
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
        suppressErrorRendering: true,
      },
      { startOnLoad: false, theme: 'dark', securityLevel: 'strict', suppressErrorRendering: true },
    ])

    // Switching back is a real instruction again.
    await render('graph TD; e-->f', 'default')
    expect(fake.initializeCalls).toHaveLength(3)
  })

  // mermaid's default is already `strict`, but `initialize` merges into one
  // module-global config that anything else on the page can have set first.
  // Every initialize this renderer makes states the level, so a diagram is
  // sanitized because this code said so rather than because nothing else spoke.
  test('every initialize pins securityLevel strict, whatever the theme', async () => {
    const { fake, load } = fakeLoader()
    const render = createMermaidRenderer(load)

    await render('graph TD; a-->b')
    await render('graph TD; c-->d', 'dark')
    await render('graph TD; e-->f', 'forest')

    expect(fake.initializeCalls).toHaveLength(3)
    for (const call of fake.initializeCalls) {
      expect(call).toMatchObject({ securityLevel: 'strict' })
    }
  })

  test('mints unique, strictly increasing ids and passes the source through', async () => {
    const { fake, load } = fakeLoader()
    const render = createMermaidRenderer(load)

    for (let i = 0; i < 5; i++) await render(`graph TD; n${i}`)

    const ids = fake.renderCalls.map((c) => idNumber(c.id))
    expect(new Set(ids).size).toBe(5)
    expect(ids.every((n, i) => i === 0 || n > (ids[i - 1] as number))).toBe(true)
    expect(fake.renderCalls.map((c) => c.source)).toEqual([
      'graph TD; n0',
      'graph TD; n1',
      'graph TD; n2',
      'graph TD; n3',
      'graph TD; n4',
    ])
  })

  // mermaid removes any element in the document holding its id, `d` + id or
  // `i` + id before it draws. None may be an id the pipeline puts on the page.
  test('mints ids no heading slug or block id can spell', async () => {
    const { fake, load } = fakeLoader()
    const render = createMermaidRenderer(load)

    for (let i = 0; i < 3; i++) await render(`graph TD; n${i}`)

    for (const { id } of fake.renderCalls) {
      for (const used of [id, `d${id}`, `i${id}`]) {
        expect(new GithubSlugger().slug(used)).not.toBe(used)
        expect(BLOCK_ID_RE.exec(`text ^${used}`)?.[1]).not.toBe(used)
      }
    }
  })

  test('resolves to the svg mermaid produced', async () => {
    const { fake, load } = fakeLoader()
    const render = createMermaidRenderer(load)

    const svg = await render('graph TD; a-->b')

    expect(svg).toBe(`<svg data-id="${fake.renderCalls[0]?.id}"/>`)
    expect(svg).toMatch(/^<svg data-id="markdownRender_mermaid-\d+"\/>$/)
  })

  test('a mermaid error rejects — the fallback is the caller’s call — and the renderer stays usable', async () => {
    const fake = fakeMermaid()
    const good = fake.render
    fake.render = async () => {
      throw new Error('Parse error on line 1')
    }
    const render = createMermaidRenderer(async () => fake)

    await expect(render('bad')).rejects.toThrow('Parse error on line 1')

    fake.render = good
    await expect(render('graph TD; a-->b')).resolves.toMatch(/^<svg/)
  })

  test('a failed module load is not cached \u2014 the next render retries', async () => {
    const fake = fakeMermaid()
    let loads = 0
    const render = createMermaidRenderer(async () => {
      if (++loads === 1) throw new Error('chunk load failed')
      return fake
    })

    await expect(render('graph TD; a-->b')).rejects.toThrow('chunk load failed')
    await expect(render('graph TD; a-->b')).resolves.toMatch(/^<svg/)
    expect(loads).toBe(2)
    expect(fake.renderCalls).toHaveLength(1)
  })

  test('loads the module once per renderer, even under concurrent renders', async () => {
    const { fake, load, loads } = fakeLoader()
    const render = createMermaidRenderer(load)

    await Promise.all([render('a'), render('b'), render('c')])
    await render('d')

    expect(loads()).toBe(1)
    expect(fake.initializeCalls).toHaveLength(1)
    expect(fake.renderCalls).toHaveLength(4)
  })

  test('renderers over different loaders keep their own init guard and id sequence', async () => {
    const a = fakeLoader()
    const b = fakeLoader()
    const renderA = createMermaidRenderer(a.load)
    const renderB = createMermaidRenderer(b.load)

    await renderA('x', 'dark')
    await renderA('y', 'dark')
    await renderB('z', 'dark')

    // B did not inherit A's guard: its own module still had to be initialized.
    expect(a.fake.initializeCalls).toEqual([
      { startOnLoad: false, theme: 'dark', securityLevel: 'strict', suppressErrorRendering: true },
    ])
    expect(b.fake.initializeCalls).toEqual([
      { startOnLoad: false, theme: 'dark', securityLevel: 'strict', suppressErrorRendering: true },
    ])
    // Each sequence starts at 1.
    expect(a.fake.renderCalls.map((c) => c.id)).toEqual([
      'markdownRender_mermaid-1',
      'markdownRender_mermaid-2',
    ])
    expect(b.fake.renderCalls.map((c) => c.id)).toEqual(['markdownRender_mermaid-1'])
    expect(a.loads()).toBe(1)
    expect(b.loads()).toBe(1)
  })
})

describe('renderMermaid', () => {
  test('is importable without loading mermaid', () => {
    expect(typeof renderMermaid).toBe('function')
  })
})
