// @vitest-environment jsdom
/**
 * `RENDER_CHROME_SELECTOR` against the components that actually draw the
 * chrome, mounted for real.
 *
 * This file is the enforcement half of the contract `chrome.ts` describes. A
 * host walking a rendered note prunes on that selector to be left with the
 * note's own text; nothing in the type system links the selector to the class
 * strings the components emit, so a rename here would otherwise change a
 * host's behaviour silently and with no failing test anywhere. Every case
 * below asserts BOTH halves — the chrome matches, and the real content beside
 * it does not — because a selector that matched everything would pass a
 * one-sided test while making the note unsearchable.
 */

import { markdownVue, vue } from './setup-dom.ts'
import { afterEach, describe, expect, test } from 'vitest'
import type { App } from 'vue'
import type { NoteSource } from '../src/vue/context.ts'
import type { LinkResolution } from '../src/index.ts'

const { createApp, defineComponent, h } = vue
const { MarkdownRender, provideNoteSource, RENDER_CHROME_SELECTOR } = markdownVue

const NOTES: Record<string, string> = { '/vault/Real': 'The embedded body.' }

const noteSource: NoteSource = {
  resolveLink(target): LinkResolution {
    const path = `/vault/${target}`
    if (!(path in NOTES)) return { kind: 'missing', display: target }
    return { kind: 'note', path, display: target }
  },
  async loadNote(path) {
    const body = NOTES[path]
    return body === undefined ? null : { body }
  },
  assetUrl: (target) => `/assets/${target}`,
}

let app: App | null = null

afterEach(() => {
  app?.unmount()
  app = null
})

async function mount(props: Record<string, unknown>): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const Wrapper = defineComponent({
    setup() {
      provideNoteSource(noteSource)
      return () => h(MarkdownRender, props as never)
    },
  })
  app = createApp(Wrapper)
  app.mount(host)
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1))
    if (host.querySelector('.markdown-render')?.childNodes.length) break
  }
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 2))
  return host
}

/** The element, asserted to exist first — a missing one is a renamed class. */
function need(host: HTMLElement, selector: string): Element {
  const el = host.querySelector(selector)
  expect(el, `${selector} is no longer rendered — the chrome contract moved`).not.toBeNull()
  return el!
}

function isChrome(host: HTMLElement, selector: string): boolean {
  return need(host, selector).matches(RENDER_CHROME_SELECTOR)
}

describe('RENDER_CHROME_SELECTOR', () => {
  test("covers the code fence's chrome and not its body", async () => {
    const host = await mount({ source: '```ts\nconst body = 1\n```\n' })
    expect(isChrome(host, '.markdown-code-chrome')).toBe(true)
    expect(isChrome(host, '.markdown-code-status')).toBe(true)
    // The language label and both buttons are inside the chrome bar, so the
    // one prune takes all three.
    expect(need(host, '.markdown-code-lang').closest(RENDER_CHROME_SELECTOR)).not.toBeNull()
    // The fence's own source is the note.
    expect(need(host, 'pre code').matches(RENDER_CHROME_SELECTOR)).toBe(false)
    expect(need(host, 'pre code').closest(RENDER_CHROME_SELECTOR)).toBeNull()
  })

  test("covers the table's chrome but never its sortable header text", async () => {
    const host = await mount({ source: '| Head | Other |\n| --- | --- |\n| cell | value |\n' })
    expect(isChrome(host, '.markdown-table-chrome')).toBe(true)
    expect(isChrome(host, '.markdown-table-status')).toBe(true)

    // The load-bearing negative. `.markdown-table-sort` is a <button>, so a host
    // that pruned buttons wholesale would lose every sortable table's headers.
    const sort = need(host, '.markdown-table-sort')
    expect(sort.textContent).toContain('Head')
    expect(sort.matches(RENDER_CHROME_SELECTOR)).toBe(false)
    expect(sort.closest(RENDER_CHROME_SELECTOR)).toBeNull()
  })

  test('covers the synthesized name for a header cell with no text of its own', async () => {
    const host = await mount({ source: '|  | Other |\n| --- | --- |\n| cell | value |\n' })
    expect(isChrome(host, '.markdown-table-sort-name')).toBe(true)
  })

  test('covers both fold toggles and not the headings or items they sit beside', async () => {
    const host = await mount({
      source: '# One\n\nBody.\n\n- Parent\n  - Child\n',
      foldable: true,
    })
    expect(isChrome(host, '.markdown-heading-fold-toggle')).toBe(true)
    expect(isChrome(host, '.markdown-list-fold-toggle')).toBe(true)
    expect(need(host, 'h1').matches(RENDER_CHROME_SELECTOR)).toBe(false)
  })

  test('covers every embed placeholder and not an embedded note body', async () => {
    const missing = await mount({ source: '![[Nope]]' })
    expect(isChrome(missing, '.markdown-embed-missing')).toBe(true)

    const real = await mount({ source: '![[Real]]' })
    const note = need(real, '.markdown-embed-note')
    expect(note.matches(RENDER_CHROME_SELECTOR)).toBe(false)
    expect(note.closest(RENDER_CHROME_SELECTOR)).toBeNull()
  })

  test("covers KaTeX's clipped MathML twin and not the equation on screen", async () => {
    const host = await mount({ source: '$$x^2$$', options: { math: true } })
    // KaTeX imports lazily, so wait for its own output rather than the pipeline's.
    for (let i = 0; i < 200 && !host.querySelector('.katex'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    expect(isChrome(host, '.katex-mathml')).toBe(true)
    // The TeX source rides inside the twin, so pruning the twin prunes it too.
    expect(
      need(host, 'annotation[encoding="application/x-tex"]').closest(RENDER_CHROME_SELECTOR),
    ).not.toBeNull()
    // The copy the reader sees stays findable.
    const visual = need(host, '.katex-html')
    expect(visual.matches(RENDER_CHROME_SELECTOR)).toBe(false)
    expect(visual.closest(RENDER_CHROME_SELECTOR)).toBeNull()
  })

  test('ordinary prose matches nothing in it', async () => {
    const host = await mount({ source: 'Just a paragraph.\n' })
    const paragraph = need(host, 'p')
    expect(paragraph.matches(RENDER_CHROME_SELECTOR)).toBe(false)
    expect(paragraph.closest(RENDER_CHROME_SELECTOR)).toBeNull()
  })
})
