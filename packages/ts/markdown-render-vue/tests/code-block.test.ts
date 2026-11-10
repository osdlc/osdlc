// @vitest-environment jsdom
/**
 * Code-fence chrome: the language label, the copy button, the wrap toggle.
 *
 * Mounted rather than asserted on hast, because the chrome exists only in the
 * Vue target — the string path is deliberately untouched, and the last test
 * here is what holds that line.
 *
 * Vue comes from `./setup-dom.ts` and nowhere else; see its header for the
 * import-ordering bug that makes a direct `import 'vue'` fail.
 */

import { markdownVue, vue } from './setup-dom.ts'
import { afterEach, describe, expect, test } from 'vitest'
import type { App } from 'vue'
import { renderToHtml } from '@osdlc/markdown-render'

const { createApp, defineComponent, h } = vue
const { MarkdownRender } = markdownVue

let app: App | null = null

afterEach(() => {
  app?.unmount()
  app = null
  restoreClipboard()
})

/** Mount `<MarkdownRender>` and wait for the render. No vault is needed. */
async function mount(props: Record<string, unknown>): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const Wrapper = defineComponent({
    setup: () => () => h(MarkdownRender, props as never),
  })
  app = createApp(Wrapper)
  app.mount(host)
  await settle(host)
  return host
}

/** Wait for the asynchronous pipeline to land. */
async function settle(host: HTMLElement, ticks = 40): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1))
    if (host.querySelector('.markdown-render')?.childNodes.length) break
  }
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 2))
}

function click(el: Element | null): void {
  ;(el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

/** Let a click handler's promise settle. */
const flush = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))

/** Everything the stub clipboard was asked to write, in order. */
let written: string[] = []
let clipboardStubbed = false

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  written = []
  clipboardStubbed = true
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}

/** A stub that records and resolves — the ordinary case. */
function recordingClipboard(): void {
  stubClipboard(async (text) => {
    written.push(text)
  })
}

function removeClipboard(): void {
  clipboardStubbed = true
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
}

function restoreClipboard(): void {
  if (!clipboardStubbed) return
  delete (navigator as unknown as Record<string, unknown>).clipboard
  clipboardStubbed = false
  written = []
}

const chrome = (host: HTMLElement) => host.querySelector('.markdown-code-chrome')
// Anchored on what each control IS, not on which attributes it happens to
// carry: the copy button's name is stable by design, and the wrap toggle is the
// one that reports pressed state.
const copyButton = (host: HTMLElement) =>
  host.querySelector('.markdown-code-action[aria-label^="Copy"]')
const wrapButton = (host: HTMLElement) =>
  host.querySelector('.markdown-code-action[aria-label="Wrap long lines"]')
const status = (host: HTMLElement) => host.querySelector('.markdown-code-status')

describe('CodeBlock', () => {
  test('a tagged fence shows its language', async () => {
    const host = await mount({ source: '```ts\nconst answer = 42\n```' })
    expect(host.querySelector('.markdown-code-lang')?.textContent).toBe('ts')
    expect(host.querySelector('.markdown-code-block pre code')?.textContent).toContain(
      'const answer',
    )
  })

  test('an untagged fence gets the chrome but no label', async () => {
    const host = await mount({ source: '```\nplain text\n```' })
    expect(chrome(host)).not.toBeNull()
    expect(host.querySelector('.markdown-code-lang')).toBeNull()
    expect(host.querySelectorAll('.markdown-code-action')).toHaveLength(2)
  })

  test('the copy button names the language, so forty fences are forty names', async () => {
    const tagged = await mount({ source: '```ts\nconst answer = 42\n```' })
    expect(copyButton(tagged)?.getAttribute('aria-label')).toBe('Copy ts code')
    app?.unmount()
    app = null

    const untagged = await mount({ source: '```\nplain\n```' })
    expect(copyButton(untagged)?.getAttribute('aria-label')).toBe('Copy code')
  })

  test('both controls are real buttons, and both take focus', async () => {
    const host = await mount({ source: '```ts\nconst answer = 42\n```' })
    const buttons = Array.from(host.querySelectorAll('.markdown-code-action')) as HTMLElement[]
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
      expect(button.getAttribute('aria-label')).toBeTruthy()
      button.focus()
      expect(document.activeElement).toBe(button)
    }
  })

  test('copy writes the fence source, with the trailing newline stripped', async () => {
    recordingClipboard()
    const host = await mount({ source: '```ts\nconst a = 1\nconst b = 2\n```' })
    click(copyButton(host))
    await flush()
    expect(written).toEqual(['const a = 1\nconst b = 2'])
  })

  test('copy is byte-exact: leading whitespace and blank lines survive', async () => {
    recordingClipboard()
    const source = '```ts\n    indented = 1\n\n\tconst tabbed = 2\n\nend\n```'
    const host = await mount({ source })
    click(copyButton(host))
    await flush()
    expect(written).toEqual(['    indented = 1\n\n\tconst tabbed = 2\n\nend'])
  })

  test('a copy is confirmed on the button and in a live region', async () => {
    recordingClipboard()
    const host = await mount({ source: '```ts\nconst a = 1\n```' })

    // The live region exists from the first render, empty. A region inserted
    // together with its text is not announced.
    expect(status(host)).not.toBeNull()
    expect(status(host)?.getAttribute('role')).toBe('status')
    expect(status(host)?.textContent).toBe('')

    click(copyButton(host))
    await flush()
    expect(status(host)?.textContent).toBe('Copied')
    // The accessible name does NOT move — only the icon and the tooltip do.
    expect(copyButton(host)?.getAttribute('aria-label')).toBe('Copy ts code')
    expect(copyButton(host)?.getAttribute('title')).toBe('Copied')
    expect(copyButton(host)?.className).toContain('markdown-code-copied')
  })

  test('a second copy restarts the confirmation rather than inheriting its clock', async () => {
    recordingClipboard()
    const host = await mount({ source: '```ts\nconst a = 1\n```' })

    click(copyButton(host))
    await flush(1200)
    expect(status(host)?.textContent).toBe('Copied')

    click(copyButton(host))
    // 1200ms past the SECOND copy is 2400ms past the first, so an un-reset
    // timer would have reverted this already.
    await flush(1200)
    expect(status(host)?.textContent).toBe('Copied')

    await flush(1000)
    expect(status(host)?.textContent).toBe('')
    expect(copyButton(host)?.getAttribute('title')).toBe('Copy ts code')
  })

  test('copy fails quietly when there is no clipboard', async () => {
    removeClipboard()
    const host = await mount({ source: '```ts\nconst a = 1\n```' })
    click(copyButton(host))
    await flush()
    // Nothing claimed to have happened: no confirmation, on either channel.
    expect(status(host)?.textContent).toBe('')
    expect(copyButton(host)?.className).not.toContain('markdown-code-copied')
  })

  test('copy fails quietly when the clipboard rejects', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')))
    const host = await mount({ source: '```ts\nconst a = 1\n```' })
    click(copyButton(host))
    await flush()
    expect(status(host)?.textContent).toBe('')
    expect(copyButton(host)?.className).not.toContain('markdown-code-copied')
  })

  test('the wrap toggle flips one block, and says so', async () => {
    const host = await mount({ source: '```ts\nconst a = 1\n```' })
    const button = wrapButton(host)!
    const block = host.querySelector('.markdown-code-block')!

    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(block.className).not.toContain('markdown-code-wrapped')

    click(button)
    await flush()
    expect(wrapButton(host)?.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('.markdown-code-block')?.className).toContain('markdown-code-wrapped')

    click(wrapButton(host))
    await flush()
    expect(wrapButton(host)?.getAttribute('aria-pressed')).toBe('false')
  })

  test('wrapping one fence leaves its neighbour alone', async () => {
    const host = await mount({ source: '```ts\nconst a = 1\n```\n\n```ts\nconst b = 2\n```' })
    const buttons = host.querySelectorAll('.markdown-code-action[aria-label="Wrap long lines"]')
    expect(buttons).toHaveLength(2)

    click(buttons[0]!)
    await flush()
    const blocks = host.querySelectorAll('.markdown-code-block')
    expect(blocks[0]!.className).toContain('markdown-code-wrapped')
    expect(blocks[1]!.className).not.toContain('markdown-code-wrapped')
  })

  test('a mermaid fence keeps its own renderer and gets no chrome', async () => {
    const host = await mount({ source: '```mermaid\ngraph TD; A --> B;\n```' })
    expect(host.querySelector('.markdown-mermaid')).not.toBeNull()
    expect(host.querySelector('.markdown-code-block')).toBeNull()
    expect(host.querySelector('.markdown-code-chrome')).toBeNull()
  })

  test('a math fence keeps its own renderer and gets no chrome', async () => {
    const host = await mount({ source: '```math\ne = mc^2\n```' })
    expect(host.querySelector('.markdown-math-block')).not.toBeNull()
    expect(host.querySelector('.markdown-code-block')).toBeNull()
    expect(host.querySelector('.markdown-code-chrome')).toBeNull()
  })

  test('a host-claimed fence language gets no chrome either', async () => {
    const BaseBlock = defineComponent({
      name: 'BaseBlock',
      props: { node: { type: Object, required: true } },
      setup: () => () => h('div', { class: 'base-block' }, 'claimed'),
    })
    const host = await mount({
      source: '```base\nfilters: {}\n```',
      components: { 'lang:base': BaseBlock },
    })
    expect(host.querySelector('.base-block')).not.toBeNull()
    expect(host.querySelector('.markdown-code-chrome')).toBeNull()
  })

  test('a host can turn the chrome off entirely with { pre: undefined }', async () => {
    const host = await mount({
      source: '```ts\nconst a = 1\n```',
      components: { pre: undefined },
    })
    expect(host.querySelector('pre code')?.textContent).toContain('const a = 1')
    expect(host.querySelector('.markdown-code-block')).toBeNull()
    expect(host.querySelector('.markdown-code-chrome')).toBeNull()
  })

  test('a <pre> with no <code> child still renders, chrome and all', async () => {
    // Raw HTML in a note reaches the renderer through rehype-raw, and nothing
    // guarantees the shape a fence would have produced.
    const host = await mount({ source: '<pre>bare</pre>' })
    const block = host.querySelector('.markdown-code-block')
    expect(block).not.toBeNull()
    expect(block?.querySelector('pre')?.textContent).toBe('bare')
    expect(host.querySelector('.markdown-code-lang')).toBeNull()
  })

  test('the string path is untouched: no chrome in renderToHtml output', async () => {
    const html = await renderToHtml('```ts\nconst answer = 42\n```')
    expect(html).toContain('<pre data-line="1" data-lang="ts"><code class="language-ts">')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('markdown-code')
  })
})
