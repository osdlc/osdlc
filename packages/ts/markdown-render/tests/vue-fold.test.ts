// @vitest-environment jsdom
/**
 * Fold-from-a-heading and fold-from-a-bullet (R-02), mounted against
 * jsdom — the same style as `vue-components.test.ts`, kept in its own
 * file since this feature touches its own prop/event contract end to end.
 */

import { markdownVue, vue } from './setup-dom.ts'
import { afterEach, describe, expect, test } from 'vitest'
import type { App } from 'vue'

const { createApp, defineComponent, h, ref } = vue
const { MarkdownRender } = markdownVue

let app: App | null = null

afterEach(() => {
  app?.unmount()
  app = null
})

/** Mount `<MarkdownRender>` and wait for the render, no `NoteSource` needed. */
async function mount(
  props: Record<string, unknown>,
  listeners: Record<string, unknown> = {},
): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const Wrapper = defineComponent({
    setup: () => () => h(MarkdownRender, { ...props, ...listeners } as never),
  })
  app = createApp(Wrapper)
  app.mount(host)
  await settle(host)
  return host
}

/**
 * A mount whose `foldedHeadings`/`foldedLists` are genuinely CONTROLLED: the
 * component's own `fold-toggle` feeds back into the sets that are handed back
 * down as props, the same round trip a real host (`useNoteFoldMemory`) makes.
 * Proves the toggle actually changes what is on screen, not just that it
 * emits.
 */
async function mountControlled(
  source: string,
  seeds: { headings?: string[]; lists?: number[] } = {},
): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const headings = ref(new Set(seeds.headings ?? []))
  const lists = ref(new Set(seeds.lists ?? []))
  const Wrapper = defineComponent({
    setup() {
      return () =>
        h(MarkdownRender, {
          source,
          foldable: true,
          foldedHeadings: headings.value,
          foldedLists: lists.value,
          onFoldToggle: (payload: {
            kind: string
            id?: string
            line?: number
            folded: boolean
          }) => {
            if (payload.kind === 'heading' && payload.id) {
              const next = new Set(headings.value)
              if (payload.folded) next.add(payload.id)
              else next.delete(payload.id)
              headings.value = next
            } else if (payload.kind === 'list' && payload.line !== undefined) {
              const next = new Set(lists.value)
              if (payload.folded) next.add(payload.line)
              else next.delete(payload.line)
              lists.value = next
            }
          },
        } as never)
    },
  })
  app = createApp(Wrapper)
  app.mount(host)
  await settle(host)
  return host
}

async function settle(host: HTMLElement, ticks = 40): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1))
    if (host.querySelector('.markdown-render')?.childNodes.length) break
  }
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 2))
}

function click(el: Element | null): void {
  el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

describe('heading sections', () => {
  const SOURCE = '# One\n\nBody one.\n\n## Two\n\nBody two.\n'

  test('an empty (default) fold set renders every section open', async () => {
    const host = await mount({ source: SOURCE, foldable: true })
    expect(host.querySelectorAll('.markdown-heading-fold-toggle')).toHaveLength(2)
    expect(host.textContent).toContain('Body one.')
    expect(host.textContent).toContain('Body two.')
    expect(host.querySelector('.markdown-heading-section.is-collapsed')).toBeNull()
  })

  test('the heading element itself is unchanged: id, text, tag', async () => {
    const host = await mount({ source: SOURCE, foldable: true })
    const h1 = host.querySelector('h1')!
    expect(h1.id).toBe('one')
    expect(h1.textContent).toBe('One')
  })

  test('clicking a toggle emits fold-toggle and hides that section’s body from the DOM', async () => {
    const host = await mountControlled(SOURCE)

    const section = host.querySelector('.markdown-heading-section')!
    click(section.querySelector('.markdown-heading-fold-toggle'))
    await settle(host)

    // Not just hidden — actually not rendered, which is what lets scroll
    // restore's `[data-line]` query see the fold at all (R-02 item 7).
    expect(host.textContent).not.toContain('Body one.')
    // "Two" (depth 2) sits inside "One"'s (depth 1) body and disappears with it.
    expect(host.querySelector('#two')).toBeNull()
    expect(host.querySelector('.markdown-heading-section.is-collapsed')).not.toBeNull()
    // The heading itself is still there — only what follows it folded.
    expect(host.querySelector('h1')).not.toBeNull()
  })

  test('a note reopens already collapsed with no flash: initial render honours foldedHeadings', async () => {
    const host = await mount({ source: SOURCE, foldable: true, foldedHeadings: new Set(['one']) })
    expect(host.textContent).not.toContain('Body one.')
    expect(host.querySelector('.markdown-heading-section.is-collapsed')).not.toBeNull()
    expect(
      host.querySelector('button.markdown-heading-fold-toggle')?.getAttribute('aria-expanded'),
    ).toBe('false')
  })

  test('clicking a collapsed section reports folded:false', async () => {
    const seen: Array<{ folded: boolean }> = []
    const host = await mount(
      { source: SOURCE, foldable: true, foldedHeadings: new Set(['one']) },
      { onFoldToggle: (p: never) => seen.push(p) },
    )
    click(host.querySelector('.markdown-heading-fold-toggle'))
    expect(seen).toEqual([{ kind: 'heading', id: 'one', folded: false } as never])
  })

  test('every heading gets its own toggle, independent of its ancestor', async () => {
    // "Two" is only reachable once "One" is open — its own toggle exists
    // regardless, proving the recursion in `renderHeadingSections`.
    const host = await mount({ source: SOURCE, foldable: true })
    const sections = [...host.querySelectorAll('.markdown-heading-section')]
    expect(sections).toHaveLength(2)
  })

  test('a document with no headings renders exactly as before: no wrapper at all', async () => {
    const host = await mount({ source: 'just a paragraph\n', foldable: true })
    expect(host.querySelector('.markdown-heading-section')).toBeNull()
    expect(host.textContent).toContain('just a paragraph')
  })

  test('an embedded note’s own headings are not foldable — outermost only', async () => {
    const source: Record<string, string> = {
      '/vault/Host': '![[Child]]',
      '/vault/Child': '# Inner\n\nInner body.\n\n- parent\n  - child\n',
    }
    const noteSource = {
      resolveLink: (target: string) => ({
        kind: 'note' as const,
        path: `/vault/${target}`,
        display: target,
      }),
      loadNote: async (path: string) => {
        const body = source[path]
        return body === undefined ? null : { body }
      },
      assetUrl: () => null,
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const Wrapper = defineComponent({
      setup() {
        markdownVue.provideNoteSource(noteSource)
        return () =>
          h(MarkdownRender, {
            source: source['/vault/Host'],
            notePath: '/vault/Host',
            foldable: true,
          } as never)
      },
    })
    app = createApp(Wrapper)
    app.mount(host)
    await settle(host)
    await settle(host)

    expect(host.querySelector('h1')?.textContent).toBe('Inner')
    // The embed's own render never wraps its heading — no fold chrome inside
    // a transclusion, for lists as much as for headings: an embedded note's
    // source lines are its own, and would key against the host's `foldedLists`.
    expect(host.querySelector('.markdown-heading-section')).toBeNull()
    expect(host.querySelector('.markdown-heading-fold-toggle')).toBeNull()
    expect(host.textContent).toContain('child')
    expect(host.querySelector('.markdown-list-fold-toggle')).toBeNull()
    expect(host.querySelector('.markdown-list-foldable')).toBeNull()
  })

  test('a heading with no id gets its section but no toggle', async () => {
    // A bare `##` slugs to the empty string. A toggle there could only report
    // `''`, which the host would persist as a fold that folds nothing.
    const host = await mount({ source: '##\n\nBody.\n', foldable: true })
    expect(host.querySelector('h2')?.id).toBe('')
    expect(host.querySelector('.markdown-heading-section')).not.toBeNull()
    expect(host.querySelector('.markdown-heading-fold-toggle')).toBeNull()
    expect(host.textContent).toContain('Body.')
  })

  test('folding the last section keeps the document’s footnotes', async () => {
    // remark-rehype appends `<section data-footnotes>` after all content, so a
    // naive partition puts it in the LAST heading's body. It belongs to the
    // whole document: a reference in an open section must keep its target.
    const host = await mount({
      source: '## A\n\nClaim[^1]\n\n## B\n\nOther text\n\n[^1]: The source\n',
      foldable: true,
      foldedHeadings: new Set(['b']),
    })
    expect(host.textContent).not.toContain('Other text')
    expect(host.querySelector('a[href="#markdownRender_fn-1"]')).not.toBeNull()
    expect(host.querySelector('#markdownRender_fn-1')).not.toBeNull()
    expect(host.querySelector('#footnote-label')).not.toBeNull()
    expect(
      host.querySelector('section[data-footnotes]')?.closest('.markdown-heading-section'),
    ).toBeNull()
  })

  test('footnotes that are not the last top-level node still stay outside every fold', async () => {
    // A later plugin may append a node after `<section data-footnotes>`. The
    // footnotes still belong to the whole document, so folding the section
    // above them must not hide them, and the trailing node keeps its place.
    const { renderHeadingSections } = await import('../src/vue/heading-sections.ts')
    const el = (tagName: string, properties: Record<string, unknown>, text?: string) => ({
      type: 'element',
      tagName,
      properties,
      children: text === undefined ? [] : [{ type: 'text', value: text }],
    })
    const footnotes = {
      ...el('section', { dataFootnotes: true }),
      children: [el('li', { id: 'markdownRender_fn-1' }, 'The source')],
    }
    const children = [
      el('h2', { id: 'a' }, 'A'),
      el('p', {}, 'Claim'),
      el('h2', { id: 'b' }, 'B'),
      el('p', {}, 'Other text'),
      footnotes,
      el('p', {}, 'Trailer'),
    ]
    const host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(
      defineComponent({
        setup: () => () =>
          h('div', {}, [
            ...renderHeadingSections(
              children as never,
              { components: {} },
              { folded: new Set(['b']), onToggle: () => {} },
            ),
          ]),
      }),
    )
    app.mount(host)
    expect(host.textContent).not.toContain('Other text')
    expect(host.querySelector('#markdownRender_fn-1')).not.toBeNull()
    expect(
      host.querySelector('section[data-footnotes]')?.closest('.markdown-heading-section'),
    ).toBeNull()
    expect(host.textContent!.indexOf('The source')).toBeLessThan(
      host.textContent!.indexOf('Trailer'),
    )
  })

  test('two headings that slug alike fold independently', async () => {
    // `## Setup` twice is `setup` and `setup-1`, so one fold set entry can
    // never take both sections with it.
    const host = await mountControlled('## Setup\n\nAlpha.\n\n## Setup\n\nBravo.\n')
    expect(host.querySelector('#setup')).not.toBeNull()
    expect(host.querySelector('#setup-1')).not.toBeNull()

    click(host.querySelector('.markdown-heading-fold-toggle'))
    await settle(host)

    expect(host.textContent).not.toContain('Alpha.')
    expect(host.textContent).toContain('Bravo.')
    expect(host.querySelectorAll('.markdown-heading-section.is-collapsed')).toHaveLength(1)
  })
})

describe('list item folds', () => {
  const FLAT = '- one\n- two\n- three\n'
  const NESTED = '- parent\n  - child one\n  - child two\n- sibling\n'

  test('a plain list with no nesting is completely unchanged: no wrapper, no toggle', async () => {
    const host = await mount({ source: FLAT, foldable: true })
    expect(host.querySelectorAll('li')).toHaveLength(3)
    expect(host.querySelector('.markdown-list-fold-toggle')).toBeNull()
    expect(host.querySelector('.markdown-list-foldable')).toBeNull()
  })

  test('a list item with a nested list gets a toggle; a sibling with none does not', async () => {
    const host = await mount({ source: NESTED, foldable: true })
    const items = [...host.querySelectorAll('.markdown-render > ul > li')]
    expect(items).toHaveLength(2)
    const [parent, sibling] = items
    expect(parent!.querySelector('.markdown-list-fold-toggle')).not.toBeNull()
    expect(sibling!.querySelector('.markdown-list-fold-toggle')).toBeNull()
    expect(parent!.classList.contains('markdown-list-foldable')).toBe(true)
    expect(sibling!.classList.contains('markdown-list-foldable')).toBe(false)
  })

  test('an empty fold set renders the nested list open', async () => {
    const host = await mount({ source: NESTED, foldable: true })
    expect(host.textContent).toContain('child one')
    expect(host.textContent).toContain('child two')
  })

  test('the toggle emits fold-toggle with kind, source line and the new state', async () => {
    const seen: Array<{ kind: string; line: number; folded: boolean }> = []
    const host = await mount(
      { source: NESTED, foldable: true },
      { onFoldToggle: (p: never) => seen.push(p) },
    )

    click(host.querySelector('.markdown-list-fold-toggle'))

    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({ kind: 'list', line: 1, folded: true })
  })

  test('clicking the toggle actually hides the sub-list from the DOM', async () => {
    const host = await mountControlled(NESTED)

    click(host.querySelector('.markdown-list-fold-toggle'))
    await settle(host)

    expect(host.textContent).not.toContain('child one')
    expect(host.textContent).toContain('sibling')
  })

  test('foldedLists collapses on the first render — no flash of open content', async () => {
    // Line 1 is `- parent`, the source line a folded list item keys on.
    const host = await mount({ source: NESTED, foldable: true, foldedLists: new Set([1]) })
    expect(host.textContent).not.toContain('child one')
    expect(host.querySelector('.markdown-list-foldable.is-collapsed')).not.toBeNull()
  })

  test('an unresolvable fold line (the line was never rendered) is silently harmless', async () => {
    const host = await mount({ source: NESTED, foldable: true, foldedLists: new Set([9_999]) })
    // Nothing in the document has that line, so nothing is folded.
    expect(host.textContent).toContain('child one')
  })

  test('a nested list several levels deep is still foldable', async () => {
    const source = '- a\n  - b\n    - c\n      - d\n'
    const host = await mount({ source, foldable: true })
    expect(host.querySelectorAll('.markdown-list-fold-toggle').length).toBeGreaterThanOrEqual(3)
  })

  // `listItem[paragraph, list, paragraph]` and `[paragraph, list, paragraph,
  // list]` are both ordinary CommonMark. Neither may be reordered or dropped.
  const TRAILING = '- top\n  - one\n\n  after\n'
  const TWO_SUBLISTS = '- top\n  - one\n\n  middle\n\n  - two\n'

  test('a paragraph that follows a sub-list keeps its place after it', async () => {
    const host = await mount({ source: TRAILING, foldable: true })
    const item = host.querySelector('li.markdown-list-foldable')!
    expect([...item.children].map((el) => el.tagName.toLowerCase())).toEqual([
      'p',
      'button',
      'ul',
      'p',
    ])
    expect(item.lastElementChild?.textContent).toBe('after')
  })

  test('a closed item keeps its trailing paragraph and loses only the sub-list', async () => {
    const host = await mount({ source: TRAILING, foldable: true, foldedLists: new Set([1]) })
    expect(host.textContent).not.toContain('one')
    expect(host.textContent).toContain('after')
  })

  test('an item with two sub-lists renders both, in order', async () => {
    const host = await mount({ source: TWO_SUBLISTS, foldable: true })
    const item = host.querySelector('li.markdown-list-foldable')!
    expect([...item.children].map((el) => el.tagName.toLowerCase())).toEqual([
      'p',
      'button',
      'ul',
      'p',
      'ul',
    ])
    expect(host.textContent).toContain('one')
    expect(host.textContent).toContain('two')
  })

  test('closing an item with two sub-lists hides both — one item, one toggle', async () => {
    const host = await mount({ source: TWO_SUBLISTS, foldable: true, foldedLists: new Set([1]) })
    expect(host.textContent).not.toContain('one')
    expect(host.textContent).not.toContain('two')
    // Everything that is not a sub-list stays exactly where it was.
    expect(host.textContent).toContain('top')
    expect(host.textContent).toContain('middle')
  })

  test('a raw-HTML nested list item has no source line, so it gets no toggle', async () => {
    // `remarkDataLine` stamps mdast blocks only; an `<li>` from raw HTML has no
    // `data-line`, so a toggle there could never report a fold. No affordance
    // rather than a dead one — the markdown item beside it still folds.
    const source =
      'Intro\n\n<ul>\n<li>Parent\n<ul><li>Child</li></ul>\n</li>\n</ul>\n\n- md parent\n  - md child\n'
    const host = await mount({ source, foldable: true })
    const toggles = host.querySelectorAll('.markdown-list-fold-toggle')
    expect(toggles).toHaveLength(1)
    expect(toggles[0]!.closest('li')?.textContent).toContain('md parent')
    expect(host.querySelectorAll('.markdown-list-foldable')).toHaveLength(1)
    expect(host.textContent).toContain('Child')
  })
})

describe('foldable is opt-in', () => {
  const SOURCE = '# One\n\nBody one.\n\n- parent\n  - child\n- plain\n'

  test('with no `foldable`, a note renders with no fold chrome at all', async () => {
    const host = await mount({ source: SOURCE })
    expect(host.querySelector('.markdown-heading-section')).toBeNull()
    expect(host.querySelector('.markdown-heading-fold-toggle')).toBeNull()
    expect(host.querySelector('.markdown-list-fold-toggle')).toBeNull()
    expect(host.querySelector('.markdown-list-foldable')).toBeNull()
    // The document itself is untouched: heading straight under the root, and
    // every list item still there.
    expect(host.querySelector('.markdown-render > h1')?.id).toBe('one')
    expect(host.querySelectorAll('li')).toHaveLength(3)
    expect(host.textContent).toContain('child')
  })

  test('the fold props alone do not turn folding on', async () => {
    const host = await mount({
      source: SOURCE,
      foldedHeadings: new Set(['one']),
      foldedLists: new Set([5]),
    })
    expect(host.textContent).toContain('Body one.')
    expect(host.textContent).toContain('child')
    expect(host.querySelector('.markdown-heading-fold-toggle')).toBeNull()
  })
})
