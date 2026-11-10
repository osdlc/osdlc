import { describe, expect, test, vi } from 'vitest'
import { fenceLang, renderToHast } from '../src/index.ts'
import { RESERVED_FENCE_LANGS, rehypeShiki } from '../src/shiki.ts'
import { html } from './helpers.ts'

interface TreeNode {
  type: string
  tagName?: string
  value?: unknown
  properties?: Record<string, unknown>
  children?: TreeNode[]
}

/** The text a `<pre>` holds, exactly as the DOM would report it. */
function textOf(node: TreeNode): string {
  if (node.type === 'text') return String(node.value ?? '')
  return (node.children ?? []).map(textOf).join('')
}

/** One shared pass: the option is compared by identity, so hosts hold one. */
const highlight = rehypeShiki()

function findPre(node: TreeNode): TreeNode | undefined {
  if (node.type === 'element' && node.tagName === 'pre') return node
  for (const child of node.children ?? []) {
    const found = findPre(child)
    if (found) return found
  }
  return undefined
}

/**
 * What the copy button would put on the clipboard.
 *
 * Mirrors `CodeBlock.ts` in `@osdlc/markdown-render-vue` exactly — `nodeText(pre)` with one
 * trailing newline off — so the two sides of the highlighted/plain comparison
 * are the strings a reader actually gets.
 */
async function copyText(markdown: string, highlighted: boolean): Promise<string> {
  const tree = (await renderToHast(markdown, {
    ...(highlighted ? { highlight } : {}),
  })) as unknown as TreeNode
  return textOf(findPre(tree)!).replace(/\n$/, '')
}

describe('rehypeShiki', () => {
  test('the first fence off a freshly loaded grammar is coloured correctly', async () => {
    // The JS regex engine's very first tokenization of a grammar mis-scopes the
    // tail of the fence: `export` keeps the keyword colour while `return`, four
    // tokens later, takes the parameter colour instead. Every pass after it is
    // right — so the defect lands squarely on the first code block a reader
    // ever sees, and disappears the moment anything renders twice.
    //
    // A theme pair no other test uses, so this really is a cold highlighter
    // with a cold `ts`, the way a freshly loaded page has one.
    const pass = rehypeShiki({
      themes: { light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' },
    })
    const tree = (await renderToHast(
      '```ts\nexport function f(x: number): number {\n  return x\n}\n```',
    )) as unknown as TreeNode
    await (pass as (tree: unknown) => Promise<void>)(tree)

    const spans: Array<{ text: string; light: string }> = []
    const walk = (node: TreeNode) => {
      const style = node.properties?.style
      if (typeof style === 'string' && style.includes('--shiki-light')) {
        spans.push({
          text: textOf(node).trim(),
          light: /--shiki-light:\s*([^;]+)/.exec(style)![1]!.trim(),
        })
      }
      for (const child of node.children ?? []) walk(child)
    }
    walk(tree)
    const colour = (text: string) => spans.find((span) => span.text === text)?.light

    // Named by the invariant rather than by a hex, so this survives a theme
    // change: the three keywords are one colour, whatever that colour is.
    expect(colour('export')).toBeDefined()
    expect(colour('function')).toBe(colour('export'))
    expect(colour('return')).toBe(colour('export'))
  })

  test('a known language is highlighted with both themes as custom properties', async () => {
    const out = await html('```ts\nconst a = 1\n```', { highlight })
    expect(out).toContain('shiki')
    expect(out).toContain('--shiki-light')
    expect(out).toContain('--shiki-dark')
  })

  test('highlighting preserves the source line and the language', async () => {
    const out = await html('text\n\n```ts\nconst a = 1\n```', { highlight })
    expect(out).toMatch(/<pre[^>]*data-line="3"/)
    expect(out).toMatch(/<pre[^>]*data-lang="ts"/)
  })

  test("highlighting preserves a fence's block anchor", async () => {
    // Shiki's `<pre>` properties replace the fence's wholesale, so a `^block-id`
    // the block-id pass minted is exactly the kind of thing that goes missing
    // the moment highlighting is switched on.
    const md = '```ts\nconst a = 1\n```\n\n^codeid'
    const plain = await html(md)
    expect(plain).toMatch(/<pre[^>]*id="codeid"/)
    expect(plain).toMatch(/<pre[^>]*data-block-id="codeid"/)

    const out = await html(md, { highlight })
    expect(out).toContain('--shiki-light')
    expect(out).toMatch(/<pre[^>]*id="codeid"/)
    expect(out).toMatch(/<pre[^>]*data-block-id="codeid"/)
  })

  test('a mermaid fence is left for the block renderer', async () => {
    const out = await html('```mermaid\ngraph TD; A-->B;\n```', { highlight })
    expect(out).not.toContain('--shiki-light')
    expect(out).toContain('data-lang="mermaid"')
    expect(out).toContain('graph TD')
  })

  test('a base fence is left for the block renderer', async () => {
    const out = await html('```base\nfilters: {}\n```', { highlight })
    expect(out).not.toContain('--shiki-light')
    expect(out).toContain('data-lang="base"')
  })

  test('an unknown language renders plain rather than failing', async () => {
    const out = await html('```not-a-real-language\nx\n```', { highlight })
    expect(out).not.toContain('--shiki-light')
    expect(out).toContain('x')
  })

  test('a fence ending in blank lines copies byte-identically either way', async () => {
    // Shiki is handed the fence text with its final newline off, or it draws an
    // extra empty line at the bottom of every block. That newline has to go
    // back on: without it the highlighted fence is one trailing line shorter
    // than the plain one, in the block and on the clipboard both, and the
    // feature's promise of the exact original source is false.
    for (const source of [
      '```ts\nconst a = 1\n```',
      '```ts\nconst a = 1\n\n```',
      '```ts\nconst a = 1\n\n\n```',
      '```ts\nconst a = 1\n\nconst b = 2\n```',
      '```ts\n  const a = 1\n\tconst b = 2\n\n```',
    ]) {
      expect(await copyText(source, true)).toBe(await copyText(source, false))
    }

    // Non-vacuous: the blank line is really in there to be lost.
    expect(await copyText('```ts\nconst a = 1\n\n```', true)).toBe('const a = 1\n')
  })

  test('a highlighter that fails to load leaves the note rendering, with plain fences', async () => {
    // The damage is never one bad fence. An unguarded rejection propagates out
    // of `processor.run()`, so the host renders its error card INSTEAD OF the
    // note body — and the rejected promise stays in the highlighter cache, so
    // every later note with a fence is broken for the life of the page.
    const real = await import('shiki/themes')
    let failNext = true
    // Transparent once it has failed the one time, so the rest of the suite
    // sees the real record. A pair no other test uses, so nothing else can
    // spend the failure.
    vi.doMock('shiki/themes', () => ({
      bundledThemes: new Proxy(real.bundledThemes, {
        get(target: object, id: string | symbol) {
          if (id === 'github-light-default' && failNext) {
            failNext = false
            return () => Promise.reject(new Error('chunk load failed'))
          }
          return Reflect.get(target, id)
        },
      }),
    }))

    const pass = rehypeShiki({
      themes: { light: 'github-light-default', dark: 'github-dark-default' },
    })
    const source = 'prose above\n\n```ts\nconst a = 1\n```\n\nprose below'
    const render = async () => {
      const tree = (await renderToHast(source)) as unknown as TreeNode
      // Resolving at all is half the assertion: a rejection here is the error
      // card. The other half is that the note survived intact.
      await (pass as (tree: unknown) => Promise<void>)(tree)
      const pre = findPre(tree)!
      return { doc: textOf(tree), pre }
    }

    const failed = await render()
    expect(failed.pre.properties?.style).toBeUndefined()
    expect(textOf(failed.pre)).toBe('const a = 1\n')
    expect(failed.pre.properties?.dataLang).toBe('ts')
    expect(failed.doc).toContain('prose above')
    expect(failed.doc).toContain('prose below')

    // And the failure is not cached: the next render retries and highlights,
    // rather than inheriting the poisoned promise.
    const recovered = await render()
    expect(String(recovered.pre.properties?.style)).toContain('--shiki-light')
  })

  test('a fence with no language renders plain', async () => {
    const out = await html('```\nplain text\n```', { highlight })
    expect(out).not.toContain('--shiki-light')
    expect(out).toContain('plain text')
  })

  test('highlighting is off by default', async () => {
    const out = await html('```ts\nconst a = 1\n```')
    expect(out).not.toContain('shiki')
    expect(out).toContain('<code class="language-ts">')
  })

  test('fenceLang reads the language off the code element', () => {
    expect(fenceLang({ type: 'element', properties: { className: ['language-ts'] } })).toBe('ts')
    expect(fenceLang({ type: 'element', properties: { className: ['other'] } })).toBeUndefined()
    expect(fenceLang({ type: 'element' })).toBeUndefined()
  })

  test('mermaid and base are reserved', () => {
    expect(RESERVED_FENCE_LANGS.has('mermaid')).toBe(true)
    expect(RESERVED_FENCE_LANGS.has('base')).toBe(true)
  })

  // Last in the file, and the real module is put back in a `finally`: vitest
  // shares one process across every test file, so a leaked module mock would
  // reach whatever runs next.
  test('a grammar is tokenized twice on its first fence and once after', async () => {
    // The colour assertion at the top of this file states the invariant; this
    // states the mechanism, which the colour test can only catch by luck —
    // the mis-scoped first tokenization is what a reader sees, and whether it
    // reaches them depends on which grammar settled first in the process.
    const langs: string[] = []
    const fence = (source: string) => ({
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'pre',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {},
              children: [{ type: 'text', value: source }],
            },
          ],
        },
      ],
    })
    vi.doMock('shiki/core', () => ({
      createHighlighterCore: async () => ({
        getLoadedLanguages: () => [],
        loadLanguage: async () => {},
        codeToHast: (source: string, options: { lang: string }) => {
          langs.push(options.lang)
          return fence(source)
        },
      }),
    }))

    try {
      // A theme pair no other test uses, so this really is a cold highlighter.
      const pass = rehypeShiki({ themes: { light: 'vitesse-light', dark: 'vitesse-dark' } })
      const run = async (markdown: string) => {
        const tree = (await renderToHast(markdown)) as unknown as TreeNode
        await (pass as (tree: unknown) => Promise<void>)(tree)
      }

      // Two fences of one grammar: the first settles it, the second does not.
      await run('```ts\nconst a = 1\n```\n\n```ts\nconst b = 2\n```')
      expect(langs).toEqual(['ts', 'ts', 'ts'])

      // And a later document pays nothing.
      langs.length = 0
      await run('```ts\nconst c = 3\n```')
      expect(langs).toEqual(['ts'])
    } finally {
      vi.doUnmock('shiki/core')
    }
  })

  test('a `constructor` fence does not break later grammars', async () => {
    // `bundledLanguages.constructor` is `Object`, inherited from the prototype.
    // Loading it put a broken entry in the shared registry, after which every
    // new grammar on that highlighter failed. A theme pair no other test uses,
    // so python is not loaded yet.
    const pass = rehypeShiki({ themes: { light: 'min-light', dark: 'min-dark' } })
    const first = await html('```constructor\nx\n```', { highlight: pass })
    expect(first).not.toContain('class="shiki')
    const out = await html('```python\nx = 1\n```', { highlight: pass })
    expect(out).toContain('class="shiki')
  }, 60_000)
})
