// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { Component } from 'vue'
import type { ActiveFilter, FilterValue } from '../src/filter.ts'
import { tasks } from './fixtures.ts'
import { components, vue } from './setup-dom.ts'

const {
  ActiveFilters,
  FieldInfo,
  FilterControl,
  FilterPanel,
  Pager,
  ResultTable,
  SearchApp,
  TypeExplorer,
  ValueCell,
} = components
const { createApp, h, nextTick } = vue

const data = tasks()
const field = (name: string) => data.fields.find((f) => f.name === name)!

/** Mount `component` in the document. The host element is removed after each test. */
function mount(component: Component, props: Record<string, unknown>, slot?: string): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({
    render: () =>
      h(
        component,
        props,
        slot === undefined ? undefined : { default: () => h('p', { class: 'static' }, slot) },
      ),
  })
  app.mount(host)
  unmounts.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}

const unmounts: (() => void)[] = []
afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

const click = (element: Element | null | undefined): void => {
  ;(element as HTMLElement).click()
}

const type = (input: Element | null, value: string, event = 'input'): void => {
  ;(input as HTMLInputElement).value = value
  input!.dispatchEvent(new Event(event, { bubbles: true }))
}

const text = (element: Element | null | undefined): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim()

describe('ValueCell', () => {
  const cell = (name: string, value: unknown): HTMLElement =>
    mount(ValueCell, { field: field(name), value, targets: data.targets })

  test('draws a badge, a link to a record, a date and a dash', () => {
    expect(cell('status', 'doing').querySelector('.cs-badge')!.textContent).toBe('Doing')
    const link = cell('owner', 'people/ada').querySelector('a')!
    expect([link.getAttribute('href'), link.textContent]).toEqual(['/people/ada/', 'Ada Lovelace'])
    const time = cell('due', '2026-01-10').querySelector('time')!
    expect([time.getAttribute('datetime'), time.textContent]).toEqual([
      '2026-01-10',
      'Jan 10, 2026',
    ])
    expect(cell('note', null).querySelector('.cs-empty')!.getAttribute('aria-label')).toBe('none')
  })

  test('a long list shows three values and the number left out', () => {
    const host = cell('tags', ['ui', 'api', 'a', 'b', 'c'])
    expect(host.querySelectorAll('.cs-value-item')).toHaveLength(3)
    expect(host.querySelector('.cs-more')!.textContent).toBe('+2')
  })
})

describe('ResultTable', () => {
  test('draws a row per record, with the title as the row header and a label on each cell', () => {
    const host = mount(ResultTable, {
      fields: data.fields,
      columns: data.columns,
      rows: data.records,
      targets: data.targets,
    })
    expect([...host.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Title',
      'Status',
      'Owner',
      'Due',
      'Points',
      'Tags',
      'Urgent',
      'Note',
    ])
    expect(host.querySelectorAll('tbody tr')).toHaveLength(5)
    const first = host.querySelector('tbody tr')!
    expect(first.querySelector('th[scope=row] a')!.getAttribute('href')).toBe('/tasks/t-1/')
    expect(first.querySelector('td')!.getAttribute('data-label')).toBe('Status')
    expect(host.querySelector('thead button')).toBeNull()
    expect(text(host.querySelectorAll('tbody tr')[2]!.querySelector('.cs-summary'))).toBe(
      'For search',
    )
  })

  test('sortable headers are buttons that say which way the table is sorted', () => {
    const onSort = vi.fn()
    const host = mount(ResultTable, {
      fields: data.fields,
      rows: data.records,
      sortable: true,
      sort: { field: 'points', descending: true },
      onSort,
    })
    const headers = [...host.querySelectorAll('thead th')]
    expect(headers.map((th) => th.getAttribute('aria-sort'))).toContain('descending')
    expect(headers[0]!.getAttribute('aria-sort')).toBe('none')
    click(headers[0]!.querySelector('button'))
    expect(onSort).toHaveBeenCalledWith('title')
  })
})

describe('FilterControl', () => {
  const control = (
    name: string,
    value: FilterValue | null,
    extra: Record<string, unknown> = {},
  ) => {
    const onChange = vi.fn()
    const host = mount(FilterControl, {
      field: field(name),
      value,
      inputId: 'i',
      labelId: 'l',
      onChange,
      ...extra,
    })
    return { host, onChange }
  }
  const options = data.fields[0]!.options

  test('chips are toggle buttons with counts, and several can be on', () => {
    const { host, onChange } = control(
      'status',
      { kind: 'set', values: ['todo'] },
      { options, counts: { todo: 2, doing: 0 } },
    )
    const chips = [...host.querySelectorAll('button')]
    expect(host.querySelector('[role=group]')!.getAttribute('aria-labelledby')).toBe('l')
    expect(chips.map((c) => [text(c), c.getAttribute('aria-pressed')])).toEqual([
      ['To do2', 'true'],
      ['Doing0', 'false'],
      ['Done0', 'false'],
    ])
    expect(chips[1]!.hasAttribute('data-empty')).toBe(true)
    click(chips[2])
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'set', values: ['todo', 'done'] })
    click(chips[0])
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  test('before the data loads, chips show the counts the page was built with', () => {
    const { host } = control('status', null, { options })
    expect([...host.querySelectorAll('.cs-count')].map((c) => c.textContent)).toEqual([
      '2',
      '2',
      '1',
    ])
  })

  test('a select offers Any and each value with its count', () => {
    const { host, onChange } = control('tags', null, {
      options: field('tags').options,
      counts: { ui: 2, api: 3 },
    })
    const select = host.querySelector('select')!
    expect(select.id).toBe('i')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Any', 'UI (2)', 'API (3)'])
    type(select, 'api', 'change')
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'set', values: ['api'] })
    type(select, '', 'change')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  test('a range has a labelled from and to, numbers or dates', () => {
    const { host, onChange } = control(
      'points',
      { kind: 'range', min: '2', max: null },
      { bounds: { min: '1', max: '8' } },
    )
    const [from, to] = [...host.querySelectorAll('input')]
    expect([from!.type, from!.getAttribute('aria-label'), to!.getAttribute('aria-label')]).toEqual([
      'number',
      'Points, from',
      'Points, to',
    ])
    expect(to!.placeholder).toBe('8')
    type(to!, '5', 'change')
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'range', min: '2', max: '5' })
    type(from!, '', 'change')
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(control('due', null).host.querySelector('input')!.type).toBe('date')
  })

  test('a toggle is a radio group of any, yes and no', () => {
    const { host, onChange } = control('urgent', { kind: 'toggle', value: true })
    const radios = [...host.querySelectorAll<HTMLInputElement>('input[type=radio]')]
    expect(host.querySelector('[role=radiogroup]')).not.toBeNull()
    expect(radios.map((r) => r.checked)).toEqual([false, true, false])
    click(radios[2])
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'toggle', value: false })
    click(radios[0])
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  test('a text box filters as the reader types', () => {
    const { host, onChange } = control('note', null)
    type(host.querySelector('input'), 'col')
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'text', value: 'col' })
    type(host.querySelector('input'), ' ')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})

describe('FieldInfo', () => {
  const described = {
    ...field('status'),
    help: 'Where the task is.',
    info: 'Tasks move left to right.',
    link: { href: '/guide/', label: 'The guide' },
    options: field('status').options.map((o, i) => ({
      ...o,
      description: i === 0 ? 'Not started.' : null,
    })),
  }

  test('the button opens a note with the help, the explanation, the values and the link', () => {
    const host = mount(FieldInfo, { field: described })
    const button = host.querySelector('button')!
    const note = host.querySelector('[role=note]') as HTMLElement
    expect([button.getAttribute('aria-label'), button.getAttribute('aria-expanded')]).toEqual([
      'About Status',
      'false',
    ])
    expect(button.getAttribute('aria-controls')).toBe(note.id)
    expect(note.hidden).toBe(true)
    click(button)
    return nextTick().then(() => {
      expect(button.getAttribute('aria-expanded')).toBe('true')
      expect(note.hidden).toBe(false)
      expect(text(note)).toBe(
        'Where the task is.Tasks move left to right.To doNot started.The guide',
      )
      expect(note.querySelector('a')!.getAttribute('href')).toBe('/guide/')
    })
  })

  test('Escape closes the note and puts the focus back on the button', async () => {
    const host = mount(FieldInfo, { field: described })
    const button = host.querySelector('button')!
    click(button)
    await nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
  })
})

describe('FilterPanel', () => {
  test('each filter has a label for its control, a note and an info button when there is something to say', () => {
    const fields = data.fields.map((f) =>
      f.name === 'status' ? { ...f, note: 'Pick one.', help: 'Help.' } : f,
    )
    const onChange = vi.fn()
    const host = mount(FilterPanel, {
      fields,
      state: { query: '', filters: {}, sort: null, page: 1 },
      data,
      onChange,
    })
    const filters = [...host.querySelectorAll('.cs-filter')]
    expect(filters.map((f) => f.querySelector('label')!.textContent)).toEqual([
      'Status',
      'Tags',
      'Owner',
      'Points',
      'Due',
      'Urgent',
      'Note',
      'Q',
    ])
    for (const filter of filters) {
      const label = filter.querySelector('label')!
      expect(document.getElementById(label.htmlFor), label.textContent ?? '').not.toBeNull()
    }
    expect(filters[0]!.querySelector('.cs-filter-note')!.textContent).toBe('Pick one.')
    expect(filters[0]!.querySelector('.cs-info-button')).not.toBeNull()
    expect(filters[1]!.querySelector('.cs-info-button')).toBeNull()
    // A reference select gets its values from the data.
    expect([...filters[2]!.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Any',
      'Ada Lovelace',
      'Grace Hopper',
    ])
    click(filters[0]!.querySelector('.cs-chip'))
    expect(onChange).toHaveBeenCalledWith('status', { kind: 'set', values: ['todo'] })
  })
})

test('ActiveFilters draws a chip per filter and a clear button, or nothing', () => {
  const filters: ActiveFilter[] = [
    { field: 'status', label: 'Status', text: 'To do', value: 'todo' },
  ]
  const onRemove = vi.fn()
  const onClear = vi.fn()
  const onClearQuery = vi.fn()
  const host = mount(ActiveFilters, { filters, query: 'table', onRemove, onClear, onClearQuery })
  const buttons = [...host.querySelectorAll('button')]
  expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
    'Remove filter Search: "table"',
    'Remove filter Status: To do',
    'Clear all',
  ])
  click(buttons[0])
  click(buttons[1])
  click(buttons[2])
  expect(onClearQuery).toHaveBeenCalledOnce()
  expect(onRemove).toHaveBeenCalledWith(filters[0])
  expect(onClear).toHaveBeenCalledOnce()
  expect(mount(ActiveFilters, { filters: [] }).querySelector('ul')).toBeNull()
})

test('Pager says where the reader is and stops at the ends', () => {
  const onGo = vi.fn()
  const host = mount(Pager, { page: 1, pages: 3, start: 0, shown: 50, total: 120, onGo })
  const [previous, next] = [...host.querySelectorAll('button')]
  expect(text(host.querySelector('.cs-page-status'))).toBe('1–50 of 120 · page 1 of 3')
  expect(previous!.disabled).toBe(true)
  click(next)
  expect(onGo).toHaveBeenCalledWith(2)
  expect(
    mount(Pager, { page: 1, pages: 1, start: 0, shown: 5, total: 5 }).querySelector('nav'),
  ).toBeNull()
})

describe('TypeExplorer', () => {
  const stubFetch = (body: unknown, ok = true) => {
    const fetch = vi.fn(() =>
      Promise.resolve({
        ok,
        status: ok ? 200 : 404,
        statusText: ok ? 'OK' : 'Not Found',
        json: () => Promise.resolve(body),
      }),
    )
    vi.stubGlobal('fetch', fetch)
    return fetch
  }
  const explorer = (url: string, extra: Record<string, unknown> = {}) =>
    mount(
      TypeExplorer,
      { dataUrl: url, fields: data.fields, total: 5, label: 'Tasks', pageSize: 2, ...extra },
      'the first rows',
    )

  test('shows its slot and the built count until the data file loads, then its own table', async () => {
    const fetch = stubFetch(data)
    const host = explorer('/data/types/tasks-1.json')
    expect(host.querySelector('.static')!.textContent).toBe('the first rows')
    expect(text(host.querySelector('[role=status]'))).toBe('5 tasks')
    expect(host.querySelector('table')).toBeNull()
    await settle()
    expect(fetch).toHaveBeenCalledWith('/data/types/tasks-1.json')
    expect(host.querySelector('.static')).toBeNull()
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(text(host.querySelector('.cs-page-status'))).toBe('1–2 of 5 · page 1 of 3')
  })

  test('reads the view from the query string and writes it back', async () => {
    stubFetch(data)
    window.history.replaceState(null, '', '/tasks/?status=doing&sort=-points')
    const host = explorer('/data/types/tasks-2.json')
    await settle()
    expect(text(host.querySelector('[role=status]'))).toBe('2 of 5 tasks')
    expect([...host.querySelectorAll('tbody th a')].map((a) => a.textContent)).toEqual([
      'Add the filters',
      'Write the index',
    ])
    expect(host.querySelector('.cs-chip[aria-pressed=true]')!.textContent).toContain('Doing')

    type(host.querySelector('.cs-search input'), 'index')
    await settle()
    expect(window.location.search).toBe('?q=index&status=doing&sort=-points')
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)

    click([...host.querySelectorAll('.cs-actives button')].at(-1))
    await settle()
    expect(window.location.search).toBe('?sort=-points')
    expect(text(host.querySelector('[role=status]'))).toBe('5 tasks')
  })

  test('a header sorts, a second press reverses, and the pager turns the page', async () => {
    stubFetch(data)
    const host = explorer('/data/types/tasks-3.json', { defaultSort: 'title' })
    await settle()
    const titles = (): (string | null)[] =>
      [...host.querySelectorAll('tbody th a')].map((a) => a.textContent)
    expect(titles()).toEqual(['Add the filters', 'Draw the table'])
    expect(window.location.search).toBe('')
    click(host.querySelector('thead th button'))
    await settle()
    expect(titles()).toEqual(['Write the index', 'Someday'])
    expect(window.location.search).toBe('?sort=-title')
    Element.prototype.scrollIntoView = vi.fn()
    click([...host.querySelectorAll('.cs-pager button')][1])
    await settle()
    expect(titles()).toEqual(['Ship it', 'Draw the table'])
    expect(window.location.search).toBe('?sort=-title&page=2')
  })

  test('says so when nothing matches, and when the data file cannot be loaded', async () => {
    stubFetch(data)
    window.history.replaceState(null, '', '/tasks/?q=zzz')
    const none = explorer('/data/types/tasks-4.json')
    await settle()
    expect(text(none.querySelector('.cs-none'))).toBe('No records match these filters.')

    stubFetch(null, false)
    const failed = explorer('/data/types/missing.json')
    await settle()
    expect(text(failed.querySelector('[role=alert]'))).toContain('could not be loaded')
    expect(failed.querySelector('.static')).not.toBeNull()
  })

  test('the filter button says whether the panel is open', async () => {
    stubFetch(data)
    const host = explorer('/data/types/tasks-5.json')
    const button = host.querySelector('.cs-filter-toggle')!
    const region = document.getElementById(button.getAttribute('aria-controls')!)!
    expect([button.getAttribute('aria-expanded'), region.hasAttribute('data-open')]).toEqual([
      'false',
      false,
    ])
    click(button)
    await nextTick()
    expect([button.getAttribute('aria-expanded'), region.hasAttribute('data-open')]).toEqual([
      'true',
      true,
    ])
  })
})

describe('SearchApp', () => {
  const index = {
    version: 1,
    types: ['Task'],
    docs: [
      ['/tasks/t-1/', 'Draw the table', 0, 'To do · Ada Lovelace', 'Columns first, then rows.'],
      ['/tasks/t-3/', 'Write the index', 0, 'Doing', 'One row of text per record.'],
    ],
  }

  test('fetches the index only when there is something to search for', async () => {
    const fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(index) }))
    vi.stubGlobal('fetch', fetch)
    const host = mount(SearchApp, { indexUrl: '/data/search-1.json' })
    await settle()
    expect(fetch).not.toHaveBeenCalled()
    expect(text(host.querySelector('[role=status]'))).toBe(
      'Type to search titles, fields and text.',
    )

    type(host.querySelector('input'), 'rows')
    await settle()
    expect(fetch).toHaveBeenCalledOnce()
    expect(window.location.search).toBe('?q=rows')
    expect(text(host.querySelector('[role=status]'))).toBe('1 record matches.')
    const hit = host.querySelector('.cs-hit')!
    expect(hit.querySelector('a')!.getAttribute('href')).toBe('/tasks/t-1/')
    expect(hit.querySelector('mark')!.textContent).toBe('rows')
  })

  test('starts from ?q=', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(index) })),
    )
    window.history.replaceState(null, '', '/search/?q=the')
    const host = mount(SearchApp, { indexUrl: '/data/search-2.json' })
    await settle()
    expect((host.querySelector('input') as HTMLInputElement).value).toBe('the')
    expect(host.querySelectorAll('.cs-hit')).toHaveLength(2)
  })
  test('a retry that works clears the error', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Error', json: () => null })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(index) })
    vi.stubGlobal('fetch', fetch)
    const host = mount(SearchApp, { indexUrl: '/data/search-retry.json' })
    type(host.querySelector('input'), 'rows')
    await settle()
    expect(text(host.querySelector('[role=status]'))).toContain('could not be loaded')
    type(host.querySelector('input'), 'row')
    await settle()
    expect(text(host.querySelector('[role=status]'))).toBe('2 records match.')
  })
})
