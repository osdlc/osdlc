// @vitest-environment jsdom
/**
 * Component-level tests, mounted against jsdom (environment set by the
 * `@vitest-environment` docblock). These cover the interactive contract the app depends on:
 * routing, event emission, embed loading, cycle/depth guards.
 *
 * Mermaid's real drawing is not covered here: it lazily imports a heavy
 * library with its own DOM expectations, and the app layer verifies it. The
 * `MermaidBlock` contract (source in, svg or fallback out) is covered over a
 * fake renderer. KaTeX is covered, because its accessible output is a
 * contract this package owns and `renderToString` is a pure string function
 * that jsdom is enough for.
 */

import { markdownVue, vue } from './setup-dom.ts'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import type { App } from 'vue'
import type { NoteSource } from '../src/context.ts'
import type { LinkResolution } from '@osdlc/markdown-render'
import type * as MermaidSeam from '@osdlc/markdown-render'

const { createApp, defineComponent, h, provide, ref } = vue
const {
  MarkdownRender,
  MermaidBlock,
  provideNoteSource,
  MAX_EMBED_DEPTH,
  MAX_EMBEDS_PER_DOCUMENT,
} = markdownVue
// The budget key is internal to the package: a host cannot provide its own.
const { EmbedBudgetKey } = await import('../src/context.ts')

// `renderMermaid` caches the mermaid module on first use, so mocking the
// `mermaid` package here would be too late once a fence has drawn. Mocking the
// seam module instead swaps `MermaidBlock`'s binding. The fake delegates to the real
// renderer until the `MermaidBlock` suite switches it on, so no other test in
// this file sees it.
let fakeMermaidOn = false
/**
 * While set, every fake render parks here instead of resolving, so a test can
 * finish two renders in the wrong order on purpose.
 */
let parkedRenders: Array<{ source: string; finish: (svg: string) => void }> | null = null
const fakeRenderMermaid: typeof MermaidSeam.renderMermaid = async (source, theme) => {
  if (!fakeMermaidOn) {
    const real = await vi.importActual<typeof MermaidSeam>('@osdlc/markdown-render')
    return real.renderMermaid(source, theme)
  }
  if (parkedRenders) {
    const parked = parkedRenders
    return new Promise<string>((resolve) => parked.push({ source, finish: resolve }))
  }
  if (source.includes('BROKEN')) throw new Error('parse error')
  return `<svg data-source="${source}" data-theme="${theme}"></svg>`
}
vi.mock('@osdlc/markdown-render', async (importOriginal) => ({
  ...(await importOriginal<typeof MermaidSeam>()),
  // Looked up per call: the factory runs before the module body defines the fake.
  renderMermaid: (source: string, theme?: string) => fakeRenderMermaid(source, theme),
}))

const FAN_OUT = 7

const NOTES: Record<string, string> = {
  '/vault/Note': '# Note Title\n\nNote body.\n\n## Section\n\nSection body. ^blk',
  '/vault/Loop': 'Loop start.\n\n![[Loop]]',
  '/vault/A': 'A body.\n\n![[B]]',
  '/vault/B': 'B body.\n\n![[A]]',
  // A chain that fans out rather than nesting deeply: N^D transclusions, all
  // of them inside MAX_EMBED_DEPTH.
  '/vault/Wide': '![[Wide2]]\n\n'.repeat(FAN_OUT),
  '/vault/Wide2': '![[Wide3]]\n\n'.repeat(FAN_OUT),
  '/vault/Wide3': '![[Wide4]]\n\n'.repeat(FAN_OUT),
  '/vault/Wide4': 'leaf\n',
  '/vault/Leaf': 'Leaf body.',
  // A chain deep enough to reach MAX_EMBED_DEPTH, one embed per level.
  '/vault/N1': '![[N2]]',
  '/vault/N2': '![[N3]]',
  '/vault/N3': '![[N4]]',
  '/vault/N4': '![[N5]]',
  '/vault/N5': '![[N6]]',
  '/vault/N6': 'N6 body.',
}

/** Every path the render actually asked the vault for. */
let loaded: string[] = []

function resolveLink(target: string): LinkResolution {
  const path = `/vault/${target}`
  const display = target.split('/').pop() ?? target
  if (/\.(png|jpg|svg)$/i.test(target)) return { kind: 'attachment', path, display }
  if (!(path in NOTES)) return { kind: 'missing', display }
  return { kind: 'note', path, display }
}

/** Every `assetUrl` call, so a test can assert the `fromPath` contract. */
const assetCalls: Array<[string, string | undefined]> = []

const noteSource: NoteSource = {
  resolveLink,
  async loadNote(path) {
    loaded.push(path)
    const body = NOTES[path]
    return body === undefined ? null : { body }
  },
  assetUrl(target, fromPath) {
    assetCalls.push([target, fromPath])
    return `/assets/${target}`
  },
}

let app: App | null = null

afterEach(() => {
  app?.unmount()
  app = null
  loaded = []
})

/** Mount `<MarkdownRender>` under a `NoteSource` and wait for the render. */
async function mount(
  props: Record<string, unknown>,
  listeners: Record<string, unknown> = {},
): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const Wrapper = defineComponent({
    setup() {
      provideNoteSource(noteSource)
      return () => h(MarkdownRender, { ...props, ...listeners } as never)
    },
  })
  app = createApp(Wrapper)
  app.mount(host)
  await settle(host)
  return host
}

/**
 * Poll until `check` holds, rather than draining a fixed number of ticks: how
 * many rounds a nested embed chain needs is whatever the machine says today.
 */
/**
 * Polls `check` until it holds or `ms` of wall-clock time pass. The deadline is in time, not
 * polls, because a loaded runner stretches each 2 ms sleep; on timeout the error carries the DOM.
 */
async function waitFor(check: () => boolean, what: string, ms = 4000): Promise<void> {
  const deadline = performance.now() + ms
  while (performance.now() < deadline) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  if (check()) return
  throw new Error(
    `timed out after ${ms} ms waiting for ${what}; body: ${document.body.innerHTML.slice(0, 2000)}`,
  )
}

/** Wait for the asynchronous pipeline (and any nested embeds) to land. */
async function settle(host: HTMLElement, ticks = 40): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1))
    if (host.querySelector('.markdown-render')?.childNodes.length) break
  }
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 2))
}

describe('MarkdownRender', () => {
  test('renders the dialect into real DOM elements', async () => {
    const host = await mount({ source: '# Title\n\n[[Note]] and #tag and ==hi==' })
    expect(host.querySelector('h1')?.textContent).toBe('Title')
    expect(host.querySelector('a.wikilink')?.getAttribute('data-wikilink')).toBe('Note')
    expect(host.querySelector('a.tag')?.getAttribute('data-tag')).toBe('tag')
    expect(host.querySelector('mark')?.textContent).toBe('hi')
  })

  test('a wikilink click is intercepted and emitted, not navigated', async () => {
    const seen: Array<{ resolution: { target: string; kind: string } }> = []
    const host = await mount(
      { source: '[[Note]]' },
      { onLinkClick: (payload: never) => seen.push(payload) },
    )
    const anchor = host.querySelector('a.wikilink') as HTMLElement
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.resolution.target).toBe('Note')
    expect(seen[0]!.resolution.kind).toBe('note')
  })

  test('a tag click emits the tag name', async () => {
    const seen: string[] = []
    const host = await mount(
      { source: 'about #project/alpha' },
      { onTagClick: (tag: string) => seen.push(tag) },
    )
    ;(host.querySelector('a.tag') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    expect(seen).toEqual(['project/alpha'])
  })

  test('a task checkbox is live and reports its source line', async () => {
    const seen: Array<{ line: number; checked: boolean }> = []
    const host = await mount(
      { source: 'intro\n\n- [ ] first\n- [x] second' },
      { onTaskToggle: (payload: never) => seen.push(payload) },
    )
    const boxes = host.querySelectorAll('input[type=checkbox]')
    expect(boxes).toHaveLength(2)
    expect((boxes[0] as HTMLInputElement).disabled).toBe(false)
    ;(boxes[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(seen).toEqual([{ line: 3, checked: true }])
  })

  test('a renderer a host component mounts inside another keeps live checkboxes', async () => {
    // Only a transclusion keeps `task-toggle` from its host. A host's own
    // component that mounts a second renderer and listens to it is a real
    // host, so its checkboxes must still be live and report.
    const seen: Array<{ line: number; checked: boolean }> = []
    const Panel = defineComponent({
      props: { node: { type: Object, required: true } },
      setup: () => () =>
        h(MarkdownRender, {
          source: '- [ ] panel task',
          onTaskToggle: (payload: { line: number; checked: boolean }) => seen.push(payload),
        } as never),
    })
    const host = await mount({
      source: '> quoted',
      notePath: '/vault/Host',
      components: { blockquote: Panel },
    })
    await waitFor(() => host.querySelector('input[type=checkbox]') !== null, 'the panel’s checkbox')
    const box = host.querySelector('input[type=checkbox]') as HTMLInputElement
    expect(box.disabled).toBe(false)
    box.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(seen).toEqual([{ line: 1, checked: true }])
  })

  test('the rendered event carries the outline', async () => {
    const seen: Array<{ outline: Array<{ id: string }> }> = []
    await mount(
      { source: '# One\n\n## Two' },
      { onRendered: (payload: never) => seen.push(payload) },
    )
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.at(-1)?.outline.map((entry) => entry.id)).toEqual(['one', 'two'])
  })

  test('a foldable callout collapses and expands', async () => {
    const host = await mount({ source: '> [!warning]- Careful\n> secret body' })
    const callout = host.querySelector('.callout') as HTMLElement
    expect(callout.className).toContain('is-collapsed')
    expect(host.querySelector('.callout-content')).toBeNull()
    ;(host.querySelector('.callout-fold-toggle') as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await new Promise((resolve) => setTimeout(resolve, 2))
    expect(host.querySelector('.callout-content')?.textContent).toContain('secret body')
  })

  test('a link in a foldable callout title does not fold it, and sits outside the button', async () => {
    const host = await mount({ source: '> [!note]+ See [docs](https://example.com)\n> body' })
    const link = host.querySelector('.callout a') as HTMLElement
    expect(link).not.toBeNull()
    expect(host.querySelector('button a')).toBeNull()
    link.addEventListener('click', (e) => e.preventDefault())
    link.click()
    await new Promise((resolve) => setTimeout(resolve, 2))
    expect(host.querySelector('.callout-content')?.textContent).toContain('body')
    expect(host.querySelector('.callout')?.className).toContain('is-open')

    // The rest of the title row, and the button, still fold it.
    ;(host.querySelector('.callout-fold-toggle') as HTMLElement).click()
    await new Promise((resolve) => setTimeout(resolve, 2))
    expect(host.querySelector('.callout-content')).toBeNull()
  })

  test('a foldable callout re-reads its fold marker when the source changes', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const source = ref('> [!note]+ Alpha\n> alpha body')
    const Wrapper = defineComponent({
      setup() {
        provideNoteSource(noteSource)
        return () => h(MarkdownRender, { source: source.value } as never)
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await settle(host)
    expect((host.querySelector('.callout') as HTMLElement).className).toContain('is-open')

    source.value = '> [!note]- Alpha\n> alpha body'
    await settle(host)
    expect((host.querySelector('.callout') as HTMLElement).className).toContain('is-collapsed')
    expect(host.querySelector('.callout-content')).toBeNull()
  })

  test('a swapped-in callout is seeded from its own marker, not the toggle', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const source = ref('> [!note]- Alpha\n> alpha body')
    const Wrapper = defineComponent({
      setup() {
        provideNoteSource(noteSource)
        return () => h(MarkdownRender, { source: source.value } as never)
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await settle(host)
    expect((host.querySelector('.callout') as HTMLElement).className).toContain('is-collapsed')

    // Reader opens it, then the source swaps in a *different* callout that
    // happens to carry the same `-` marker: the new source wins.
    ;(host.querySelector('.callout-fold-toggle') as HTMLElement).click()
    await settle(host)
    expect((host.querySelector('.callout') as HTMLElement).className).toContain('is-open')

    source.value = '> [!warning]- Beta\n> beta body'
    await settle(host)
    expect(host.querySelector('.callout')?.getAttribute('data-callout')).toBe('warning')
    expect((host.querySelector('.callout') as HTMLElement).className).toContain('is-collapsed')
    expect(host.querySelector('.callout-content')).toBeNull()
  })

  test('a reader-opened callout stays open across an options-only re-render', async () => {
    // A host redraw (MdViewer's redrawTick: an asset landed) hands down a new
    // `options` object with the source unchanged. That re-runs the pipeline and
    // builds a fresh hast tree, but nothing about the callout changed.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const options = ref<Record<string, unknown>>({})
    let renders = 0
    const Wrapper = defineComponent({
      setup() {
        provideNoteSource(noteSource)
        return () =>
          h(MarkdownRender, {
            source: '> [!note]- Title\n> hidden body',
            options: options.value,
            onRendered: () => renders++,
          } as never)
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await waitFor(() => renders === 1, 'the first render')
    ;(host.querySelector('.callout-fold-toggle') as HTMLElement).click()
    await waitFor(
      () => (host.querySelector('.callout') as HTMLElement).className.includes('is-open'),
      'the callout to open',
    )

    options.value = {}
    await waitFor(() => renders === 2, 'the options-only re-render')
    expect((host.querySelector('.callout') as HTMLElement).className).toContain('is-open')
    expect(host.querySelector('.callout-content')?.textContent).toContain('hidden body')
  })

  test('a reader-opened callout stays open when a resolution change re-kinds a link in it', async () => {
    // A host redraw after a resolution change re-runs the pipeline with the
    // source unchanged: the link in the callout goes from missing to found.
    // Its label is source text, so nothing about the callout's source moved.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const found = ref(false)
    let renders = 0
    const Wrapper = defineComponent({
      setup() {
        provideNoteSource(noteSource)
        return () => {
          // Read here, so the flip re-renders the host with a new resolver.
          const isFound = found.value
          return h(MarkdownRender, {
            source: '> [!note]- Title\n> see [[Page]]',
            options: {
              resolveLink: (target: string) =>
                isFound ? { kind: 'note', path: target } : { kind: 'missing' },
            },
            onRendered: () => renders++,
          } as never)
        }
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await waitFor(() => renders === 1, 'the first render')
    ;(host.querySelector('.callout-fold-toggle') as HTMLElement).click()
    await waitFor(
      () => (host.querySelector('.callout') as HTMLElement).className.includes('is-open'),
      'the callout to open',
    )
    expect(host.querySelector('.callout-content a.wikilink-missing')).not.toBeNull()

    found.value = true
    await waitFor(() => renders === 2, 'the re-resolved render')
    await waitFor(
      () => host.querySelector('.callout-content a.wikilink:not(.wikilink-missing)') !== null,
      'the link to resolve',
    )
    expect((host.querySelector('.callout') as HTMLElement).className).toContain('is-open')
  })

  test('an edit to a callout’s body re-seeds it from its marker', async () => {
    // Only a re-run that leaves the callout as it was keeps the reader's
    // toggle. A body edit is an edit, and the source says how it starts.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const source = ref('> [!note]- Title\n> hidden body')
    let renders = 0
    const Wrapper = defineComponent({
      setup() {
        provideNoteSource(noteSource)
        return () =>
          h(MarkdownRender, { source: source.value, onRendered: () => renders++ } as never)
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await waitFor(() => renders === 1, 'the first render')
    ;(host.querySelector('.callout-fold-toggle') as HTMLElement).click()
    await waitFor(
      () => (host.querySelector('.callout') as HTMLElement).className.includes('is-open'),
      'the callout to open',
    )

    source.value = '> [!note]- Title\n> edited body'
    await waitFor(() => renders === 2, 'the edited render')
    expect((host.querySelector('.callout') as HTMLElement).className).toContain('is-collapsed')
    expect(host.querySelector('.callout-content')).toBeNull()
  })

  test('a non-foldable callout renders its content immediately', async () => {
    const host = await mount({ source: '> [!note] Title\n> body' })
    expect(host.querySelector('.callout-content')?.textContent).toContain('body')
    expect(host.querySelector('.callout-fold-toggle')).toBeNull()
  })

  test('the components prop claims a fence language', async () => {
    const BaseBlock = defineComponent({
      name: 'BaseBlock',
      props: { node: { type: Object, required: true } },
      setup: () => () => h('div', { class: 'base-block' }, 'claimed'),
    })
    const host = await mount({
      source: '```base\nfilters: {}\n```',
      components: { 'lang:base': BaseBlock },
    })
    expect(host.querySelector('.base-block')?.textContent).toBe('claimed')
    expect(host.querySelector('pre')).toBeNull()
  })

  test('the components prop overrides a built-in', async () => {
    const Plain = defineComponent({
      name: 'Plain',
      props: { node: { type: Object, required: true } },
      setup: () => () => h('span', { class: 'plain-link' }, 'x'),
    })
    const host = await mount({
      source: '[[Note]]',
      components: { 'a.wikilink': Plain },
    })
    expect(host.querySelector('.plain-link')).not.toBeNull()
    expect(host.querySelector('a.wikilink')).toBeNull()
  })
})

describe('MathBlock and MathInline', () => {
  // These are the tests that print "KaTeX doesn't work in quirks mode". KaTeX
  // reads `document.compatMode`, jsdom does not implement it, and no
  // doctype makes it appear — a property of the test DOM, not of the output
  // being asserted below.

  // KaTeX is imported lazily on first render, so the generic `settle` (which
  // stops as soon as the pipeline has produced *some* DOM) can return before
  // the equation exists. Wait for KaTeX's own output instead.
  async function settleMath(host: HTMLElement, ticks = 200): Promise<Element> {
    for (let i = 0; i < ticks; i++) {
      const katex = host.querySelector('.katex')
      if (katex) return katex
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error(`KaTeX never rendered; markup was: ${host.innerHTML.slice(0, 400)}`)
  }

  /**
   * The accessibility contract of `output: 'htmlAndMathml'`, asserted the same
   * way for both modes: a MathML twin carrying the TeX source, and a visual
   * copy that assistive tech is told to skip.
   */
  function expectAccessibleMath(katex: Element, latex: string): void {
    const mathml = katex.querySelector('.katex-mathml')
    expect(mathml).not.toBeNull()
    expect(mathml!.querySelector('math')).not.toBeNull()

    const annotation = mathml!.querySelector('annotation[encoding="application/x-tex"]')
    expect(annotation).not.toBeNull()
    expect(annotation!.textContent).toBe(latex)

    // The span-positioned copy spells the equation to an eye and gibberish to a
    // screen reader, so it must be hidden from the accessibility tree — the
    // half of the contract that keeps the MathML from being read twice.
    const visual = katex.querySelector('.katex-html')
    expect(visual).not.toBeNull()
    expect(visual!.getAttribute('aria-hidden')).toBe('true')
  }

  test('inline math renders MathML beside an aria-hidden visual copy', async () => {
    const host = await mount({
      source: 'Euler: $e^{i\\pi} + 1 = 0$, quoted everywhere.',
      options: { math: true },
    })
    const inline = host.querySelector('.markdown-math-inline')
    expect(inline).not.toBeNull()
    expectAccessibleMath(await settleMath(host), 'e^{i\\pi} + 1 = 0')
  })

  test('display math renders MathML beside an aria-hidden visual copy', async () => {
    const host = await mount({
      source: '$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$',
      options: { math: true },
    })
    const block = host.querySelector('.markdown-math-block')
    expect(block).not.toBeNull()
    expectAccessibleMath(await settleMath(host), '\\int_0^1 x^2 \\, dx = \\frac{1}{3}')
  })

  test('the equation is announced once, not twice', async () => {
    // Both copies inside one `.katex`: if the visual one ever loses its
    // `aria-hidden`, a screen reader reads the equation and then reads a
    // stream of loose glyphs. One MathML root, one hidden HTML sibling.
    const host = await mount({ source: '$a^2 + b^2 = c^2$', options: { math: true } })
    await settleMath(host)
    expect(host.querySelectorAll('.katex-mathml')).toHaveLength(1)
    expect(host.querySelectorAll('.katex-html:not([aria-hidden="true"])')).toHaveLength(0)
  })

  test('a math fence keeps its block id, so [[#^id]] has a target', async () => {
    const host = await mount({ source: '```math\nx^2\n```\n^eq1', options: { math: true } })
    await settleMath(host)
    const block = host.querySelector('.markdown-math-block')!
    expect(block.id).toBe('eq1')
    expect(block.getAttribute('data-block-id')).toBe('eq1')
  })
})

describe('Embed', () => {
  test('a note embed loads and renders the target', async () => {
    const host = await mount({ source: '![[Note]]', notePath: '/vault/Host' })
    expect(host.querySelector('.markdown-embed-note')?.textContent).toContain('Note body.')
  })

  test('a heading embed renders only that section', async () => {
    const host = await mount({ source: '![[Note#Section]]', notePath: '/vault/Host' })
    const text = host.querySelector('.markdown-embed-note')?.textContent ?? ''
    expect(text).toContain('Section body.')
    expect(text).not.toContain('Note body.')
  })

  test('a block embed renders only that block', async () => {
    const host = await mount({ source: '![[Note#^blk]]', notePath: '/vault/Host' })
    const text = host.querySelector('.markdown-embed-note')?.textContent ?? ''
    expect(text).toContain('Section body.')
    expect(text).not.toContain('Note Title')
  })

  test('a missing embed renders a placeholder', async () => {
    const host = await mount({ source: '![[Nowhere]]', notePath: '/vault/Host' })
    expect(host.querySelector('.markdown-embed-missing')?.textContent).toContain('Nowhere')
  })

  test('an image embed goes through assetUrl', async () => {
    const host = await mount({ source: '![[picture.png]]', notePath: '/vault/Host' })
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/assets/picture.png')
  })

  test('an image embed hands the embedding note to assetUrl as fromPath', async () => {
    // A host indexing more than one vault resolves the target inside the
    // embedding note's own vault, and `fromPath` is the only way it can know
    // which one that is.
    assetCalls.length = 0
    await mount({ source: '![[picture.png]]', notePath: '/vault/Host' })
    expect(assetCalls).toContainEqual(['picture.png', '/vault/Host'])
  })

  test('a block id on an embed reaches the DOM, whatever the embed renders', async () => {
    // `remarkBlockIds` puts `id`/`data-block-id` on the `<markdown-embed>`;
    // a `#^id` link needs the rendered element to keep them.
    const cases: Array<[string, string]> = [
      ['![[picture.png]]\n\n^fig', 'img'],
      ['![[Note]]\n\n^fig', '.markdown-embed-note'],
      ['![[Nowhere]]\n\n^fig', '.markdown-embed-missing'],
    ]
    for (const [source, selector] of cases) {
      const host = await mount({ source, notePath: '/vault/Host' })
      await waitFor(() => host.querySelector(selector) !== null, `${selector} for ${source}`)
      const el = host.querySelector(selector)!
      expect(el.getAttribute('id')).toBe('fig')
      expect(el.getAttribute('data-block-id')).toBe('fig')
      app?.unmount()
      app = null
    }
  })

  test('a self-embed is caught as a cycle rather than recursing', async () => {
    const host = await mount({ source: NOTES['/vault/Loop'], notePath: '/vault/Loop' })
    expect(host.querySelector('.markdown-embed-cycle')).not.toBeNull()
  })

  test('a two-note embed loop is caught', async () => {
    const host = await mount({ source: NOTES['/vault/A'], notePath: '/vault/A' })
    // A embeds B, B embeds A — the inner A must stop rather than recurse.
    expect(host.textContent).toContain('B body.')
    expect(host.querySelector('.markdown-embed-cycle')).not.toBeNull()
  })
})

describe('Embed: runaway guards', () => {
  test('a self-embed stops on the first hop, not after a copy', async () => {
    // The host names this note the way IT spells paths — a vault path, which
    // is what `resolveLink(target, fromPath)` needs — while the embed compares
    // against the resolver's spelling. When those two disagreed, `![[Loop]]`
    // rendered one full extra copy of the note before the guard engaged.
    const host = await mount({ source: '![[Loop]]\n\n![[Loop]]', notePath: 'Loop' })
    expect(host.querySelectorAll('.markdown-embed-cycle')).toHaveLength(2)
    expect(host.querySelectorAll('.markdown-embed-note')).toHaveLength(0)
    expect(loaded).toEqual([])
  })

  test('a live notePath change re-bases the ancestor chain', async () => {
    // `notePath` is a live prop everywhere else in the component, so the chain
    // has to follow it: once the host has moved on to another note, embedding
    // the note it came FROM is an ordinary transclusion, not a cycle.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const source = ref('Leaf body.')
    const notePath = ref('/vault/Leaf')
    const Wrapper = defineComponent({
      setup() {
        provideNoteSource(noteSource)
        return () => h(MarkdownRender, { source: source.value, notePath: notePath.value } as never)
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await settle(host)

    source.value = 'Host body.\n\n![[Leaf]]'
    notePath.value = '/vault/Host'
    await waitFor(
      () => host.querySelector('.markdown-embed-note, .markdown-embed-cycle') !== null,
      'the embed of Leaf to settle',
    )
    const embed = host.querySelector('.markdown-embed-note, .markdown-embed-cycle')!
    expect(embed.className).toContain('markdown-embed-note')
    expect(host.textContent).toContain('Leaf body.')
  })

  test('the depth cap does not depend on how the host spells the outermost path', async () => {
    // Same document, same resolver — only the host's spelling of the outermost
    // note differs, and a spelling the resolver renames must not cost a level.
    const depthFor = async (notePath: string) => {
      const host = await mount({ source: NOTES['/vault/N1']!, notePath })
      await waitFor(
        () => host.querySelector('.markdown-embed-too-deep') !== null,
        `the depth cap to fire under notePath ${notePath}`,
      )
      const levels = host.querySelectorAll('.markdown-embed-note').length
      app?.unmount()
      app = null
      return levels
    }
    // N1 embeds N2 … N5 embeds N6: five hops, one over MAX_EMBED_DEPTH.
    expect(await depthFor('/vault/N1')).toBe(MAX_EMBED_DEPTH - 1)
    expect(await depthFor('N1')).toBe(MAX_EMBED_DEPTH - 1)
  })

  test('a fan-out is bounded by the document budget, not by depth alone', async () => {
    // Wide.md embeds Wide2 seven times, Wide2 embeds Wide3 seven times, and so
    // on: N^D loads, every one of them inside MAX_EMBED_DEPTH. Before the
    // budget this reached 399 loads with no guard firing.
    const host = await mount({ source: NOTES['/vault/Wide'], notePath: '/vault/Wide' })
    expect(loaded.length).toBeLessThanOrEqual(MAX_EMBEDS_PER_DOCUMENT)
    expect(host.querySelectorAll('.markdown-embed-over-budget').length).toBeGreaterThan(0)
  })

  test('an ordinary note is nowhere near the budget', async () => {
    const host = await mount({ source: '![[Note]]\n\n![[Note]]', notePath: '/vault/Host' })
    expect(host.querySelectorAll('.markdown-embed-note')).toHaveLength(2)
    expect(host.querySelector('.markdown-embed-over-budget')).toBeNull()
  })

  test('folding a section away releases its embeds\u2019 budget charge', async () => {
    // The budget bounds how many transclusions are LIVE, not how many have ever
    // been created: folding and unfolding a section repeatedly must not spend
    // the document out of budget.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const folded = ref(new Set<string>())
    const body = Array.from({ length: 10 }, () => '![[Note]]').join('\n\n')
    const Wrapper = defineComponent({
      setup() {
        provideNoteSource(noteSource)
        return () =>
          h(MarkdownRender, {
            source: `# Sect\n\n${body}`,
            notePath: '/vault/Host',
            foldable: true,
            foldedHeadings: folded.value,
          } as never)
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await settle(host)
    expect(host.querySelectorAll('.markdown-embed-note')).toHaveLength(10)

    // 14 rounds x 10 embeds = 140 charges, past MAX_EMBEDS_PER_DOCUMENT.
    for (let i = 0; i < 14; i++) {
      folded.value = new Set(['sect'])
      await new Promise((resolve) => setTimeout(resolve, 2))
      folded.value = new Set()
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    await settle(host)
    expect(host.querySelectorAll('.markdown-embed-over-budget')).toHaveLength(0)
    expect(host.querySelectorAll('.markdown-embed-note')).toHaveLength(10)
  })

  test('a structural re-render does not permanently overshoot the budget', async () => {
    // Vue mounts the incoming subtree before unmounting the outgoing one, so
    // the same 80 embeds are charged twice for one patch. Once the old subtree
    // goes, every live embed must hold a charge again.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const embeds = Array.from({ length: 80 }, () => '![[Note]]')
    const source = ref(embeds.join('\n\n'))
    const Wrapper = defineComponent({
      setup() {
        provideNoteSource(noteSource)
        return () => h(MarkdownRender, { source: source.value, notePath: '/vault/Host' } as never)
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await settle(host)
    expect(host.querySelectorAll('.markdown-embed-note')).toHaveLength(80)

    // Same 80 transclusions, re-parented into a blockquote so the whole subtree
    // is replaced rather than patched in place.
    source.value = `> ${embeds.join('\n>\n> ')}`
    await settle(host)
    expect(host.querySelectorAll('.markdown-embed-over-budget')).toHaveLength(0)
    expect(host.querySelectorAll('.markdown-embed-note')).toHaveLength(80)
  })

  test('image embeds are not charged against the budget', async () => {
    const source = Array.from(
      { length: MAX_EMBEDS_PER_DOCUMENT + 20 },
      () => '![[picture.png]]',
    ).join('\n\n')
    const host = await mount({ source, notePath: '/vault/Host' })
    expect(host.querySelectorAll('img')).toHaveLength(MAX_EMBEDS_PER_DOCUMENT + 20)
    expect(host.querySelector('.markdown-embed-over-budget')).toBeNull()
  })

  test('an image embed edited into a note embed on the same line is charged', async () => {
    // Embeds key on source line, so `![[x.png]]` -> `![[x]]` patches the same
    // instance. The charge has to follow the kind, or the edit loads past the
    // budget without ever taking one.
    const count = MAX_EMBEDS_PER_DOCUMENT + 5
    const host = document.createElement('div')
    document.body.appendChild(host)
    const source = ref(Array.from({ length: count }, () => '![[picture.png]]').join('\n\n'))
    const Wrapper = defineComponent({
      setup() {
        provideNoteSource(noteSource)
        return () => h(MarkdownRender, { source: source.value, notePath: '/vault/Host' } as never)
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await waitFor(() => host.querySelectorAll('img').length === count, 'the image embeds')

    source.value = Array.from({ length: count }, () => '![[Leaf]]').join('\n\n')
    await waitFor(
      () =>
        host.querySelectorAll('img').length === 0 &&
        host.querySelectorAll('.markdown-embed-note, .markdown-embed-over-budget').length === count,
      'every embed to settle as a note or an over-budget placeholder',
    )
    expect(host.querySelectorAll('.markdown-embed-note')).toHaveLength(MAX_EMBEDS_PER_DOCUMENT)
    expect(host.querySelectorAll('.markdown-embed-over-budget')).toHaveLength(5)
  })

  test('a note embed edited into an image embed hands its charge back', async () => {
    // The reverse edit: a charge kept by what is now a free media embed would
    // push some other transclusion over budget.
    const host = document.createElement('div')
    document.body.appendChild(host)
    const notes = Array.from({ length: MAX_EMBEDS_PER_DOCUMENT }, () => '![[Leaf]]')
    const source = ref([...notes, '![[Note]]'].join('\n\n'))
    const Wrapper = defineComponent({
      setup() {
        provideNoteSource(noteSource)
        return () => h(MarkdownRender, { source: source.value, notePath: '/vault/Host' } as never)
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await waitFor(
      () => host.querySelectorAll('.markdown-embed-over-budget').length === 1,
      'the last embed to be over budget',
    )

    // The first embed becomes an image: its charge goes to the waiting one.
    source.value = ['![[picture.png]]', ...notes.slice(1), '![[Note]]'].join('\n\n')
    await waitFor(
      () =>
        [...host.querySelectorAll('.markdown-embed-note')].some((el) =>
          el.textContent?.includes('Note body.'),
        ),
      'the over-budget embed to claim the released charge',
    )
    expect(host.querySelector('.markdown-embed-over-budget')).toBeNull()
  }, 15_000)
})

describe('Embed: block ids', () => {
  // A standalone `^id` after a block embed puts `id`/`data-block-id` on the
  // `<markdown-embed>`. Whatever the embed renders as has to carry them, or
  // `[[#^id]]` has nothing to scroll to.
  test('a transclusion keeps its block id', async () => {
    const host = await mount({ source: '![[Leaf]]\n\n^blk', notePath: '/vault/Host' })
    await waitFor(() => host.querySelector('.markdown-embed-note') !== null, 'the transclusion')
    const el = host.querySelector('#blk')
    expect(el?.classList.contains('markdown-embed-note')).toBe(true)
    expect(el?.getAttribute('data-block-id')).toBe('blk')
  })

  test('a media embed keeps its block id', async () => {
    const host = await mount({ source: '![[picture.png]]\n\n^img', notePath: '/vault/Host' })
    const el = host.querySelector('#img')
    expect(el?.tagName).toBe('IMG')
    expect(el?.getAttribute('data-block-id')).toBe('img')
  })

  test('a placeholder keeps its block id', async () => {
    const host = await mount({ source: '![[Nowhere]]\n\n^gone', notePath: '/vault/Host' })
    await waitFor(() => host.querySelector('.markdown-embed-missing') !== null, 'the placeholder')
    const el = host.querySelector('#gone')
    expect(el?.classList.contains('markdown-embed-missing')).toBe(true)
    expect(el?.getAttribute('data-block-id')).toBe('gone')
  })
})

describe('Embed: the budget follows an in-place kind change', () => {
  /** Mount under a one-embed budget; the returned setter edits the source in place. */
  async function mountBudgeted(initial: string) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const budget = { spent: 0, limit: 1 }
    const source = ref(initial)
    const Wrapper = defineComponent({
      setup() {
        provideNoteSource(noteSource)
        provide(EmbedBudgetKey, budget)
        return () => h(MarkdownRender, { source: source.value, notePath: '/vault/Host' } as never)
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await settle(host)
    return { host, budget, source }
  }

  test('media edited into a note transclusion takes a charge', async () => {
    const { host, budget, source } = await mountBudgeted('![[a.png]]\n\n![[Leaf]]')
    await waitFor(() => host.textContent?.includes('Leaf body.') ?? false, 'Leaf to load')
    expect(budget.spent).toBe(1)

    // Same line, same instance: the image becomes a transclusion.
    source.value = '![[Note]]\n\n![[Leaf]]'
    await waitFor(
      () => host.querySelector('.markdown-embed-over-budget') !== null,
      'the over-limit transclusion to show its placeholder',
    )
    expect(budget.spent).toBe(1)
    expect(host.querySelectorAll('.markdown-embed-note')).toHaveLength(1)
  })

  test('a transclusion edited into media gives its charge back', async () => {
    const { host, budget, source } = await mountBudgeted('![[Note]]')
    await waitFor(() => host.textContent?.includes('Note body.') ?? false, 'Note to load')
    expect(budget.spent).toBe(1)

    source.value = '![[a.png]]\n\n![[Leaf]]'
    await waitFor(() => host.textContent?.includes('Leaf body.') ?? false, 'Leaf to load')
    expect(host.querySelector('img')).not.toBeNull()
    expect(host.querySelector('.markdown-embed-over-budget')).toBeNull()
    expect(budget.spent).toBe(1)
  })
})

describe('Embed: media', () => {
  test('a video embed renders a <video>, not a broken <img>', async () => {
    const host = await mount({ source: '![[talk.mp4]]', notePath: '/vault/Host' })
    expect(host.querySelector('video')?.getAttribute('src')).toBe('/assets/talk.mp4')
    expect(host.querySelector('img')).toBeNull()
  })

  test('an audio embed renders an <audio>', async () => {
    const host = await mount({ source: '![[song.mp3]]', notePath: '/vault/Host' })
    expect(host.querySelector('audio')?.getAttribute('src')).toBe('/assets/song.mp3')
    expect(host.querySelector('img')).toBeNull()
  })

  test('a pdf embed renders an honest link, and no frame', async () => {
    const host = await mount({ source: '![[paper.pdf]]', notePath: '/vault/Host' })
    const link = host.querySelector('a.markdown-embed-pdf')
    expect(link?.getAttribute('href')).toBe('/assets/paper.pdf')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(host.querySelector('iframe')).toBeNull()
    expect(host.querySelector('img')).toBeNull()
  })

  test('a pdf embed keeps a page fragment on its link', async () => {
    const host = await mount({ source: '![[paper.pdf#page=3]]', notePath: '/vault/Host' })
    expect(host.querySelector('a.markdown-embed-pdf')?.getAttribute('href')).toBe(
      '/assets/paper.pdf#page=3',
    )
  })

  test('media embeds are scheme-checked like images are', async () => {
    // Same guard as an <img>: a media src is a network request the reader
    // never asked for.
    const host = await mount({ source: '![[talk.mp4]]', notePath: '/vault/Host' })
    expect(host.querySelector('video')).not.toBeNull()
  })

  test('a size alias sizes the image instead of becoming its alt text', async () => {
    const host = await mount({ source: '![[picture.png|300]]', notePath: '/vault/Host' })
    const img = host.querySelector('img')!
    expect(img.getAttribute('width')).toBe('300')
    expect(img.getAttribute('alt')).toBe('picture.png')
  })

  test('a width x height alias sets both', async () => {
    const host = await mount({ source: '![[picture.png|300x200]]', notePath: '/vault/Host' })
    const img = host.querySelector('img')!
    expect(img.getAttribute('width')).toBe('300')
    expect(img.getAttribute('height')).toBe('200')
  })

  test('a non-numeric alias is still alt text', async () => {
    const host = await mount({
      source: '![[picture.png|A picture of a thing]]',
      notePath: '/vault/Host',
    })
    const img = host.querySelector('img')!
    expect(img.getAttribute('alt')).toBe('A picture of a thing')
    expect(img.getAttribute('width')).toBeNull()
  })

  test('a markdown image alt of Caption|size is sized, with the caption as alt', async () => {
    const host = await mount({ source: '![Cap|300](picture.png)', notePath: '/vault/Host' })
    const img = host.querySelector('img')!
    expect(img.getAttribute('alt')).toBe('Cap')
    expect(img.getAttribute('width')).toBe('300')
  })
})

describe('MermaidBlock', () => {
  beforeAll(() => {
    fakeMermaidOn = true
  })
  afterAll(() => {
    fakeMermaidOn = false
  })

  /** Mount `<MermaidBlock>` directly, with `source` and `theme` driven by refs. */
  function mountBlock(source: string, initialTheme = 'neutral') {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const current = ref(source)
    const theme = ref(initialTheme)
    app = createApp({
      render: () => h(MermaidBlock, { source: current.value, theme: theme.value }),
    })
    app.mount(host)
    return { host, current, theme }
  }

  /** Wait for the async draw to land in the canvas or the fallback. */
  async function settleDiagram(host: HTMLElement, ticks = 100): Promise<void> {
    for (let i = 0; i < ticks; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2))
      if (host.querySelector('.markdown-mermaid-canvas svg, .markdown-mermaid-fallback')) return
    }
    throw new Error(`diagram never settled; markup was: ${host.innerHTML.slice(0, 400)}`)
  }

  /** Wait until `parked` holds `n` started renders. */
  async function settleStarted(parked: unknown[], n: number): Promise<void> {
    for (let i = 0; i < 100; i++) {
      if (parked.length >= n) return
      await new Promise((resolve) => setTimeout(resolve, 2))
    }
    throw new Error(`only ${parked.length} render(s) started; expected ${n}`)
  }

  /** Wait for the drawn svg to carry `value` on `attr` — i.e. for a redraw. */
  async function settleAttribute(host: HTMLElement, attr: string, value: string): Promise<void> {
    for (let i = 0; i < 100; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2))
      if (host.querySelector('svg')?.getAttribute(attr) === value) return
    }
    throw new Error(
      `svg never redrew with ${attr}="${value}"; it was ` +
        `"${host.querySelector('svg')?.getAttribute(attr)}"`,
    )
  }

  test('source alone, no node, renders an svg into the canvas', async () => {
    const { host } = mountBlock('graph TD; A-->B')
    await settleDiagram(host)
    const svg = host.querySelector('.markdown-mermaid-canvas svg')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('data-source')).toBe('graph TD; A-->B')
    expect(svg!.getAttribute('data-theme')).toBe('neutral')
    expect(host.querySelector('.markdown-mermaid-fallback')).toBeNull()
    // No node, so no source line to report.
    expect(host.querySelector('.markdown-mermaid')!.hasAttribute('data-line')).toBe(false)
  })

  test('a source change redraws', async () => {
    const { host, current } = mountBlock('graph TD; A-->B')
    await settleDiagram(host)
    current.value = 'graph LR; C-->D'
    await settleAttribute(host, 'data-source', 'graph LR; C-->D')
  })

  // A live theme flip, not a remount: a host that binds `theme` to dark mode
  // changes the prop on the mounted component, and mermaid bakes the palette
  // into the svg at render time. Without `theme` in the watch the diagram keeps
  // the palette it was first drawn with.
  test('a theme change on a mounted block redraws with the new theme', async () => {
    const { host, theme } = mountBlock('graph TD; A-->B', 'neutral')
    await settleDiagram(host)
    expect(host.querySelector('svg')!.getAttribute('data-theme')).toBe('neutral')
    theme.value = 'dark'
    await settleAttribute(host, 'data-theme', 'dark')
    // The redraw kept the source it was drawn from.
    expect(host.querySelector('svg')!.getAttribute('data-source')).toBe('graph TD; A-->B')
  })

  // Two quick changes can resolve out of order — mermaid takes as long as the
  // diagram is complicated, so the first call is not the first to finish.
  // Parking both renders makes that race deterministic.
  test('a stale render cannot overwrite a newer one', async () => {
    const parked: Array<{ source: string; finish: (svg: string) => void }> = []
    parkedRenders = parked
    try {
      const { host, current } = mountBlock('graph TD; FIRST')
      await settleStarted(parked, 1)
      current.value = 'graph TD; SECOND'
      await settleStarted(parked, 2)

      // The newer render lands first; the older one finishes late and is dropped.
      parked[1]!.finish('<svg data-source="graph TD; SECOND"></svg>')
      await settleAttribute(host, 'data-source', 'graph TD; SECOND')
      parked[0]!.finish('<svg data-source="graph TD; FIRST"></svg>')
      for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 2))

      expect(host.querySelector('svg')!.getAttribute('data-source')).toBe('graph TD; SECOND')
      expect(host.querySelector('.markdown-mermaid-fallback')).toBeNull()
    } finally {
      parkedRenders = null
    }
  })

  test('a render error shows the source text as the fallback', async () => {
    const { host } = mountBlock('graph TD; BROKEN')
    await settleDiagram(host)
    expect(host.querySelector('.markdown-mermaid-canvas svg')).toBeNull()
    expect(host.querySelector('.markdown-mermaid-fallback code')?.textContent).toBe(
      'graph TD; BROKEN',
    )
  })

  test('empty source draws nothing and shows no fallback', async () => {
    const { host } = mountBlock('')
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 2))
    expect(host.querySelector('.markdown-mermaid-canvas')!.childNodes).toHaveLength(0)
    expect(host.querySelector('.markdown-mermaid-fallback')).toBeNull()
  })

  test('the node path still routes a mermaid fence and carries data-line', async () => {
    const host = await mount({ source: 'intro\n\n```mermaid\ngraph TD; A-->B\n```' })
    await settleDiagram(host)
    const block = host.querySelector('.markdown-mermaid')!
    expect(block.getAttribute('data-line')).toBe('3')
    expect(host.querySelector('.markdown-mermaid-canvas svg')?.getAttribute('data-source')).toBe(
      'graph TD; A-->B',
    )
  })
  test('a mermaid fence keeps its block id, so [[#^id]] has a target', async () => {
    const host = await mount({ source: '```mermaid\ngraph TD; A-->B\n```\n^diag' })
    await settleDiagram(host)
    const block = host.querySelector('.markdown-mermaid')!
    expect(block.id).toBe('diag')
    expect(block.getAttribute('data-block-id')).toBe('diag')
  })
})
