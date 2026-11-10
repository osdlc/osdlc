import { describe, expect, test } from 'vitest'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createMarkdownProcessor, renderToHast, renderToHtml } from '../src/index.ts'
import { html, vaultResolver } from './helpers.ts'

const KITCHEN_SINK = `# Kitchen Sink

Prose with a [[Note]], a [[Folder/Other#Section|labelled link]], a [[Gone]],
a #project/alpha tag, some ==highlighted text==, and %%a comment%% removed. ^intro

> [!warning]- Fold me
> Body with a nested list:
>
> - one
> - two

![[diagram.png]]

![[Note#Section]]

| col | val |
| --- | --- |
| a   | 1   |

- [ ] open task
- [x] done task

\`\`\`ts
const answer = 42
\`\`\`

\`\`\`mermaid
graph TD; A --> B;
\`\`\`

Literal \`[[not a link]]\` and \`#nottag\` survive.

---

Final paragraph.
`

const options = {
  resolveLink: vaultResolver(['Note', 'Folder/Other', 'diagram.png']),
  notePath: 'Kitchen.md',
}

describe('pipeline', () => {
  test('the kitchen-sink document renders stably', async () => {
    expect(await renderToHtml(KITCHEN_SINK, options)).toMatchSnapshot()
  })

  test('every dialect feature is present in one pass', async () => {
    const out = await html(KITCHEN_SINK, options)
    expect(out).toContain('class="wikilink"')
    expect(out).toContain('wikilink-missing')
    expect(out).toContain('class="tag"')
    expect(out).toContain('<mark>')
    expect(out).toContain('class="callout"')
    expect(out).toContain('<markdown-embed')
    expect(out).toContain('data-block-id="intro"')
    expect(out).toContain('type="checkbox"')
    expect(out).not.toContain('a comment')
  })

  test('block elements carry data-line', async () => {
    const out = await html('one\n\ntwo\n\n# three\n\n- four')
    expect(out).toContain('data-line="1"')
    expect(out).toContain('data-line="3"')
    expect(out).toContain('data-line="5"')
    expect(out).toContain('data-line="7"')
  })

  test('a task list item carries data-line for editor round-tripping', async () => {
    const out = await html('intro\n\n- [ ] first\n- [x] second')
    expect(out).toMatch(/<li[^>]*data-line="3"/)
    expect(out).toMatch(/<li[^>]*data-line="4"/)
  })

  test('a code fence carries data-line and data-lang on the pre', async () => {
    const out = await html('text\n\n```python\nx = 1\n```')
    expect(out).toMatch(/<pre data-line="3" data-lang="python"/)
  })

  test('createMarkdownProcessor produces hast', async () => {
    const processor = createMarkdownProcessor()
    const tree = await processor.run(processor.parse('# hi'))
    expect((tree as { type: string }).type).toBe('root')
  })

  test('renderToHast and renderToHtml agree', async () => {
    const tree = await renderToHast('# hi', options)
    expect(tree.children.length).toBeGreaterThan(0)
    expect(await renderToHtml('# hi', options)).toContain('<h1')
  })

  test('math is off unless asked for', async () => {
    expect(await html('$a^2$')).not.toContain('math-inline')
    expect(await html('$a^2$', { math: true })).toContain('math-inline')
  })

  test('an empty document renders empty', async () => {
    expect(await html('')).toBe('')
  })

  test('the package is framework-free — no module imports Vue', async () => {
    const root = new URL('../src/', import.meta.url).pathname
    const offenders: string[] = []
    for (const relative of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
      if (!relative.endsWith('.ts')) continue
      const source = await readFile(`${root}${relative}`, 'utf8')
      if (/from ['"]vue['"]/.test(source)) offenders.push(relative)
    }
    expect(offenders).toEqual([])
  })

  test('renderToHtml is usable with no DOM and no host at all', async () => {
    const out = await renderToHtml('# SSR\n\n[[Note]] and ![[Note]]')
    expect(out).toContain('<h1 id="ssr"')
    expect(out).toContain('<markdown-embed')
  })
})
