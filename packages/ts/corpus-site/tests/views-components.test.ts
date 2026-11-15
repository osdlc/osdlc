// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Component } from 'vue'
import type { DataField, DataRecord, DataTree, MatrixData } from '../src/data-types.ts'
import { tasks } from './fixtures.ts'
import { components, vue } from './setup-dom.ts'

const { MatrixControls, MatrixTable, ResultTable, SearchApp, TreeValue, TypeExplorer, ValueCell } =
  components
const { createApp, h, nextTick } = vue

const unmounts: (() => void)[] = []
afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  window.localStorage.clear()
})

function mount(component: Component, props: Record<string, unknown>): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(component, props) })
  app.mount(host)
  unmounts.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim()
const texts = (host: Element, selector: string): string[] =>
  [...host.querySelectorAll(selector)].map((e) => text(e))

const answer: DataTree = {
  entries: [
    { label: 'Syntax', value: { text: '/acme:review', code: true }, help: 'What the user types.' },
    { label: 'Supported', value: 'Yes' },
    { label: 'Docs', value: { text: 'The guide', url: '/documents/guide/' } },
    { label: 'Modes', value: [{ entries: [{ label: 'Name', value: 'ask' }] }, 'plan'] },
  ],
}

describe('TreeValue', () => {
  test('draws an object as labelled pairs, with code, links, lists and nested objects', () => {
    const host = mount(TreeValue, { tree: answer })
    expect(texts(host, '.cs-tree > .cs-pairs > dt')).toEqual([
      'Syntax',
      'Supported',
      'Docs',
      'Modes',
    ])
    expect(host.querySelector('dt')!.getAttribute('title')).toBe('What the user types.')
    expect(host.querySelector('dd code')!.textContent).toBe('/acme:review')
    expect(host.querySelector('dd a')!.getAttribute('href')).toBe('/documents/guide/')
    expect(texts(host, '.cs-list > li')).toEqual(['Nameask', 'plan'])
    expect(host.querySelector('details')).toBeNull()
  })

  test('compact shows a short value whole, with nothing to open', () => {
    const host = mount(TreeValue, { tree: { entries: answer.entries.slice(0, 2) }, compact: true })
    expect(host.querySelector('details')).toBeNull()
    expect(texts(host, 'dt')).toEqual(['Syntax', 'Supported'])
  })

  test('compact cuts a long value and keeps the whole behind a details', () => {
    const long = 'word '.repeat(40).trim()
    const host = mount(TreeValue, {
      tree: { entries: [...answer.entries, { label: 'Note', value: long }] },
      compact: true,
    })
    const details = host.querySelector('details')!
    expect(details.open).toBe(false)
    // Three pairs in the preview, all five in the body.
    expect(texts(details, 'summary .cs-tree-preview dt')).toEqual(['Syntax', 'Supported', 'Docs'])
    expect(texts(details, '.cs-tree-full > .cs-pairs > dt')).toHaveLength(5)
    expect(text(details.querySelector('.cs-tree-full'))).toContain(long)

    const clipped = mount(TreeValue, { tree: long, compact: true })
    expect(text(clipped.querySelector('.cs-tree-preview'))).toMatch(/…$/)
    expect(text(clipped.querySelector('.cs-tree-preview')).length).toBeLessThan(long.length)
    expect(
      mount(TreeValue, { tree: ['a', 'b', 'c', 'd', 'e'], compact: true }).querySelector(
        '.cs-more',
      )!.textContent,
    ).toBe('+2')
  })
})

describe('tables of related records', () => {
  const field = (name: string, over: Partial<DataField> = {}): DataField => ({
    ...tasks().fields.find((f) => f.name === 'note')!,
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    ...over,
  })
  const row = (id: string, values: DataRecord['values']): DataRecord => ({
    id,
    url: `/answers/${id}/`,
    title: `Answer ${id}`,
    summary: null,
    values,
  })
  const fields = [field('tool'), field('value', { kind: 'json', tree: true })]

  test('a tree column is drawn compact, and ValueCell hands it to TreeValue', () => {
    const host = mount(ValueCell, { field: fields[1], value: answer })
    expect(host.querySelector('.cs-tree-compact')).not.toBeNull()
    expect(host.querySelector('code')!.textContent).toBe('/acme:review')
  })

  test('without a title column each row ends in a link to its record', () => {
    const host = mount(ResultTable, {
      fields,
      rows: [row('a', { tool: 'Alpha', value: answer })],
      showTitle: false,
    })
    expect(texts(host, 'thead th')).toEqual(['Tool', 'Value', 'Record'])
    expect(host.querySelector('tbody th')).toBeNull()
    const open = host.querySelector('td.cs-cell-open a')!
    expect([open.getAttribute('href'), text(open)]).toEqual(['/answers/a/', 'Open Answer a'])
    expect(host.querySelector('td[data-tree]')!.getAttribute('data-label')).toBe('Value')
  })

  test('groups are bodies with a heading and a count', () => {
    const host = mount(ResultTable, {
      fields,
      groups: [
        { label: 'setup', rows: [row('a', { tool: 'Alpha' })] },
        { label: 'use', rows: [row('b', { tool: 'Alpha' }), row('c', { tool: 'Beta' })] },
      ],
    })
    expect(host.querySelectorAll('tbody')).toHaveLength(2)
    expect(texts(host, '.cs-group-row th')).toEqual(['setup1', 'use2'])
    expect(host.querySelector('.cs-group-row th')!.getAttribute('colspan')).toBe('3')
    expect(host.querySelectorAll('tbody tr:not(.cs-group-row)')).toHaveLength(3)
  })
})

describe('the matrix', () => {
  const cell = (id: string, value: DataTree) => [{ url: `/answers/${id}/`, title: id, value }]
  const matrix: MatrixData = {
    version: 1,
    type: 'answers',
    label: 'Compare',
    rowLabel: 'Questions',
    columnLabel: 'Tools',
    columns: [
      { key: 'alpha', title: 'Alpha', url: '/tools/alpha/' },
      { key: 'beta', title: 'Beta', url: '/tools/beta/' },
    ],
    groups: [
      { key: 'setup', label: 'setup', count: 1 },
      { key: 'use', label: 'use', count: 2 },
    ],
    rows: [
      {
        key: 'config',
        title: 'Config file',
        url: '/q/config/',
        summary: 'Where the settings live.',
        group: 'setup',
        cells: [cell('a1', 'x.toml'), []],
      },
      {
        key: 'run',
        title: 'Run syntax',
        url: '/q/run/',
        summary: 'What a user types.',
        group: 'use',
        cells: [cell('a2', answer), cell('b2', '$go')],
      },
      {
        key: 'args',
        title: 'Arguments',
        url: '/q/args/',
        summary: null,
        group: 'use',
        cells: [[], cell('b3', 'Yes')],
      },
    ],
  }
  const both = () => {
    const table = mount(MatrixTable, { matrix, id: 'm' })
    const controls = mount(MatrixControls, {
      target: 'm',
      groups: matrix.groups,
      columns: matrix.columns,
      rows: matrix.rows.map(({ key, title, group }) => ({ key, title, group })),
      rowLabel: matrix.rowLabel,
      columnLabel: matrix.columnLabel,
    })
    const shown = (selector: string): string[] =>
      [...table.querySelectorAll<HTMLElement>(selector)]
        .filter((e) => !e.hidden && !e.closest<HTMLElement>('tbody')?.hidden)
        .map((e) => e.dataset['row'] ?? e.dataset['col'] ?? '')
    return { table, controls, shown }
  }

  test('the table is whole in the HTML: headers, groups, cells with a link, and empty cells', () => {
    const { table } = both()
    expect(table.querySelector('#m')!.getAttribute('aria-label')).toBe('Compare')
    expect(texts(table, 'thead th')).toEqual(['Questions', 'Alpha×', 'Beta×'])
    expect(texts(table, '.cs-group-row th')).toEqual(['setup1', 'use2'])
    const run = table.querySelector('tr[data-row=run]')!
    expect(run.getAttribute('data-group')).toBe('use')
    expect(run.getAttribute('data-text')).toBe('run syntax what a user types.')
    expect(run.querySelector('th a')!.getAttribute('href')).toBe('/q/run/')
    expect(run.querySelector('td[data-col=alpha] code')!.textContent).toBe('/acme:review')
    expect(run.querySelector('td[data-col=beta] .cs-matrix-open')!.getAttribute('href')).toBe(
      '/answers/b2/',
    )
    const empty = table.querySelector('tr[data-row=config] td[data-col=beta]')!
    expect(empty.hasAttribute('data-empty')).toBe(true)
    expect(empty.getAttribute('data-label')).toBe('Beta')
  })

  test('a group, a column and a text choice hide the rest and go in the address', async () => {
    const { controls, shown } = both()
    await settle()
    expect(shown('tr[data-row]')).toEqual(['config', 'run', 'args'])
    expect(text(controls.querySelector('[role=status]'))).toBe('3 of 3 questions, 2 of 2 tools')

    const chips = [...controls.querySelectorAll<HTMLElement>('.cs-matrix-groups .cs-chip')]
    expect(chips.map((c) => text(c))).toEqual(['All3', 'setup1', 'use2'])
    chips[2]!.click()
    await settle()
    expect(shown('tr[data-row]')).toEqual(['run', 'args'])
    expect(chips[2]!.getAttribute('aria-pressed')).toBe('true')
    expect(window.location.search).toBe('?group=use')

    // The columns are chips: none pressed shows all, and a pressed one is among those shown.
    const pick = controls.querySelector('.cs-matrix-pick')!
    expect(text(pick.querySelector('.cs-matrix-pick-label'))).toBe('Tools')
    const columns = [...pick.querySelectorAll<HTMLElement>('.cs-chip')]
    expect(columns.map((c) => [text(c), c.getAttribute('aria-pressed')])).toEqual([
      ['All2', 'true'],
      ['Alpha', 'false'],
      ['Beta', 'false'],
    ])
    columns[2]!.click()
    await settle()
    expect(columns.map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
    expect(window.location.search).toBe('?group=use&col=beta')
    expect([...new Set(shown('[data-col]'))]).toEqual(['beta'])
    expect(text(controls.querySelector('[role=status]'))).toBe('2 of 3 questions, 1 of 2 tools')

    const input = controls.querySelector<HTMLInputElement>('input[type=search]')!
    input.value = 'types'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    expect(shown('tr[data-row]')).toEqual(['run'])
    expect(window.location.search).toBe('?group=use&col=beta&q=types')
  })

  test('starts from the address, and one row can be stepped through', async () => {
    window.history.replaceState(null, '', '/answers/compare/?group=use&row=run&col=nope')
    const { table, controls, shown } = both()
    await settle()
    expect(shown('tr[data-row]')).toEqual(['run'])
    expect(table.querySelector('#m')!.hasAttribute('data-one-row')).toBe(true)
    expect(text(controls.querySelector('.cs-matrix-at'))).toBe('1 of 2')
    const [previous, next] = [
      ...controls.querySelectorAll<HTMLButtonElement>('.cs-matrix-step button'),
    ]
    expect(previous!.disabled).toBe(true)
    next!.click()
    await settle()
    expect(shown('tr[data-row]')).toEqual(['args'])
    expect(window.location.search).toBe('?group=use&row=args')
  })

  test('a column leaves from its header, All brings every column back, and the choice is remembered', async () => {
    window.localStorage.clear()
    const { table, controls, shown } = both()
    await settle()
    const drop = table.querySelector<HTMLElement>('th[data-col=alpha] [data-drop]')!
    expect([drop.hidden, drop.getAttribute('aria-label')]).toEqual([false, 'Hide Alpha'])
    drop.click()
    await settle()
    expect(window.location.search).toBe('?col=beta')
    expect([...new Set(shown('[data-col]'))]).toEqual(['beta'])
    // The last column cannot be taken away.
    expect(table.querySelector<HTMLElement>('th[data-col=beta] [data-drop]')!.hidden).toBe(true)
    expect(window.localStorage.getItem('corpus-site:matrix:/')).toBe('["beta"]')

    // A page opened without a column in its address starts from the remembered ones.
    window.history.replaceState(null, '', '/')
    mount(MatrixControls, { target: 'm', columns: matrix.columns, rows: [] })
    await settle()
    expect(window.location.search).toBe('?col=beta')

    controls.querySelector<HTMLElement>('.cs-matrix-pick .cs-chip')!.click()
    await settle()
    expect(window.location.search).toBe('')
    expect([...new Set(shown('[data-col]'))]).toEqual(['alpha', 'beta'])
    expect(window.localStorage.getItem('corpus-site:matrix:/')).toBeNull()
  })

  test('a choice is a step in the history and typing is not', async () => {
    window.localStorage.clear()
    const { controls } = both()
    await settle()
    const before = window.history.length
    controls.querySelector<HTMLElement>('.cs-matrix-pick [data-column=alpha]')!.click()
    await settle()
    expect(window.history.length).toBe(before + 1)
    const input = controls.querySelector<HTMLInputElement>('input[type=search]')!
    input.value = 'run'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    expect(window.history.length).toBe(before + 1)
    expect(window.location.search).toBe('?col=alpha&q=run')
  })

  test('many columns are a list with a search box in place of chips', async () => {
    window.localStorage.clear()
    const many = Array.from({ length: 30 }, (_, i) => ({
      key: `c${i}`,
      title: `Column ${i}`,
      url: null,
    }))
    const controls = mount(MatrixControls, {
      target: 'none',
      columns: many,
      rows: [],
      columnLabel: 'Tools',
    })
    await settle()
    expect(controls.querySelector('.cs-matrix-pick')).toBeNull()
    const list = controls.querySelector('.cs-matrix-columns')!
    expect(text(list.querySelector('summary'))).toBe('ToolsAll')
    expect(list.querySelectorAll('.cs-check')).toHaveLength(30)
    const find = list.querySelector<HTMLInputElement>('input[type=search]')!
    find.value = 'column 29'
    find.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
    expect(texts(list, '.cs-check')).toEqual(['Column 29'])
    list.querySelector<HTMLInputElement>('.cs-check input')!.click()
    await settle()
    expect(window.location.search).toBe('?col=c29')
    expect(text(list.querySelector('summary'))).toBe('Tools1 of 30')
  })

  test('on a narrow screen it shows one row at a time from the start', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }))
    const { controls, shown } = both()
    await settle()
    expect(shown('tr[data-row]')).toEqual(['config'])
    expect((controls.querySelector('.cs-matrix-rowpick') as HTMLElement).hidden).toBe(false)
    expect(window.location.search).toBe('')
  })
})

test('TypeExplorer starts with the default filters and writes their removal', async () => {
  const data = tasks()
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(data) })),
  )
  const host = mount(TypeExplorer, {
    dataUrl: '/data/types/tasks-defaults.json',
    fields: data.fields,
    total: 5,
    label: 'Tasks',
    defaults: { status: ['done'] },
  })
  await settle()
  expect(text(host.querySelector('[role=status]'))).toBe('1 of 5 tasks')
  expect(window.location.search).toBe('')
  ;(host.querySelector('button.cs-active') as HTMLElement).click()
  await settle()
  expect(text(host.querySelector('[role=status]'))).toBe('5 tasks')
  expect(window.location.search).toBe('?status=')
})

test('SearchApp shows a hit with its summary line', async () => {
  const index = {
    version: 1,
    types: ['Question', 'Answer'],
    weights: [3, 1],
    docs: [
      ['/a/1/', 'Alpha run', 1, 'Alpha', '', 'Syntax: /go'],
      ['/q/1/', 'Run syntax', 0, 'use', '', 'What a user types to run it.'],
    ],
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(index) })),
  )
  window.history.replaceState(null, '', '/search/?q=run')
  const host = mount(SearchApp, { indexUrl: '/data/search-summary.json' })
  await settle()
  expect(texts(host, '.cs-hit-title')).toEqual(['Run syntax', 'Alpha run'])
  expect(texts(host, '.cs-hit-summary')).toEqual(['What a user types to run it.', 'Syntax: /go'])
  expect(host.querySelector('.cs-hit-summary mark')!.textContent).toBe('run')
  expect(host.querySelector('.cs-hit-snippet')).toBeNull()
})
