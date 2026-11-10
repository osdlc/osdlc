// @vitest-environment jsdom
/**
 * Table extras: the sort header, the CSV copy button, and the promise that
 * none of it touches the note.
 *
 * Mounted rather than asserted on hast, because the chrome exists only in the
 * Vue target — the string path is deliberately untouched, and one test here
 * holds that line the way `code-block.test.ts`'s last test does.
 *
 * The comparator is also exercised directly: it is a pure function over hast
 * text, and a mounted table is a slow way to ask whether an empty cell sorts
 * last. The CSV serialiser is tested only through the copy button.
 *
 * Vue comes from `./setup-dom.ts` and nowhere else; see its header for the
 * import-ordering bug that makes a direct `import 'vue'` fail.
 */

import { markdownVue, vue } from './setup-dom.ts'
import { afterEach, describe, expect, test } from 'vitest'
import type { App } from 'vue'
import { renderToHtml } from '@osdlc/markdown-render'
import type { HastNode } from '../src/render.ts'

const { createApp, defineComponent, h, ref } = vue
const { MarkdownRender } = markdownVue
// The comparator is package-internal — nothing outside consumes it, so the
// Vue entry does not re-export it. A DYNAMIC import is what makes reaching it
// safe here: `table-data.ts` pulls in Vue through
// `render.ts`, and a static import of it would be hoisted above the DOM setup;
// see `setup-dom.ts`.
const { cellText, hasSpannedCells, sortRowOrder } = await import('../src/table-data.ts')

let app: App | null = null

afterEach(() => {
  app?.unmount()
  app = null
  restoreClipboard()
})

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

/** Poll until `ready` holds, or fail naming what never arrived. */
async function waitFor(ready: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (ready()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`timed out waiting for ${what}`)
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

let written: string[] = []
let clipboardStubbed = false

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  written = []
  clipboardStubbed = true
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}

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

const SOURCE = [
  '| Name  | Team | Size |',
  '| ----- | ---- | ---- |',
  '| Zeta  | mira | 12   |',
  '| Alpha | ravi | 3    |',
  '| Beta  | mira | 128  |',
  '| Delta |      | 45   |',
].join('\n')

/** Raw HTML as a human writes it — every tag on its own indented line. */
const PRETTY_TABLE = [
  '<table>',
  '  <thead>',
  '    <tr>',
  '      <th>A</th>',
  '      <th>B</th>',
  '    </tr>',
  '  </thead>',
  '  <tbody>',
  '    <tr>',
  '      <td>2</td>',
  '      <td>x</td>',
  '    </tr>',
  '    <tr>',
  '      <td>1</td>',
  '      <td>y</td>',
  '    </tr>',
  '  </tbody>',
  '</table>',
].join('\n')

const SPANNED_TABLE = [
  '<table>',
  '  <thead><tr><th colspan="2">AB</th><th>C</th></tr></thead>',
  '  <tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody>',
  '</table>',
].join('\n')

const MULTI_BODY_TABLE =
  '<table><thead><tr><th>N</th></tr></thead>' +
  '<tbody><tr><td>b</td></tr><tr><td>a</td></tr><tr><td>c</td></tr></tbody>' +
  '<tbody><tr><td>z</td></tr></tbody></table>'

/** A raw table with two bodies and a footer, the shapes the sanitizer keeps. */
const MULTI_BODY_FOOT_TABLE =
  '<table><thead><tr><th>N</th></tr></thead>' +
  '<tbody><tr><td>3</td></tr><tr><td>1</td></tr><tr><td>2</td></tr></tbody>' +
  '<tbody><tr><td>z</td></tr></tbody>' +
  '<tfoot><tr><td>total</td></tr></tfoot></table>'

const sortButtons = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('.markdown-table-sort')) as HTMLElement[]
const copyButton = (host: HTMLElement) =>
  host.querySelector('.markdown-table-action[aria-label^="Copy"]')
const status = (host: HTMLElement) => host.querySelector('.markdown-table-status')

/** One body column, top to bottom, as displayed. */
function column(host: HTMLElement, index: number): string[] {
  return Array.from(host.querySelectorAll('tbody tr')).map((row) =>
    (row.querySelectorAll('td')[index]?.textContent ?? '').trim(),
  )
}

const ariaSorts = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('thead th')).map((th) => th.getAttribute('aria-sort'))

describe('TableBlock', () => {
  test('a table gets a wrapper, a chrome bar and one copy button', async () => {
    const host = await mount({ source: SOURCE })
    const block = host.querySelector('.markdown-table-block')
    expect(block).not.toBeNull()
    expect(block?.querySelector('table')).not.toBeNull()
    expect(host.querySelectorAll('.markdown-table-chrome')).toHaveLength(1)
    expect(host.querySelectorAll('.markdown-table-action')).toHaveLength(1)
    expect(copyButton(host)?.getAttribute('aria-label')).toBe('Copy table as CSV')
    expect((copyButton(host) as HTMLElement).tagName).toBe('BUTTON')
  })

  test('every header carries a real button, named by the header itself', async () => {
    const host = await mount({ source: SOURCE })
    const buttons = sortButtons(host)
    expect(buttons).toHaveLength(3)
    // The name is the header text the button wraps. An `aria-label` here would
    // REPLACE the `<th>`'s own accessible name — and a column header's name is
    // announced with every data cell in that column, so the column would read
    // as "Sort by Name" all the way down. `aria-sort` carries the state.
    expect(buttons.map((button) => button.textContent)).toEqual(['Name', 'Team', 'Size'])
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
      expect(button.hasAttribute('aria-label')).toBe(false)
      button.focus()
      expect(document.activeElement).toBe(button)
    }
    expect(ariaSorts(host)).toEqual(['none', 'none', 'none'])
  })

  test('the document order is what an unsorted table shows', async () => {
    const host = await mount({ source: SOURCE })
    expect(column(host, 0)).toEqual(['Zeta', 'Alpha', 'Beta', 'Delta'])
  })

  test('three clicks are ascending, descending, and the document order back', async () => {
    const host = await mount({ source: SOURCE })

    click(sortButtons(host)[0]!)
    await flush()
    expect(column(host, 0)).toEqual(['Alpha', 'Beta', 'Delta', 'Zeta'])
    expect(ariaSorts(host)).toEqual(['ascending', 'none', 'none'])

    click(sortButtons(host)[0]!)
    await flush()
    expect(column(host, 0)).toEqual(['Zeta', 'Delta', 'Beta', 'Alpha'])
    expect(ariaSorts(host)).toEqual(['descending', 'none', 'none'])

    // The source's own order is authoritative, and a reader has to be able to
    // get back to it.
    click(sortButtons(host)[0]!)
    await flush()
    expect(column(host, 0)).toEqual(['Zeta', 'Alpha', 'Beta', 'Delta'])
    expect(ariaSorts(host)).toEqual(['none', 'none', 'none'])
  })

  test('a numeric column compares as numbers, not as text', async () => {
    const host = await mount({ source: SOURCE })
    click(sortButtons(host)[2]!)
    await flush()
    expect(column(host, 2)).toEqual(['3', '12', '45', '128'])
  })

  test('equal keys keep the order the document wrote them in', async () => {
    const host = await mount({ source: SOURCE })
    click(sortButtons(host)[1]!)
    await flush()
    // Zeta before Beta: both are `mira`, and Zeta is first in the source.
    expect(column(host, 0)).toEqual(['Zeta', 'Beta', 'Alpha', 'Delta'])
  })

  test('an empty cell sorts last in both directions', async () => {
    const host = await mount({ source: SOURCE })
    click(sortButtons(host)[1]!)
    await flush()
    expect(column(host, 1).at(-1)).toBe('')

    click(sortButtons(host)[1]!)
    await flush()
    expect(column(host, 1)).toEqual(['ravi', 'mira', 'mira', ''])
  })

  test('sorting a second column starts that column over at ascending', async () => {
    const host = await mount({ source: SOURCE })
    click(sortButtons(host)[0]!)
    click(sortButtons(host)[0]!)
    await flush()
    expect(ariaSorts(host)).toEqual(['descending', 'none', 'none'])

    click(sortButtons(host)[2]!)
    await flush()
    expect(ariaSorts(host)).toEqual(['none', 'none', 'ascending'])
    expect(column(host, 2)).toEqual(['3', '12', '45', '128'])
  })

  test('sorting never touches the hast the note produced', async () => {
    let tree: { children: HastNode[] } | null = null
    const host = await mount({
      source: SOURCE,
      onRendered: (payload: { tree: { children: HastNode[] } }) => {
        tree = payload.tree
      },
    })
    click(sortButtons(host)[0]!)
    await flush()
    expect(column(host, 0)).toEqual(['Alpha', 'Beta', 'Delta', 'Zeta'])

    // The tree the pipeline produced still says what the file says. A rendered
    // sort that reached hast would be one step from reaching the file.
    const table = findTable(tree!.children)
    const body = table?.children?.find((child) => child.tagName === 'tbody')
    const first = (body?.children ?? [])
      .filter((row) => row.tagName === 'tr')
      .map((row) =>
        text(row.children?.find((cell) => cell.tagName === 'td' || cell.tagName === 'th')),
      )
    expect(first).toEqual(['Zeta', 'Alpha', 'Beta', 'Delta'])
  })

  test('copy writes RFC 4180 CSV, header first, in the displayed order', async () => {
    recordingClipboard()
    const host = await mount({ source: SOURCE })

    click(copyButton(host))
    await flush()
    expect(written).toEqual([
      ['Name,Team,Size', 'Zeta,mira,12', 'Alpha,ravi,3', 'Beta,mira,128', 'Delta,,45'].join('\r\n'),
    ])

    // What you see is what you copy.
    written = []
    click(sortButtons(host)[0]!)
    await flush()
    click(copyButton(host))
    await flush()
    expect(written[0]?.split('\r\n')[1]).toBe('Alpha,ravi,3')
  })

  test('copy keeps each value in its column across colspan and rowspan', async () => {
    recordingClipboard()
    const host = await mount({
      source:
        '<table><thead><tr><th>a</th><th>b</th><th>c</th></tr></thead><tbody>' +
        '<tr><td colspan="2">x</td><td>y</td></tr>' +
        '<tr><td rowspan="2">p</td><td>q</td><td>r</td></tr>' +
        '<tr><td>s</td><td>t</td></tr></tbody></table>',
    })
    click(copyButton(host))
    await flush()
    expect(written[0]).toBe(['a,b,c', 'x,,y', 'p,q,r', ',s,t'].join('\r\n'))
  })

  test('a cell copies what the reader sees: link text, code text, quotes escaped', async () => {
    recordingClipboard()
    const source = [
      '| Target | Flag | Quote |',
      '| ------ | ---- | ----- |',
      '| [[Some Note\\|shown]] | `--dry-run` | say "hi", twice |',
    ].join('\n')
    const host = await mount({ source })
    click(copyButton(host))
    await flush()
    expect(written).toEqual(['Target,Flag,Quote\r\nshown,--dry-run,"say ""hi"", twice"'])
  })

  test('a copy is confirmed on the button and in a live region', async () => {
    recordingClipboard()
    const host = await mount({ source: SOURCE })

    expect(status(host)).not.toBeNull()
    expect(status(host)?.getAttribute('role')).toBe('status')
    expect(status(host)?.textContent).toBe('')

    click(copyButton(host))
    await flush()
    expect(status(host)?.textContent).toBe('Copied')
    expect(copyButton(host)?.getAttribute('aria-label')).toBe('Copy table as CSV')
    expect(copyButton(host)?.getAttribute('title')).toBe('Copied')
    expect(copyButton(host)?.className).toContain('markdown-table-copied')
  })

  test('copy fails quietly when there is no clipboard', async () => {
    removeClipboard()
    const host = await mount({ source: SOURCE })
    click(copyButton(host))
    await flush()
    expect(status(host)?.textContent).toBe('')
    expect(copyButton(host)?.className).not.toContain('markdown-table-copied')
  })

  test('a table with no header renders, copies, and offers no sort', async () => {
    // Raw HTML reaches the renderer through rehype-raw, and the sanitizer's
    // output for `<table><tr>` is `<table><tbody><tr>` — no `<thead>` at all.
    recordingClipboard()
    const host = await mount({ source: '<table><tr><td>one</td><td>two</td></tr></table>' })
    expect(host.querySelector('.markdown-table-block')).not.toBeNull()
    expect(host.querySelector('thead')).toBeNull()
    expect(sortButtons(host)).toHaveLength(0)

    click(copyButton(host))
    await flush()
    expect(written).toEqual(['one,two'])
  })

  test('a host can turn the extras off entirely with { table: undefined }', async () => {
    const host = await mount({ source: SOURCE, components: { table: undefined } })
    expect(host.querySelector('table')).not.toBeNull()
    expect(host.querySelector('.markdown-table-block')).toBeNull()
    expect(host.querySelector('.markdown-table-chrome')).toBeNull()
    expect(sortButtons(host)).toHaveLength(0)
  })

  test('a nested table inside a cell gets its own chrome, not its parent’s', async () => {
    const host = await mount({
      source: '<table><tr><td><table><tr><td>inner</td></tr></table></td></tr></table>',
    })
    expect(host.querySelectorAll('.markdown-table-block')).toHaveLength(2)
    expect(host.querySelectorAll('.markdown-table-action')).toHaveLength(2)
  })

  test('a pretty-printed raw table sorts the column its header names', async () => {
    // `rehype-raw` keeps the whitespace between hand-written tags, so this
    // table's rows and cells arrive interleaved with text nodes. Indexing into
    // that list rather than filtering it put the buttons on the wrong columns,
    // and left the header claiming a sort the body had not taken.
    recordingClipboard()
    const host = await mount({ source: PRETTY_TABLE })

    expect(sortButtons(host).map((button) => button.textContent)).toEqual(['A', 'B'])
    expect(column(host, 0)).toEqual(['2', '1'])

    click(sortButtons(host)[0]!)
    await flush()
    expect(column(host, 0)).toEqual(['1', '2'])
    expect(column(host, 1)).toEqual(['y', 'x'])
    expect(ariaSorts(host)).toEqual(['ascending', 'none'])

    // Screen and clipboard agree, which is the whole point of reading both
    // from one order.
    click(copyButton(host))
    await flush()
    expect(written).toEqual(['A,B\r\n1,y\r\n2,x'])

    click(sortButtons(host)[1]!)
    await flush()
    expect(column(host, 1)).toEqual(['x', 'y'])
    expect(ariaSorts(host)).toEqual(['none', 'ascending'])
  })

  test('a table with a spanned cell is offered no sort at all', async () => {
    // A colspan breaks the assumption the sort rests on — that the n-th header
    // names the n-th value of every row — and there is no honest repair.
    recordingClipboard()
    const host = await mount({ source: SPANNED_TABLE })
    expect(host.querySelector('th[colspan="2"]')).not.toBeNull()
    expect(sortButtons(host)).toHaveLength(0)
    expect(ariaSorts(host)).toEqual([null, null])

    // Copying is unaffected: it never depended on the columns lining up.
    click(copyButton(host))
    await flush()
    expect(written).toEqual(['AB,,C\r\n1,2,3'])
  })

  test('a table with more than one tbody is offered no sort, and copies every body', async () => {
    // The sort keys come from one body; applying that permutation to another
    // body dropped or scrambled its rows.
    recordingClipboard()
    const host = await mount({ source: MULTI_BODY_TABLE })
    const bodies = () =>
      Array.from(host.querySelectorAll('tbody')).map((body) =>
        Array.from(body.querySelectorAll('td')).map((cell) => (cell.textContent ?? '').trim()),
      )
    expect(bodies()).toEqual([['b', 'a', 'c'], ['z']])
    expect(sortButtons(host)).toHaveLength(0)

    click(copyButton(host))
    await flush()
    expect(written).toEqual(['N\r\nb\r\na\r\nc\r\nz'])
  })

  test('a header with no words gets hidden text, not an aria-label', async () => {
    const host = await mount({ source: '|  | B |\n| --- | --- |\n| 1 | 2 |' })
    const buttons = sortButtons(host)
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.querySelector('.markdown-table-sort-name')?.textContent).toBe('Column 1')
    expect(buttons[0]?.hasAttribute('aria-label')).toBe(false)
    expect(buttons[1]?.querySelector('.markdown-table-sort-name')).toBeNull()
  })

  test('copy includes every tbody and the tfoot, in document order', async () => {
    recordingClipboard()
    const host = await mount({ source: MULTI_BODY_FOOT_TABLE })
    click(copyButton(host))
    await flush()
    expect(written).toEqual(['N\r\n3\r\n1\r\n2\r\nz\r\ntotal'])
  })

  test('a link in a sortable header follows the link and does not sort', async () => {
    const seen: unknown[] = []
    const host = await mount({
      source: '| [[Name]] | n |\n| --- | --- |\n| b | 2 |\n| a | 1 |\n',
      onLinkClick: (payload: unknown) => seen.push(payload),
    })
    const link = host.querySelector('th a.wikilink')!
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await flush()
    expect(seen).toHaveLength(1)
    expect(ariaSorts(host)).toEqual(['none', 'none'])
    expect(column(host, 0)).toEqual(['b', 'a'])

    // A modified click (open in a new tab) is left to the browser by the
    // anchor, and still must not sort the table under the reader. The host
    // swallows the default so jsdom does not try to navigate.
    host.addEventListener('click', (event) => event.preventDefault())
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))
    await flush()
    expect(ariaSorts(host)).toEqual(['none', 'none'])

    // The header's own text still sorts.
    click(sortButtons(host)[1]!)
    await flush()
    expect(column(host, 0)).toEqual(['a', 'b'])
  })

  test('a <br> in a cell copies as a line break, not as run-together text', async () => {
    recordingClipboard()
    const host = await mount({
      source: '| Name | Address |\n| --- | --- |\n| Ann | 1 Main St<br>Springfield |',
    })
    click(copyButton(host))
    await flush()
    expect(written).toEqual(['Name,Address\r\nAnn,"1 Main St\nSpringfield"'])
  })

  test('a rowspan="0" cell is a span, so the table is offered no sort', async () => {
    const source =
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td rowspan="0">x</td><td>2</td></tr><tr><td>1</td></tr></tbody></table>'
    const host = await mount({ source })
    expect(host.querySelector('td[rowspan="0"]')).not.toBeNull()
    expect(sortButtons(host)).toHaveLength(0)
  })

  test('copy puts a tfoot written before the tbody at the bottom, where it draws', async () => {
    // A table draws its footer below every body whatever order the markup
    // wrote them in, and the copy is the table as the reader sees it.
    recordingClipboard()
    const host = await mount({
      source:
        '<table><thead><tr><th>N</th></tr></thead><tfoot><tr><td>total</td></tr></tfoot>' +
        '<tbody><tr><td>1</td></tr></tbody></table>',
    })
    click(copyButton(host))
    await flush()
    expect(written).toEqual(['N\r\n1\r\ntotal'])
  })

  test('a cell of several paragraphs copies one per line', async () => {
    recordingClipboard()
    const host = await mount({
      source:
        '<table><thead><tr><th>Note</th></tr></thead><tbody><tr><td><p>first</p><p>second</p></td></tr></tbody></table>',
    })
    click(copyButton(host))
    await flush()
    expect(written).toEqual(['Note\r\n"first\nsecond"'])
  })

  test('a redraw of the same source keeps the reader’s sort; an edit resets it', async () => {
    // Every pipeline run builds a fresh hast tree — a new `options` object
    // alone re-runs it, which is how a host redraws when an asset lands — so
    // the sort cannot reset on node identity.
    const source = ref(SOURCE)
    const options = ref<Record<string, unknown>>({})
    let renders = 0
    const host = document.createElement('div')
    document.body.appendChild(host)
    app = createApp(
      defineComponent({
        setup: () => () =>
          h(MarkdownRender, {
            source: source.value,
            options: options.value,
            onRendered: () => renders++,
          } as never),
      }),
    )
    app.mount(host)
    await waitFor(() => renders === 1, 'the first render')
    click(sortButtons(host)[0]!)
    await waitFor(() => ariaSorts(host)[0] === 'ascending', 'the sort')
    expect(column(host, 0)).toEqual(['Alpha', 'Beta', 'Delta', 'Zeta'])

    options.value = {}
    await waitFor(() => renders === 2, 'the options-only redraw')
    await vue.nextTick()
    expect(column(host, 0)).toEqual(['Alpha', 'Beta', 'Delta', 'Zeta'])
    expect(ariaSorts(host)[0]).toBe('ascending')

    // Same length as the cell it replaces, so only the text tells it apart.
    source.value = SOURCE.replace('Zeta ', 'Omega')
    await waitFor(() => renders === 3, 'the edited render')
    await waitFor(() => column(host, 0).includes('Omega'), 'the edited table')
    expect(column(host, 0)).toEqual(['Omega', 'Alpha', 'Beta', 'Delta'])
    expect(ariaSorts(host)[0]).toBe('none')
  })

  test('the string path is untouched: no chrome in renderToHtml output', async () => {
    const html = await renderToHtml(SOURCE)
    expect(html).toContain('<table')
    expect(html).toContain('<th>Name</th>')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('markdown-table')
    expect(html).not.toContain('aria-sort')
  })
})

describe('sortRowOrder', () => {
  test('ascending, descending, and stable through both', () => {
    const keys = ['b', 'a', 'b', 'c']
    expect(sortRowOrder(keys, 'asc')).toEqual([1, 0, 2, 3])
    expect(sortRowOrder(keys, 'desc')).toEqual([3, 0, 2, 1])
  })

  test('empty keys sink in both directions', () => {
    const keys = ['b', '', 'a']
    expect(sortRowOrder(keys, 'asc')).toEqual([2, 0, 1])
    expect(sortRowOrder(keys, 'desc')).toEqual([0, 2, 1])
  })

  test('an all-numeric column compares numerically', () => {
    expect(sortRowOrder(['12', '3', '128', '-4.5'], 'asc')).toEqual([3, 1, 0, 2])
  })

  test('the numeric branch is what does the work, not collation', () => {
    // Collation reads `1.5` before `1.25`: it compares the digit runs either
    // side of the dot, and 5 sorts before 25. Only a real numeric compare gets
    // these two right, so they are what fails if the branch is removed.
    expect(sortRowOrder(['1.5', '1.25'], 'asc')).toEqual([1, 0])
    expect(sortRowOrder(['-1', '-2', '3'], 'asc')).toEqual([1, 0, 2])
  })

  test('one non-numeric cell puts the whole column back on text', () => {
    // The same two keys as above and the opposite answer: `n/a` disqualifies
    // the column, and collation's order is what must come out.
    expect(sortRowOrder(['1.5', '1.25', 'n/a'], 'asc')).toEqual([0, 1, 2])
  })

  test('currency reads as text, not as a number that failed to parse', () => {
    // `Number('$1,200')` is NaN, and a comparator returning NaN leaves an
    // array where it found it — so the discriminating input is three keys whose
    // collated order is not their input order.
    expect(sortRowOrder(['$1,200', '$900', '$80'], 'asc')).toEqual([0, 2, 1])
  })

  test('a number too long to represent still compares exactly', () => {
    // 400 digits parse to Infinity, and `Infinity - Infinity` is NaN — an order
    // the engine picks rather than one this module chose. The comparator reads
    // the digit strings, so it never asks a double to hold them.
    const prefix = '9'.repeat(399)
    expect(sortRowOrder([`${prefix}9`, `${prefix}1`], 'asc')).toEqual([1, 0])
  })

  test('integers past 2^53 still sort exactly', () => {
    // These three parse to the same double, so subtracting them says "equal"
    // and the stable sort leaves them in document order both ways.
    const keys = ['1234567890123456789', '1234567890123456788', '1234567890123456787']
    expect(sortRowOrder(keys, 'asc')).toEqual([2, 1, 0])
    expect(sortRowOrder(keys, 'desc')).toEqual([0, 1, 2])
  })

  test('decimals past double precision still sort exactly', () => {
    // The last two parse to the same double; document order would keep them
    // the wrong way round.
    const keys = ['0.30000000000000004', '0.30000000000000001', '0.3']
    expect(sortRowOrder(keys, 'asc')).toEqual([2, 1, 0])
  })

  test('long negatives sort below long positives and by magnitude', () => {
    const keys = ['-1234567890123456788', '5', '-1234567890123456789', '0']
    expect(sortRowOrder(keys, 'asc')).toEqual([2, 0, 3, 1])
  })

  test('an ISO date column falls out of numeric collation', () => {
    const keys = ['2026-03-04', '2026-01-19', '2026-02-27']
    expect(sortRowOrder(keys, 'asc')).toEqual([1, 2, 0])
  })
})

/** The first `<table>` anywhere under these nodes. */
function findTable(nodes: HastNode[]): HastNode | undefined {
  for (const node of nodes) {
    if (node.tagName === 'table') return node
    const found = findTable(node.children ?? [])
    if (found) return found
  }
  return undefined
}

function text(node: HastNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return String(node.value ?? '')
  return (node.children ?? []).map(text).join('')
}

describe('table cell data', () => {
  test('a <br> reads as a line break', () => {
    const cell: HastNode = {
      type: 'element',
      tagName: 'td',
      children: [
        { type: 'text', value: '1 Main St' },
        { type: 'element', tagName: 'br', children: [] },
        { type: 'text', value: 'Springfield' },
      ],
    }
    expect(cellText(cell)).toBe('1 Main St\nSpringfield')
  })

  test('block children read one per line, ignoring the whitespace between them', () => {
    const para = (value: string): HastNode => ({
      type: 'element',
      tagName: 'p',
      children: [{ type: 'text', value }],
    })
    const cell: HastNode = {
      type: 'element',
      tagName: 'td',
      children: [
        { type: 'text', value: '\n' },
        para('first'),
        { type: 'text', value: '\n' },
        para('second'),
        { type: 'text', value: 'tail' },
      ],
    }
    expect(cellText(cell)).toBe('first\nsecond\ntail')
  })

  test('rowspan 0 spans to the end of its row group, so it counts as a span', () => {
    const table: HastNode = {
      type: 'element',
      tagName: 'table',
      children: [
        {
          type: 'element',
          tagName: 'tbody',
          children: [
            {
              type: 'element',
              tagName: 'tr',
              children: [
                { type: 'element', tagName: 'td', properties: { rowSpan: 0 }, children: [] },
              ],
            },
          ],
        },
      ],
    }
    expect(hasSpannedCells(table)).toBe(true)
  })
})
