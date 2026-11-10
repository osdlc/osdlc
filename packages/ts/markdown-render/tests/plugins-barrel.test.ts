import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { remarkCallouts, remarkWikilinks, type LinkResolution } from '../src/plugins/index.ts'

const resolveLink = (target: string): LinkResolution => {
  const display = target.split('/').pop() ?? target
  if (target === 'Note') return { kind: 'note', path: `/vault/${target}`, display }
  return { kind: 'missing', display }
}

describe('@osdlc/markdown-render/plugins', () => {
  test('plugins run in a bare unified pipeline without the render stack', async () => {
    const links = await unified()
      .use(remarkParse)
      .use(remarkWikilinks, { resolveLink })
      .use(remarkRehype)
      .use(rehypeStringify)
      .process('See [[Note|alias]] and [[Missing]].')
    const out = String(links)
    expect(out).toContain('class="wikilink"')
    expect(out).toContain('href="/vault/Note"')
    expect(out).toContain('>alias</a>')
    expect(out).toContain('class="wikilink wikilink-missing"')
    expect(out).toContain('data-kind="missing"')

    const callout = await unified()
      .use(remarkParse)
      .use(remarkCallouts)
      .use(remarkRehype)
      .use(rehypeStringify)
      .process('> [!note] Title\n> body')
    const html = String(callout)
    expect(html).toContain('class="callout"')
    expect(html).toContain('data-callout="note"')
    expect(html).toContain('<div class="callout-title">Title</div>')
    expect(html).toContain('body')
  })

  test('the subpath module graph holds no Shiki or Vue reference', async () => {
    const entry = resolve(import.meta.dirname, '../src/plugins/index.ts')
    const visited = walkRelativeGraph(entry)

    expect(visited.size).toBeGreaterThan(5)
    for (const file of visited) {
      // `code-meta.ts` is in the graph (it takes `fenceLang` from the
      // shiki-free `fence-lang.ts`), so the assertion is Shiki itself, by file
      // and by specifier — `from './shiki.ts'` does not contain `'shiki`, so the
      // specifier form needs its own pattern.
      expect(file).not.toMatch(/\/shiki\.ts$/)
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"][^'"]*shiki/)
      expect(source).not.toMatch(/from\s+['"]vue['"]/)
    }

    const names = Object.keys(await import('../src/plugins/index.ts'))
    for (const name of [
      'remarkWikilinks',
      'remarkCallouts',
      'remarkEmbeds',
      'remarkTags',
      'remarkHeadingIds',
      'setHProps',
      // Shiki-free, so the fence-metadata pass a self-assembling host needs
      // is in the barrel.
      'rehypeCodeMeta',
      'fenceLang',
    ]) {
      expect(names).toContain(name)
    }
    // The highlight pass and its config stay at `/shiki`.
    expect(names).not.toContain('rehypeShiki')
    expect(names).not.toContain('RESERVED_FENCE_LANGS')
  })
})

/** Follow relative `import`/`export … from` specifiers transitively. */
function walkRelativeGraph(entry: string): Set<string> {
  const visited = new Set<string>()
  const queue = [entry]
  const specifier = /(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g
  while (queue.length) {
    const file = queue.pop()!
    if (visited.has(file)) continue
    visited.add(file)
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(specifier)) {
      queue.push(resolve(dirname(file), match[1]!))
    }
  }
  return visited
}
