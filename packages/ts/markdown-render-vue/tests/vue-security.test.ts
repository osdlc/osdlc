// @vitest-environment jsdom
/**
 * Red team, mounted.
 *
 * `tests/sanitize.test.ts` proves the HTML string is clean. These prove the
 * *behaviour* is: what the host is told when a link is clicked, what an embed
 * asks the vault for, what ends up in an `src`. Everything a note can write
 * has to be assumed forged by the time a component reads it back, because raw
 * HTML survives `rehype-raw` as real elements and `data-*` carries no protocol
 * constraint of its own.
 */

import { markdownVue, vue } from './setup-dom.ts'
import { afterEach, describe, expect, test } from 'vitest'
import type { App, Component } from 'vue'
import type { NoteSource } from '../src/context.ts'
import {
  CLASS_ROUTES,
  FENCE_LANG_PROP,
  isRoutingClass,
  type LinkResolution,
  stripRoutingSignals,
} from '@osdlc/markdown-render'
import { rehypeShiki } from '@osdlc/markdown-render/shiki'

/** One pass for the file: the renderer compares it by identity to reuse its processor. */
const highlight = rehypeShiki()

const { createApp, defineComponent, h } = vue
const { MarkdownRender, provideNoteSource, resolutionFromNode, routeKeys, toVueProps, attrName } =
  markdownVue

const NOTES: Record<string, string> = { '/vault/Real': 'real body' }

/** Targets the resolver answers with an off-vault URL. */
const EXTERNAL: Record<string, string> = { Site: 'https://example.com/a' }

/** Records every call a note managed to steer into the vault seam. */
const calls: { loadNote: string[]; assetUrl: string[] } = { loadNote: [], assetUrl: [] }

let assetAnswer: string | null = null

const noteSource: NoteSource = {
  resolveLink(target: string): LinkResolution {
    const display = target.split('/').pop() ?? target
    const external = EXTERNAL[target]
    if (external) return { kind: 'external', path: external, display }
    const path = `/vault/${target}`
    if (!(path in NOTES)) return { kind: 'missing', display }
    return { kind: 'note', path, display }
  },
  async loadNote(path) {
    calls.loadNote.push(path)
    const body = NOTES[path]
    return body === undefined ? null : { body }
  },
  assetUrl(target) {
    calls.assetUrl.push(target)
    return assetAnswer
  },
}

let app: App | null = null

/** Route keys that reached a component this test, in mount order. */
const routed: string[] = []

/**
 * Stand-in for a routed component, recording that the route fired.
 *
 * Substituted for the real ones so "did this element reach a component?" is a
 * direct observation rather than an inference from rendered chrome — and so a
 * routing test never loads KaTeX or mermaid to find out.
 */
function probe(key: string): Component {
  return defineComponent({
    name: `Probe(${key})`,
    props: { node: { type: Object, required: true } },
    setup(_props, { slots }) {
      routed.push(key)
      return () => h('div', { class: 'probe' }, slots.default?.())
    },
  })
}

/** Every route a note could forge a signal for. */
const PROBES: Record<string, Component> = {
  'a.wikilink': probe('a.wikilink'),
  'a.tag': probe('a.tag'),
  'div.callout': probe('div.callout'),
  'math-inline': probe('math-inline'),
  'lang:mermaid': probe('lang:mermaid'),
}

/** Poll until `check` holds, or give up. Shiki's first load is seconds, not milliseconds. */
async function waitFor(check: () => boolean, ms = 15000): Promise<void> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

afterEach(() => {
  app?.unmount()
  app = null
  calls.loadNote = []
  calls.assetUrl = []
  assetAnswer = null
  routed.length = 0
})

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
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1))
    if (host.querySelector('.markdown-render')?.childNodes.length) break
  }
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 2))
  return host
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

describe('a forged wikilink anchor', () => {
  // A hand-written `<a class="wikilink">` never reaches `WikilinkAnchor`:
  // provenance strips the class. The first two tests pin that outer contract;
  // `resolutionFromNode` refusing an unsafe `data-path` is pinned below over a
  // node, as defence in depth.
  test('never reaches WikilinkAnchor, script URL or not', async () => {
    const seen: Array<{ resolution: { path?: string } }> = []
    const host = await mount(
      {
        source:
          '<a class="wikilink" data-wikilink="Home" data-kind="external" data-path="javascript:alert(1)">Home</a>',
      },
      { onLinkClick: (payload: never) => seen.push(payload) },
    )
    expect(host.querySelector('a.wikilink')).toBeNull()
    click(host.querySelector('a')!)
    expect(seen).toHaveLength(0)
    // Inert, not deleted: the anchor and its text are still on the page.
    expect(host.textContent).toContain('Home')
  })

  test('an https data-path does not buy it a route either', async () => {
    const seen: Array<{ resolution: { path?: string } }> = []
    const host = await mount(
      {
        source:
          '<a class="wikilink" data-wikilink="Site" data-kind="external" data-path="https://example.com/a">Site</a>',
      },
      { onLinkClick: (payload: never) => seen.push(payload) },
    )
    expect(host.querySelector('a.wikilink')).toBeNull()
    click(host.querySelector('a')!)
    expect(seen).toHaveLength(0)
  })

  test('a resolved external wikilink still carries its path to the host', async () => {
    const seen: Array<{ resolution: { path?: string } }> = []
    const host = await mount(
      { source: '[[Site]]' },
      { onLinkClick: (payload: never) => seen.push(payload) },
    )
    click(host.querySelector('a.wikilink')!)
    expect(seen[0]!.resolution.path).toBe('https://example.com/a')
  })

  test('a resolved wikilink still carries its route to the host', async () => {
    const seen: Array<{ resolution: { path?: string } }> = []
    const host = await mount(
      { source: '[[Real]]' },
      { onLinkClick: (payload: never) => seen.push(payload) },
    )
    click(host.querySelector('a.wikilink')!)
    expect(seen[0]!.resolution.path).toBe('/vault/Real')
  })

  test('resolutionFromNode still refuses an unsafe data-path on any node', async () => {
    // Defence in depth, unreachable through raw HTML now but still the last
    // check before a path is handed to the host: `WikilinkAnchor` may also be
    // routed by a host over hast it built itself.
    const node = (path: string) => ({
      type: 'element',
      tagName: 'a',
      properties: {
        className: ['wikilink'],
        dataWikilink: 'X',
        dataKind: 'external',
        dataPath: path,
      },
      children: [],
    })
    expect(resolutionFromNode(node('javascript:alert(1)') as never).path).toBeUndefined()
    expect(resolutionFromNode(node('https://example.com/a') as never).path).toBe(
      'https://example.com/a',
    )
  })
})

describe('a forged markdown-embed', () => {
  test('never renders an image from a note-chosen URL', async () => {
    const host = await mount({
      source:
        '<markdown-embed data-embed-kind="image" data-embed-target="x.png" data-embed-path="https://evil.example/beacon?v=1"></markdown-embed>',
    })
    expect(host.querySelector('img')).toBeNull()
    expect(host.innerHTML).not.toContain('evil.example')
    expect(calls.assetUrl).toEqual([])
  })

  test('never reaches NoteSource.loadNote', async () => {
    await mount({
      source:
        '<markdown-embed data-embed-kind="note" data-embed-target="x" data-embed-path="../../../../etc/passwd"></markdown-embed>',
    })
    expect(calls.loadNote).toEqual([])
  })

  test('a real embed still loads through the seam', async () => {
    const host = await mount({ source: '![[Real]]', notePath: '/vault/Host' })
    expect(calls.loadNote).toEqual(['/vault/Real'])
    expect(host.querySelector('.markdown-embed-note')?.textContent).toContain('real body')
  })
})

describe('an image embed src', () => {
  test('is refused when the host answers with a script URL', async () => {
    assetAnswer = 'javascript:alert(1)'
    const host = await mount({ source: '![[picture.png]]', notePath: '/vault/Host' })
    expect(host.querySelector('img')).toBeNull()
    expect(host.querySelector('.markdown-embed-missing')).not.toBeNull()
  })

  test('accepts the blob URL a host hands back for a fetched attachment', async () => {
    assetAnswer = 'blob:https://app.example/9c1'
    const host = await mount({ source: '![[picture.png]]', notePath: '/vault/Host' })
    expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:https://app.example/9c1')
  })
})

describe('forged routing signals', () => {
  /**
   * The class names and `data-lang` below all survive `rehype-sanitize` — the
   * schema allows them, because they are what the pipeline's own markup is
   * made of — so the provenance pair strips them off note-authored markup
   * instead. A forgery renders as inert HTML: same tag, same text, no route.
   */
  async function forged(source: string, options?: Record<string, unknown>): Promise<HTMLElement> {
    const host = await mount({ source, components: PROBES, options })
    // Absence proves nothing until the render has actually landed.
    await waitFor(() => (host.querySelector('.markdown-render')?.childNodes.length ?? 0) > 0)
    return host
  }

  test('a hand-written wikilink anchor never reaches WikilinkAnchor', async () => {
    const host = await forged(
      '<a class="wikilink" data-wikilink="X" data-kind="note" data-path="/vault/X">X</a>',
    )
    expect(routed).toEqual([])
    expect(host.querySelector('a.wikilink')).toBeNull()
  })

  test('a hand-written tag anchor never reaches TagAnchor', async () => {
    const host = await forged('<a class="tag" data-tag="forged">label</a>')
    expect(routed).toEqual([])
    expect(host.querySelector('a.tag')).toBeNull()
    expect(host.textContent).toContain('label')
  })

  test('a hand-written callout never reaches Callout', async () => {
    const host = await forged(
      '<div class="callout" data-callout="note"><div class="callout-title">T</div>body</div>',
    )
    expect(routed).toEqual([])
    expect(host.querySelector('.callout')).toBeNull()
    expect(host.textContent).toContain('body')
  })

  test('a hand-written math-inline code element never reaches MathInline', async () => {
    const host = await forged('<code class="math-inline">x</code>', { math: true })
    expect(routed).toEqual([])
    expect(host.querySelector('.math-inline')).toBeNull()
  })

  test('a hand-written data-lang never reaches a lang: route', async () => {
    const host = await forged('<pre data-lang="mermaid"><code>graph TD; A--&gt;B</code></pre>')
    expect(routed).toEqual([])
    expect(host.textContent).toContain('graph TD')
  })

  test('a hand-written language-mermaid fence is not re-stamped by the Shiki pass', async () => {
    // The subtle one. `data-lang` is stripped, but the Shiki pass runs AFTER
    // provenance and stamps it back from the `<code>`'s `language-*` class —
    // so that class is a routing signal too, and goes with it.
    const host = await forged('<pre><code class="language-mermaid">graph TD; A-->B</code></pre>', {
      highlight,
    })
    await waitFor(() => (host.textContent ?? '').includes('graph TD'))
    expect(routed).toEqual([])
  })
})

describe('pipeline-produced markup still routes', () => {
  /** The regression pins: the strip must not cost the dialect its own routing. */
  async function real(source: string, options?: Record<string, unknown>): Promise<HTMLElement> {
    return mount({ source, components: PROBES, options })
  }

  test('a real wikilink routes', async () => {
    await real('[[Real]]')
    expect(routed).toContain('a.wikilink')
  })

  test('a real tag routes', async () => {
    await real('#project/alpha')
    expect(routed).toContain('a.tag')
  })

  test('a real callout routes', async () => {
    await real('> [!note] T\n> body')
    expect(routed).toContain('div.callout')
  })

  test('real inline math routes', async () => {
    await real('$x^2$', { math: true })
    expect(routed).toContain('math-inline')
  })

  test('a real mermaid fence routes', async () => {
    await real('```mermaid\ngraph TD; A-->B\n```')
    expect(routed).toContain('lang:mermaid')
  })

  test('a real mermaid fence routes with highlighting on', async () => {
    // A real highlight pass is what the desktop app ships. Mermaid is a reserved
    // language, so the Shiki pass leaves the fence alone and stamps its
    // `data-lang` — the same route, reached down a different path.
    const host = await real('```mermaid\ngraph TD; A-->B\n```', { highlight })
    await waitFor(() => routed.includes('lang:mermaid'))
    expect(routed).toContain('lang:mermaid')
    expect(host.textContent).toContain('graph TD')
  })
})

describe('the routing table and the strip table are one table', () => {
  // `src/routing-signals.ts` is the single table. These pin that `routeKeys`
  // really keys on every entry, and that stripping an entry really costs the
  // element its route — which is the property the forgery tests rely on.
  const el = (tagName: string, properties: Record<string, unknown>) => ({
    type: 'element',
    tagName,
    properties,
    children: [],
  })

  test('every class route both routes and is stripped', () => {
    for (const route of CLASS_ROUTES) {
      const node = el(route.tag, { className: [route.className] })
      expect(routeKeys(node as never)).toEqual([route.key, route.tag])
      expect(isRoutingClass(route.className)).toBe(true)
    }
  })

  test('the fence-language property both routes and is stripped', () => {
    expect(routeKeys(el('pre', { [FENCE_LANG_PROP]: 'mermaid' }) as never)).toEqual([
      'lang:mermaid',
      'pre',
    ])
  })

  test('a stripped element routes on its tag name alone', () => {
    const cases = [
      ...CLASS_ROUTES.map((route) => el(route.tag, { className: [route.className, 'kept'] })),
      el('pre', { [FENCE_LANG_PROP]: 'mermaid' }),
      el('code', { className: ['language-mermaid'] }),
    ]
    for (const node of cases) {
      stripRoutingSignals(node.properties)
      expect(routeKeys(node as never)).toEqual([node.tagName])
    }
    // Non-routing classes are left where they are — inert, not erased.
    expect(cases[0]!.properties.className).toEqual(['kept'])
  })
})

describe('the hast walker', () => {
  test('attrName still lowercases an event-shaped key', () => {
    // The name mapping is unchanged; it is `toVueProps` that refuses to use it.
    expect(attrName('onClick')).toBe('onclick')
  })

  test('toVueProps drops every on* property', () => {
    expect(toVueProps({ onClick: 'alert(1)', onerror: 'alert(2)', ONLOAD: 'x' } as never)).toEqual(
      {},
    )
  })

  test('toVueProps keeps everything that is not a handler', () => {
    expect(toVueProps({ className: ['a', 'b'], dataPath: '/x', title: 'kept' } as never)).toEqual({
      class: 'a b',
      'data-path': '/x',
      title: 'kept',
    })
  })

  test('an inline handler cannot reach the DOM even with sanitize off', async () => {
    // `sanitize: false` is a documented option, and a host can hand the walker
    // hast it built itself. Neither may turn into a live listener.
    const host = await mount({
      source: '<div onclick="globalThis.__pwned = 1">x</div>',
      options: { sanitize: false },
    })
    expect(host.innerHTML).not.toContain('onclick')
  })
})
