/**
 * Red team. Every case here goes through `rehype-raw` first — the raw HTML is
 * genuinely parsed into elements — and must then be killed by the sanitizer.
 * A regression that lets any of these through is a script-execution bug.
 */

import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { visit } from 'unist-util-visit'
import { markdownSchema, renderToHast, renderToHtml, type LinkResolution } from '../src/index.ts'
import { rehypeShiki } from '../src/shiki.ts'
import { html } from './helpers.ts'

describe('sanitize: script execution', () => {
  test('a script tag is stripped entirely, contents included', async () => {
    const out = await html('<script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
  })

  test('a script tag inside other markup is stripped', async () => {
    const out = await html('text\n\n<div><script>alert(1)</script></div>')
    expect(out).not.toContain('script')
    expect(out).not.toContain('alert')
  })

  test('an inline event handler is stripped', async () => {
    const out = await html('<img src="https://x/y.png" onerror="alert(1)">')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('alert')
  })

  test('an onclick on a div is stripped', async () => {
    const out = await html('<div onclick="alert(1)">click</div>')
    expect(out).not.toContain('onclick')
  })

  test('a javascript: href is stripped', async () => {
    const out = await html('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toContain('javascript:')
  })

  test('a javascript: href written as markdown is stripped', async () => {
    const out = await html('[x](javascript:alert(1))')
    expect(out).not.toContain('javascript:')
  })

  test('a data: iframe is stripped', async () => {
    const out = await html('<iframe src="data:text/html,<script>alert(1)</script>"></iframe>')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('data:text/html')
  })

  test('an object/embed tag is stripped', async () => {
    const out = await html('<object data="x.swf"></object>')
    expect(out).not.toContain('<object')
  })

  test('a style tag is stripped', async () => {
    const out = await html('<style>body{display:none}</style>')
    expect(out).not.toContain('<style')
  })

  test('a form is stripped', async () => {
    const out = await html('<form action="https://evil"><input name="p"></form>')
    expect(out).not.toContain('<form')
    expect(out).not.toContain('evil')
  })

  test('svg with an onload is stripped', async () => {
    const out = await html('<svg onload="alert(1)"><circle r="1"/></svg>')
    expect(out).not.toContain('onload')
    expect(out).not.toContain('<svg')
  })

  test('a base tag cannot hijack relative URLs', async () => {
    const out = await html('<base href="https://evil/">')
    expect(out).not.toContain('<base')
  })

  test('a meta refresh is stripped', async () => {
    const out = await html('<meta http-equiv="refresh" content="0;url=https://evil">')
    expect(out).not.toContain('<meta')
  })

  test('a markdown-embed written by hand is dropped, handler and all', async () => {
    // `<markdown-embed>` is pipeline output, not note input: the Vue layer
    // turns one into a component that fetches a note and paints an image, and
    // a forged instance is indistinguishable from a resolved `![[…]]` by the
    // time the sanitizer sees it. See `plugins/provenance.ts`.
    const out = await html(
      '<markdown-embed data-embed-target="x" onclick="alert(1)"></markdown-embed>',
    )
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('markdown-embed')
  })
})

describe('sanitize: markdown-embed provenance', () => {
  test('a resolved embed still renders', async () => {
    const out = await html('![[Note]]')
    expect(out).toContain('<markdown-embed')
    expect(out).toContain('data-embed-target="Note"')
  })

  test('the provenance token never reaches the output', async () => {
    const out = await html('![[Note]]')
    expect(out).not.toContain('nonce')
  })

  test('a forged embed pointing at an off-vault URL never renders', async () => {
    const out = await html(
      '<markdown-embed data-embed-kind="image" data-embed-target="x" data-embed-path="https://evil.example/beacon"></markdown-embed>',
    )
    expect(out).not.toContain('markdown-embed')
    expect(out).not.toContain('evil.example')
  })

  test('a forged embed naming a traversal path never renders', async () => {
    const out = await html(
      '<markdown-embed data-embed-kind="note" data-embed-path="../../../../etc/passwd"></markdown-embed>',
    )
    expect(out).not.toContain('markdown-embed')
    expect(out).not.toContain('etc/passwd')
  })

  test('guessing the token does not help', async () => {
    const out = await html(
      '<markdown-embed data-markdown-nonce="guessed" data-embed-target="x"></markdown-embed>',
    )
    expect(out).not.toContain('markdown-embed')
  })

  test('a forged embed next to a real one only kills the forgery', async () => {
    const out = await html(
      '![[Note]]\n\n<markdown-embed data-embed-target="forged"></markdown-embed>',
    )
    expect(out).toContain('data-embed-target="Note"')
    expect(out).not.toContain('forged')
  })
})

describe('sanitize: the src protocol allowlist', () => {
  // These pin WHY `remarkMarkdownImages` emits a `<markdown-embed>` instead of
  // rewriting the image node's `url` to a resolved asset URL. The schema's
  // `protocols.src` is http/https only, and `markdownSchema` does not widen it,
  // so a `blob:` src written anywhere in the pipeline is silently dropped here.
  // A host's `assetUrl` returns exactly a `blob:` URL — hence the custom
  // element, whose real `<img>` is built after sanitization by the Vue layer.
  test('a blob: image src does not survive', async () => {
    const out = await html('<img src="blob:abc123" alt="x">')
    expect(out).not.toContain('blob:abc123')
  })

  test('a data: image src does not survive', async () => {
    const out = await html('<img src="data:image/png;base64,AAAA">')
    expect(out).not.toContain('data:image/png')
  })

  test('an https image src does survive', async () => {
    const out = await html('![alt](https://example.com/a.png)')
    expect(out).toContain('https://example.com/a.png')
  })
})

describe('sanitize: what must survive', () => {
  test('dialect classes and data attributes pass through', async () => {
    const out = await html('[[Note]] #tag ==mark==\n\n> [!note] Title\n> body')
    expect(out).toContain('class="wikilink"')
    expect(out).toContain('class="tag"')
    expect(out).toContain('<mark>')
    expect(out).toContain('class="callout"')
    expect(out).toContain('data-callout="note"')
  })

  test('task list checkboxes survive', async () => {
    const out = await html('- [ ] a\n- [x] b')
    expect(out).toContain('<input type="checkbox"')
    expect(out).toContain('checked')
  })

  test('block ids survive as real ids', async () => {
    const out = await html('para ^blk')
    expect(out).toContain('id="blk"')
  })

  test('heading ids are NOT prefixed with user-content-', async () => {
    const out = await html('# Title')
    expect(out).toContain('id="title"')
    expect(out).not.toContain('user-content-')
  })

  test('safe http links survive', async () => {
    const out = await html('[x](https://example.com)')
    expect(out).toContain('href="https://example.com"')
  })

  test('sanitize: false renders raw HTML unchanged', async () => {
    const out = await renderToHtml('<div onclick="x">y</div>', { sanitize: false })
    expect(out).toContain('onclick')
  })

  test('a host can extend the schema without disabling it', async () => {
    const schema = {
      ...markdownSchema,
      tagNames: [...(markdownSchema.tagNames ?? []), 'custom-thing'],
    }
    const out = await renderToHtml('<custom-thing>x</custom-thing>', { sanitize: schema })
    expect(out).toContain('<custom-thing>')
  })
})

describe('sanitize: className is an allowlist, not an opening', () => {
  /** Every `tag.class` pair in a rendered tree. */
  async function classesOf(source: string, sanitize: false | undefined): Promise<Set<string>> {
    const tree = await renderToHast(source, {
      math: true,
      // The parameter is deliberately `false | undefined` — both halves are
      // under test — so the key is spread in only for the `false` case.
      ...(sanitize !== undefined ? { sanitize } : {}),
      resolveLink: (target: string): LinkResolution =>
        target === 'Nowhere'
          ? { kind: 'missing', display: target }
          : target === 'Site'
            ? { kind: 'external', path: 'https://example.com', display: target }
            : { kind: 'note', path: `/vault/${target}`, display: target },
    })
    const found = new Set<string>()
    visit(tree as never, 'element', (node: never) => {
      const element = node as { tagName?: string; properties?: Record<string, unknown> }
      const raw = element.properties?.className
      const list = Array.isArray(raw)
        ? raw.map(String)
        : typeof raw === 'string'
          ? raw.split(/\s+/)
          : []
      for (const name of list.filter(Boolean)) found.add(`${element.tagName}.${name}`)
    })
    return found
  }

  // A document exercising every dialect, GFM and math feature. If a new
  // feature starts emitting a class, this fails until the allowlist is
  // updated — which is the whole point of keeping the fixture around.
  const everyFeature = readFileSync(new URL('./fixtures/every-feature.md', import.meta.url), 'utf8')

  test('nothing the pipeline emits is lost to the schema', async () => {
    const emitted = await classesOf(everyFeature, false)
    const survived = await classesOf(everyFeature, undefined)
    const lost = [...emitted].filter((name) => !survived.has(name)).sort()
    expect(lost).toEqual([])
    // Guard against the fixture silently rendering to nothing.
    expect(emitted.size).toBeGreaterThan(10)
  })

  test('a note cannot dress a div as a full-viewport overlay', async () => {
    // The host is a Tailwind app; these utilities exist in its stylesheet.
    const out = await html('<div class="fixed inset-0 z-50 bg-white">FAKE UI</div>')
    expect(out).not.toContain('fixed')
    expect(out).not.toContain('inset-0')
    expect(out).not.toContain('bg-white')
    expect(out).toContain('FAKE UI')
  })

  test('classes are filtered one by one, not all-or-nothing', async () => {
    // `sr-only` rather than `language-ts`: a class the dialect ROUTES on is
    // stripped from note-authored markup before the schema ever sees it — see
    // `sanitize: routing signals are pipeline-only` below — so a class that
    // survives here has to be one nothing routes on.
    const out = await html('<span class="sr-only fixed hidden">x</span>')
    expect(out).toContain('sr-only')
    expect(out).not.toContain('fixed')
    expect(out).not.toContain('hidden')
  })

  test('the dialect classes the app styles all survive', async () => {
    const out = await html('[[Note]] #tag\n\n> [!note] T\n> b\n\n- [ ] task\n\n```ts\nx\n```')
    for (const name of [
      'class="wikilink"',
      'class="tag"',
      'class="callout"',
      'class="callout-title"',
      'class="callout-content"',
      'class="contains-task-list"',
      'class="task-list-item"',
      'class="language-ts"',
    ]) {
      expect(out).toContain(name)
    }
  })

  test('wikilink state classes survive', async () => {
    const out = await html('[[Nowhere]]', {
      resolveLink: () => ({ kind: 'missing', display: 'Nowhere' }),
    })
    expect(out).toContain('class="wikilink wikilink-missing"')
  })

  test('math and footnote classes survive', async () => {
    const out = await html('$x^2$ and a note[^1]\n\n[^1]: body', { math: true })
    expect(out).toContain('math-inline')
    expect(out).toContain('class="footnotes"')
    expect(out).toContain('sr-only')
    expect(out).toContain('data-footnote-backref')
  })
})

describe('sanitize: routing signals are pipeline-only', () => {
  // The class names and `data-lang` below are exactly what the Vue layer routes
  // on, and the schema allows every one of them — it has to, they are what the
  // pipeline's own markup is made of. So the provenance pair strips them off
  // note-authored markup instead: raw HTML keeps its tag, its text and its
  // other attributes, and reaches no component. See `src/routing-signals.ts`.

  test('a hand-written callout loses the class that would route it', async () => {
    const out = await html(
      '<div class="callout" data-callout="note"><div class="callout-title">T</div>body</div>',
    )
    expect(out).not.toContain('class="callout"')
    expect(out).not.toContain('callout-title')
    expect(out).toContain('body')
  })

  test('a hand-written wikilink anchor loses its class', async () => {
    const out = await html(
      '<a class="wikilink wikilink-missing" data-wikilink="X" data-path="/vault/X">label</a>',
    )
    expect(out).not.toContain('wikilink"')
    expect(out).not.toContain('wikilink-missing')
    expect(out).toContain('label')
  })

  test('a hand-written tag anchor loses its class', async () => {
    const out = await html('<a class="tag" data-tag="forged">label</a>')
    expect(out).not.toContain('class="tag"')
    expect(out).toContain('label')
  })

  test('a hand-written math-inline code element loses its class', async () => {
    const out = await html('<code class="math-inline">x</code>')
    expect(out).not.toContain('math-inline')
  })

  test('a hand-written data-lang is stripped', async () => {
    const out = await html('<pre data-lang="mermaid"><code>graph TD; A--&gt;B</code></pre>')
    expect(out).not.toContain('data-lang')
  })

  test('a hand-written language class is stripped, so the Shiki pass cannot re-stamp it', async () => {
    // `language-*` is a routing signal one step removed: the Shiki pass runs
    // after provenance and stamps `data-lang` from it, which would hand a
    // forged fence a `lang:` route. The cost is that raw
    // `<pre><code class="language-ts">` is no longer highlighted — which is
    // the point: dialect chrome is pipeline-produced only.
    const out = await renderToHtml('<pre><code class="language-ts">const x = 1</code></pre>', {
      highlight: rehypeShiki(),
    })
    expect(out).not.toContain('language-ts')
    expect(out).not.toContain('data-lang')
    expect(out).not.toContain('shiki')
    expect(out).toContain('const x = 1')
  })

  test('an markdown-* class a note mints is stripped', async () => {
    // The Vue layer's own namespace. The pipeline emits none of these itself,
    // so every one the enforce pass sees was written by a note.
    const out = await html('<div class="markdown-table-block">x</div>')
    expect(out).not.toContain('markdown-')
  })

  test('the pipeline keeps every one of them on its own markup', async () => {
    const out = await html(
      '[[Note]] #tag $x$\n\n> [!note] T\n> b\n\n```mermaid\ngraph TD; A-->B\n```',
      { math: true },
    )
    expect(out).toContain('class="wikilink"')
    expect(out).toContain('class="tag"')
    expect(out).toContain('class="callout"')
    expect(out).toContain('math-inline')
    expect(out).toContain('data-lang="mermaid"')
    expect(out).toContain('class="language-mermaid"')
  })

  test('a forgery beside the real thing only loses its own signals', async () => {
    const out = await html('[[Note]]\n\n<a class="wikilink" data-wikilink="forged">forged</a>')
    expect(out).toContain('<a class="wikilink" data-wikilink="Note"')
    expect(out).toContain('<a data-wikilink="forged">forged</a>')
  })
})

describe('sanitize: ids and names a note mints', () => {
  test('a note-authored id is namespaced, so it cannot shadow anything', async () => {
    const out = await html('<div id="app">clobber</div>')
    expect(out).toContain('id="user-content-app"')
    expect(out).not.toContain('id="app"')
  })

  test('a note cannot shadow a real heading anchor', async () => {
    const out = await html('# Real Title\n\n<div id="real-title">shadow</div>')
    expect(out).toContain('<h1 id="real-title"')
    expect(out).toContain('id="user-content-real-title"')
  })

  test('name is clobbered — window named-property clobbering needs it', async () => {
    for (const [source, forged] of [
      ['<img src="https://x/y.png" name="config">', 'config'],
      ['<a name="tokens">x</a>', 'tokens'],
    ] as const) {
      const out = await html(source)
      expect(out).toContain(`name="user-content-${forged}"`)
      expect(out).not.toContain(`name="${forged}"`)
    }
  })

  test('a note-authored id reference is namespaced along with the id it names', async () => {
    // `id` and the attributes that point at one move together, or the note's
    // own `aria-labelledby` dangles the moment its `id` is namespaced.
    const out = await html(
      '<p id="foo">label</p>\n\n<img src="https://x/a.png" aria-labelledby="foo">',
    )
    expect(out).toContain('id="user-content-foo"')
    expect(out).toContain('aria-labelledby="user-content-foo"')
    expect(out).not.toContain('aria-labelledby="foo"')
  })

  test('a note cannot point an id reference at a pipeline anchor', async () => {
    const out = await html('# Overview\n\n<img src="https://x/b.png" aria-describedby="overview">')
    expect(out).toContain('<h1 id="overview"')
    expect(out).toContain('aria-describedby="user-content-overview"')
    expect(out).not.toContain('aria-describedby="overview"')
  })

  test('`headers` is an id reference too, and moves with the id', async () => {
    // Same rule as the aria pair: the schema allows `headers` on every tag, so
    // a note's own reference has to follow its id, and cannot name a pipeline
    // anchor.
    const out = await html(
      '# Overview\n\n<table><tr><th id="h1">H</th><td headers="h1 overview">v</td></tr></table>',
    )
    expect(out).toContain('id="user-content-h1"')
    expect(out).toContain('headers="user-content-h1 user-content-overview"')
  })

  test('a note cannot mint an id through a forged fence block id', async () => {
    // `rehypeCodeMeta` copies a fence's block id onto its `<pre>` as a real
    // `id`; running it above the raw pass is what keeps a hand-written
    // `<pre><code data-block-id>` from reaching that code path at all.
    const out = await html('<pre><code data-block-id="app">x</code></pre>')
    expect(out).not.toContain(' id="app"')
    expect(out).not.toContain(' id="user-content-app"')
  })

  test('the pipeline’s own ids stay bare, so #heading and #^block still work', async () => {
    expect(await html('# Real Title')).toContain('<h1 id="real-title"')
    expect(await html('para ^blk')).toContain('id="blk"')
    expect(await html('```ts\nx\n```\n^fenceblk')).toContain('id="fenceblk"')
  })

  test('a note cannot shadow a footnote or its back-reference', async () => {
    // A note's ids are namespaced into `user-content-`; the pipeline's
    // footnote ids must sit outside that namespace, or `id="fn-1"` becomes
    // exactly the id the footnote reference jumps to.
    const out = await html(
      '<span id="fn-1">forged</span> <span id="fnref-1">forged</span>\n\nText[^1]\n\n[^1]: real note',
    )
    const ids = [...out.matchAll(/ id="([^"]+)"/g)].map((match) => match[1])
    expect(ids).toContain('user-content-fn-1')
    expect(ids).toContain('user-content-fnref-1')
    expect(new Set(ids).size).toBe(ids.length)
    const target = /<a href="#([^"]+)"[^>]*data-footnote-ref/.exec(out)?.[1]
    expect(target).toBeDefined()
    expect(out).toContain(`<li id="${target}"`)
  })

  test('footnote ids are not double-prefixed', async () => {
    const out = await html('text[^1]\n\n[^1]: body')
    expect(out).toContain('id="markdownRender_fn-1"')
    expect(out).toContain('href="#markdownRender_fn-1"')
    expect(out).not.toContain('user-content-')
    // `aria-describedby` points at this one, and remark-rehype leaves it bare —
    // so the reference has to stay bare too.
    expect(out).toContain('id="footnote-label"')
    expect(out).toContain('aria-describedby="footnote-label"')
  })

  test('a note-authored id cannot take over a footnote anchor', async () => {
    for (const forged of ['fn-1', 'fnref-1']) {
      const out = await html(`Text[^1]\n\n<span id="${forged}">evil</span>\n\n[^1]: note`)
      expect(out.match(new RegExp(`id="markdownRender_${forged}"`, 'g'))).toHaveLength(1)
      expect(out).not.toMatch(new RegExp(`<span id="markdownRender_${forged}"`))
    }
  })

  test('a note-authored id cannot take over a heading slugged into the namespace', async () => {
    const out = await html('# User content foo\n\n<div id="foo">shadow</div>')
    expect(out).toContain('<h1 id="user-content-foo"')
    expect(out.match(/id="user-content-foo"/g)).toHaveLength(1)
  })

  test('a note-authored reference cannot borrow a footnote anchor by namespacing', async () => {
    const out = await html(
      'Text[^1]\n\n<img src="https://x/a.png" aria-describedby="fn-1 mine">\n\n[^1]: note',
    )
    expect(out).toContain('aria-describedby="user-content-fn-1 user-content-mine"')
    expect(out).not.toMatch(/aria-describedby="[^"]*markdownRender_fn-1/)
  })

  test('a note-authored reference naming only pipeline anchors is removed, not emptied', async () => {
    // A heading slugged into the namespace is a pipeline anchor a reference
    // could otherwise borrow.
    const out = await html(
      '# User content foo\n\n<img src="https://x/a.png" aria-describedby="foo">',
    )
    expect(out).toMatch(/<img src="https:\/\/x\/a.png"[^>]*>/)
    expect(out).not.toMatch(/<img[^>]*aria-describedby/)
  })
})

describe('sanitize: input is pipeline-only too', () => {
  test('a hand-written checkbox never renders', async () => {
    // `data-line` is what tells the host which line of the file to rewrite, so
    // a checkbox dropped mid-prose is a note choosing a write target. GFM's
    // `- [ ]` is the only way to get one.
    const out = await html('prose\n\n<input type="checkbox" data-line="1">')
    expect(out).not.toContain('<input')
  })

  test('a hand-written input of any other kind never renders either', async () => {
    // The schema's `required` rule would turn this into a checkbox.
    const out = await html('<input type="text" name="q" value="pwn">')
    expect(out).not.toContain('<input')
  })

  test('a real task list still renders live checkboxes', async () => {
    const out = await html('- [ ] first\n- [x] second')
    expect(out.match(/<input/g)).toHaveLength(2)
    expect(out).toContain('checked')
  })
})
