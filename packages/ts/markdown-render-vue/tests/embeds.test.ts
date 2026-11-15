// @vitest-environment jsdom
import { markdownVue, vue } from './setup-dom.ts'
import { afterEach, describe, expect, test } from 'vitest'
import type { App } from 'vue'
import { html, vaultResolver } from './helpers.ts'
import { embedKind, isMediaKind, markdownSchema, type LinkResolution } from '@osdlc/markdown-render'
import type { NoteSource } from '../src/context.ts'

const resolveLink = vaultResolver(['Note', 'Folder/Other', 'diagram.png'])

describe('remarkEmbeds', () => {
  test('a note embed becomes a markdown-embed element', async () => {
    const out = await html('![[Note]]', { resolveLink })
    expect(out).toContain('<markdown-embed')
    expect(out).toContain('data-embed-target="Note"')
    expect(out).toContain('data-embed-kind="note"')
    expect(out).toContain('data-embed-path="/vault/Note"')
  })

  test('an image extension makes it an image embed', async () => {
    const out = await html('![[diagram.png]]', { resolveLink })
    expect(out).toContain('data-embed-kind="image"')
  })

  test('a heading fragment makes it a heading embed', async () => {
    const out = await html('![[Note#Section]]', { resolveLink })
    expect(out).toContain('data-embed-kind="heading"')
    expect(out).toContain('data-embed-heading="Section"')
  })

  test('a block fragment makes it a block embed', async () => {
    const out = await html('![[Note#^abc123]]', { resolveLink })
    expect(out).toContain('data-embed-kind="block"')
    expect(out).toContain('data-embed-block-id="abc123"')
  })

  test('a display alias is carried through', async () => {
    const out = await html('![[diagram.png|300]]', { resolveLink })
    expect(out).toContain('data-embed-display="300"')
  })

  test('a missing embed records the resolution but no path', async () => {
    const out = await html('![[Gone]]', { resolveLink })
    expect(out).toContain('data-resolved-kind="missing"')
    expect(out).not.toContain('data-embed-path')
  })

  test('an embed alone in a paragraph is unwrapped to block level', async () => {
    const out = await html('![[Note]]', { resolveLink })
    expect(out).not.toContain('<p')
  })

  test('an inline embed stays inside its paragraph', async () => {
    const out = await html('see ![[Note]] here', { resolveLink })
    expect(out).toContain('<p')
    expect(out).toContain('<markdown-embed')
  })

  test('embeds in a code fence are NOT tokenized', async () => {
    const out = await html('```\n![[Note]]\n```', { resolveLink })
    expect(out).not.toContain('markdown-embed')
  })

  test('embedKind classifies without a resolver opinion', () => {
    expect(embedKind('a.png', {}, 'note')).toBe('image')
    expect(embedKind('a', { heading: 'H' }, 'note')).toBe('heading')
    expect(embedKind('a', { blockId: 'b' }, 'note')).toBe('block')
    expect(embedKind('a', {}, 'attachment')).toBe('image')
    expect(embedKind('a', {}, 'note')).toBe('note')
  })

  test('an empty `![[]]` stays literal rather than embedding the current note', async () => {
    for (const source of ['![[]]', '![[ ]]', '![[|x]]']) {
      const out = await html(`a ${source} b`, { notePath: 'Self.md' })
      expect(out).not.toContain('markdown-embed')
      expect(out).toContain(`a ${source} b`)
    }
  })
})

describe('remarkEmbeds: media types are classified, not lumped into image', () => {
  test('video, audio and pdf get their own kinds', async () => {
    expect(await html('![[talk.mp4]]', { resolveLink })).toContain('data-embed-kind="video"')
    expect(await html('![[song.mp3]]', { resolveLink })).toContain('data-embed-kind="audio"')
    expect(await html('![[paper.pdf]]', { resolveLink })).toContain('data-embed-kind="pdf"')
  })

  test('embedKind classifies each extension family', () => {
    for (const ext of ['mp4', 'webm', 'ogv', 'mov', 'mkv']) {
      expect(embedKind(`a.${ext}`, {}, 'note')).toBe('video')
    }
    for (const ext of ['mp3', 'wav', 'm4a', '3gp', 'flac', 'ogg', 'oga', 'opus']) {
      expect(embedKind(`a.${ext}`, {}, 'note')).toBe('audio')
    }
    expect(embedKind('a.pdf', {}, 'note')).toBe('pdf')
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp', 'ico']) {
      expect(embedKind(`a.${ext}`, {}, 'note')).toBe('image')
    }
  })

  test('an untypeable attachment still falls back to image', () => {
    expect(embedKind('a', {}, 'attachment')).toBe('image')
  })

  test('a media extension wins over a fragment', () => {
    // `![[doc.pdf#page=3]]` is Obsidian's PDF page syntax, not a section.
    expect(embedKind('a.pdf', { heading: 'page=3' }, 'note')).toBe('pdf')
    expect(embedKind('a.mp4', { heading: 'H' }, 'note')).toBe('video')
    expect(embedKind('a.png', { blockId: 'b' }, 'note')).toBe('image')
    expect(embedKind('a', { heading: 'H' }, 'attachment')).toBe('heading')
  })

  test('isMediaKind names the kinds that render a file rather than a note', () => {
    for (const kind of ['image', 'video', 'audio', 'pdf']) expect(isMediaKind(kind)).toBe(true)
    for (const kind of ['note', 'heading', 'block']) expect(isMediaKind(kind)).toBe(false)
  })
})

/**
 * What crosses the transclusion boundary, mounted.
 *
 * `Embed` renders the embedded note with a *nested*
 * `<MarkdownRender>`, which builds its own pipeline and provides its own
 * handlers. Everything the host configured therefore has to be carried across
 * by hand — and everything that means something different on the other side
 * must NOT be.
 */
describe('Embed: the host configuration crosses the boundary', () => {
  const { createApp, defineComponent, h } = vue
  const { MarkdownRender, provideNoteSource } = markdownVue

  const NOTES: Record<string, string> = {
    '/vault/Note': 'Note body.',
    '/vault/Inner': 'A link to [[Note]] and a #inner tag.',
    '/vault/Bold': 'Some **bold** text.',
    '/vault/Math': 'Euler: $e^{i\\pi}$ here.',
    '/vault/Tasks': '- [ ] inner task',
  }

  const noteSource: NoteSource = {
    resolveLink(target: string): LinkResolution {
      const path = `/vault/${target}`
      const display = target.split('/').pop() ?? target
      return path in NOTES ? { kind: 'note', path, display } : { kind: 'missing', display }
    },
    async loadNote(path) {
      const body = NOTES[path]
      return body === undefined ? null : { body }
    },
    assetUrl: (target) => `/assets/${target}`,
  }

  let apps: App[] = []

  afterEach(() => {
    for (const app of apps) app.unmount()
    apps = []
  })

  /** Mount `<MarkdownRender>` and wait for the transclusion to paint. */
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
    const app = createApp(Wrapper)
    apps.push(app)
    app.mount(host)
    for (let i = 0; i < 150; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2))
      if (host.querySelector('.markdown-embed-note')?.textContent) break
    }
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 2))
    return host
  }

  function click(el: Element): void {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  }

  test("the host's components override applies inside a transclusion", async () => {
    const Plain = defineComponent({
      name: 'Plain',
      props: { node: { type: Object, required: true } },
      setup: () => () => h('span', { class: 'plain-link' }, 'x'),
    })
    const host = await mount({
      source: '![[Inner]]',
      notePath: '/vault/Host',
      components: { 'a.wikilink': Plain },
    })
    expect(host.querySelector('.markdown-embed-note .plain-link')).not.toBeNull()
    expect(host.querySelector('.markdown-embed-note a.wikilink')).toBeNull()
  })

  test('a host sanitize schema stricter than the default applies to transcluded content', async () => {
    // The security half of forwarding `options`: a host that narrows the schema
    // narrowed only its own note, and a transclusion kept rendering under the
    // package default.
    const relaxed = await mount({ source: '![[Bold]]', notePath: '/vault/Host' })
    expect(relaxed.querySelector('.markdown-embed-note strong')).not.toBeNull()

    const strict = {
      ...markdownSchema,
      tagNames: (markdownSchema.tagNames ?? []).filter((tag) => tag !== 'strong'),
    }
    const host = await mount({
      source: '![[Bold]]',
      notePath: '/vault/Host',
      options: { sanitize: strict },
    })
    expect(host.querySelector('.markdown-embed-note')?.textContent).toContain('bold')
    expect(host.querySelector('.markdown-embed-note strong')).toBeNull()
  })

  test("the host's math option applies to transcluded content", async () => {
    const off = await mount({ source: '![[Math]]', notePath: '/vault/Host' })
    expect(off.querySelector('.markdown-embed-note .markdown-math-inline')).toBeNull()

    const host = await mount({
      source: '![[Math]]',
      notePath: '/vault/Host',
      options: { math: true },
    })
    expect(host.querySelector('.markdown-embed-note .markdown-math-inline')).not.toBeNull()
  })

  test('a wikilink click inside a transclusion reaches the host', async () => {
    const seen: Array<{ resolution: { target: string } }> = []
    const host = await mount(
      { source: '![[Inner]]', notePath: '/vault/Host' },
      { onLinkClick: (payload: never) => seen.push(payload) },
    )
    const anchor = host.querySelector('.markdown-embed-note a.wikilink')
    expect(anchor).not.toBeNull()
    click(anchor!)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.resolution.target).toBe('Note')
  })

  test('a tag click inside a transclusion reaches the host', async () => {
    const seen: string[] = []
    const host = await mount(
      { source: '![[Inner]]', notePath: '/vault/Host' },
      { onTagClick: (tag: string) => seen.push(tag) },
    )
    const tag = host.querySelector('.markdown-embed-note a.tag')
    expect(tag).not.toBeNull()
    click(tag!)
    expect(seen).toEqual(['inner'])
  })

  test('a task toggle inside a transclusion does NOT reach the host', async () => {
    // Deliberately contained. The payload's `line` is a line of the EMBEDDED
    // note — and of this embed's slice of it — while a host treats
    // `task-toggle` as a line of the note it is displaying and writes that file
    // back. Forwarding it would rewrite the wrong file at the wrong line.
    const seen: Array<{ line: number; checked: boolean }> = []
    const host = await mount(
      { source: '- [ ] host task\n\n![[Tasks]]', notePath: '/vault/Host' },
      { onTaskToggle: (payload: never) => seen.push(payload) },
    )
    const boxes = [...host.querySelectorAll('input[type=checkbox]')]
    const inner = boxes.filter((box) => box.closest('.markdown-embed-note'))
    const outer = boxes.filter((box) => !box.closest('.markdown-embed-note'))
    expect(inner).toHaveLength(1)
    expect(outer).toHaveLength(1)

    // The host's own task still reports, so the listener is demonstrably wired.
    click(outer[0]!)
    expect(seen).toEqual([{ line: 1, checked: true }])

    click(inner[0]!)
    expect(seen).toHaveLength(1)
  })

  test('a task checkbox inside a transclusion stays disabled, not a dead control', async () => {
    // Its toggle cannot reach the host (above), so a live checkbox there could
    // be ticked forever with nothing happening. GFM's `disabled` stays on.
    const host = await mount({ source: '- [ ] host task\n\n![[Tasks]]', notePath: '/vault/Host' })
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
    const inner = boxes.find((box) => box.closest('.markdown-embed-note'))
    const outer = boxes.find((box) => !box.closest('.markdown-embed-note'))
    expect(inner?.disabled).toBe(true)
    expect(outer?.disabled).toBe(false)
  })
})
