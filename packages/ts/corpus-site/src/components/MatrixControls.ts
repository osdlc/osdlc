/**
 * The controls of a matrix view: pick a group of rows, pick the columns, filter the rows by
 * text, and step through one row at a time. The table is plain HTML drawn by `MatrixTable`, so
 * it is whole without script. This component hides its rows and columns to fit the choice, and
 * keeps the choice in the page's address: `?group=skills&col=codex&col=goose&row=…&q=…`.
 * The columns are a row of chips, or past `MAX_COLUMN_CHIPS` a list with a search box. The
 * browser remembers the chosen columns for an address that names none.
 */
import {
  computed,
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  shallowRef,
  useId,
  watchEffect,
  type PropType,
} from 'vue'
import type { MatrixItem } from '../data-types.ts'

/** The most columns shown as chips. More are a list behind a button, with a search box. */
export const MAX_COLUMN_CHIPS = 24

/** What a reader chose on a matrix view. */
export interface MatrixState {
  /** The key of the group shown, or null for every group. */
  group: string | null
  /** The keys of the columns shown. Empty for all. */
  columns: string[]
  /** The key of the one row shown, or null. */
  row: string | null
  /** Text a row's title or summary must hold. */
  query: string
}

/** The state a query string holds. Keys that name no group, column or row are dropped. */
export function parseMatrixState(
  search: string,
  known: { groups: string[]; columns: string[]; rows: string[] },
): MatrixState {
  const params = new URLSearchParams(search)
  const group = params.get('group')
  const row = params.get('row')
  return {
    group: group !== null && known.groups.includes(group) ? group : null,
    columns: [...new Set(params.getAll('col'))].filter((c) => known.columns.includes(c)),
    row: row !== null && known.rows.includes(row) ? row : null,
    query: params.get('q') ?? '',
  }
}

/** The query string for a state, without the `?`, and `''` for the whole table. */
export function formatMatrixState(state: MatrixState): string {
  const params = new URLSearchParams()
  if (state.group !== null) params.set('group', state.group)
  for (const column of state.columns) params.append('col', column)
  if (state.row !== null) params.set('row', state.row)
  if (state.query.trim() !== '') params.set('q', state.query.trim())
  return params.toString()
}

export const MatrixControls = defineComponent({
  name: 'CorpusMatrixControls',
  props: {
    /** The id of the `MatrixTable` to control. */
    target: { type: String, required: true },
    groups: {
      type: Array as PropType<{ key: string; label: string; count: number }[]>,
      default: () => [],
    },
    columns: { type: Array as PropType<MatrixItem[]>, required: true },
    /** The rows: key, title and group key, in table order. */
    rows: {
      type: Array as PropType<{ key: string; title: string; group: string | null }[]>,
      required: true,
    },
    rowLabel: { type: String, default: 'Rows' },
    columnLabel: { type: String, default: 'Columns' },
    /** The width under which one row is shown at a time, as a media query. */
    narrow: { type: String, default: '(max-width: 50rem)' },
  },
  setup(props) {
    const known = () => ({
      groups: props.groups.map((g) => g.key),
      columns: props.columns.map((c) => c.key),
      rows: props.rows.map((r) => r.key),
    })
    const state = shallowRef<MatrixState>({ group: null, columns: [], row: null, query: '' })
    const isNarrow = shallowRef(false)
    const mounted = shallowRef(false)
    /** Each row's title and summary, lower-cased, as the table holds them. */
    const texts = shallowRef(new Map<string, string>())
    const queryId = useId()
    const rowId = useId()
    const columnsId = useId()
    const columnQuery = shallowRef('')

    // The chosen columns, kept by the browser for an address that names none.
    const storeKey = (): string => `corpus-site:matrix:${window.location.pathname}`
    const remember = (columns: string[]): void => {
      try {
        if (columns.length === 0) window.localStorage.removeItem(storeKey())
        else window.localStorage.setItem(storeKey(), JSON.stringify(columns))
      } catch {
        // No storage: the address still holds the choice.
      }
    }
    const remembered = (): string[] => {
      try {
        const held: unknown = JSON.parse(window.localStorage.getItem(storeKey()) ?? '[]')
        const columns = known().columns
        return Array.isArray(held) ? held.filter((c) => columns.includes(c)) : []
      } catch {
        return []
      }
    }

    /** Take a new state. A choice is a step in the history, and typing is not. */
    const set = (next: MatrixState, step = true): void => {
      const columnsChanged = next.columns.join('\0') !== state.value.columns.join('\0')
      state.value = next
      if (columnsChanged) remember(next.columns)
      const query = formatMatrixState(next)
      const url = `${window.location.pathname}${query === '' ? '' : `?${query}`}${window.location.hash}`
      if (step) window.history.pushState(window.history.state, '', url)
      else window.history.replaceState(window.history.state, '', url)
    }
    const read = (): void => {
      state.value = parseMatrixState(window.location.search, known())
    }

    /** The rows the group and the text leave, in order. */
    const candidates = computed(() => {
      const { group, query } = state.value
      const words = query.toLowerCase().split(/\s+/).filter(Boolean)
      return props.rows.filter((row) => {
        if (group !== null && row.group !== group) return false
        if (words.length === 0) return true
        const text = texts.value.get(row.key) ?? row.title.toLowerCase()
        return words.every((word) => text.includes(word))
      })
    })
    /** The one row shown: the chosen one, or on a narrow screen the first that fits. */
    const current = computed(() => {
      const chosen = candidates.value.find((row) => row.key === state.value.row)
      if (chosen !== undefined) return chosen.key
      return isNarrow.value ? (candidates.value[0]?.key ?? null) : null
    })
    const shownRows = computed(() =>
      current.value === null
        ? candidates.value
        : candidates.value.filter((r) => r.key === current.value),
    )

    let media: MediaQueryList | undefined
    const onMedia = (): void => {
      isNarrow.value = media?.matches ?? false
    }
    const onDrop = (event: Event): void => {
      const button = (event.target as Element | null)?.closest?.('[data-drop]')
      const key = button?.getAttribute('data-drop')
      if (key !== null && key !== undefined) dropColumn(key)
    }
    onMounted(() => {
      read()
      if (!new URLSearchParams(window.location.search).has('col')) {
        const columns = remembered()
        if (columns.length > 0) set({ ...state.value, columns }, false)
      }
      window.addEventListener('popstate', read)
      media = window.matchMedia?.(props.narrow)
      media?.addEventListener('change', onMedia)
      onMedia()
      const table = document.getElementById(props.target)
      table?.addEventListener('click', onDrop)
      texts.value = new Map(
        [...(table?.querySelectorAll<HTMLElement>('tr[data-row]') ?? [])].map((tr) => [
          tr.dataset['row'] ?? '',
          tr.dataset['text'] ?? '',
        ]),
      )
      mounted.value = true
    })
    onUnmounted(() => {
      window.removeEventListener('popstate', read)
      media?.removeEventListener('change', onMedia)
      document.getElementById(props.target)?.removeEventListener('click', onDrop)
    })

    // Hide what the choice leaves out. The table is outside this component, so this is plain DOM.
    watchEffect(() => {
      if (!mounted.value) return
      const table = document.getElementById(props.target)
      if (table === null) return
      const rows = new Set(shownRows.value.map((row) => row.key))
      const columns = state.value.columns
      for (const tr of table.querySelectorAll<HTMLElement>('tr[data-row]'))
        tr.hidden = !rows.has(tr.dataset['row'] ?? '')
      for (const body of table.querySelectorAll<HTMLElement>('tbody'))
        body.hidden = body.querySelector('tr[data-row]:not([hidden])') === null
      for (const cell of table.querySelectorAll<HTMLElement>('[data-col]'))
        cell.hidden = columns.length > 0 && !columns.includes(cell.dataset['col'] ?? '')
      // A column can be taken away from its header while another is left.
      const left = columns.length === 0 ? props.columns.length : columns.length
      for (const button of table.querySelectorAll<HTMLElement>('[data-drop]'))
        button.hidden = left <= 1
      table.toggleAttribute('data-one-row', current.value !== null)
    })

    const step = (by: number): void => {
      const at = candidates.value.findIndex((row) => row.key === current.value)
      const next = candidates.value[at + by]
      if (next !== undefined) set({ ...state.value, row: next.key })
    }
    const setColumns = (chosen: string[]): void => {
      const all = props.columns.map((c) => c.key)
      const ordered = all.filter((c) => chosen.includes(c))
      set({ ...state.value, columns: ordered.length === all.length ? [] : ordered })
    }
    /** Pick a column, or let go of a picked one. With none picked every column shows. */
    const toggleColumn = (key: string): void => {
      const now = state.value.columns
      setColumns(now.includes(key) ? now.filter((c) => c !== key) : [...now, key])
    }
    /** Take one column away from what shows. */
    const dropColumn = (key: string): void => {
      const now =
        state.value.columns.length === 0 ? props.columns.map((c) => c.key) : state.value.columns
      if (now.length > 1) setColumns(now.filter((c) => c !== key))
    }

    // The columns as chips: none pressed shows all, and a pressed one is among those shown.
    const columnChips = () => {
      const { columns } = state.value
      return h('div', { class: 'cs-matrix-pick' }, [
        h('span', { id: columnsId, class: 'cs-matrix-pick-label' }, props.columnLabel),
        h('div', { class: 'cs-chips', role: 'group', 'aria-labelledby': columnsId }, [
          h(
            'button',
            {
              type: 'button',
              class: 'cs-chip',
              'aria-pressed': columns.length === 0,
              onClick: () => setColumns([]),
            },
            ['All', h('span', { class: 'cs-count' }, String(props.columns.length))],
          ),
          ...props.columns.map((column) =>
            h(
              'button',
              {
                key: column.key,
                type: 'button',
                class: 'cs-chip',
                'data-column': column.key,
                'aria-pressed': columns.includes(column.key),
                onClick: () => toggleColumn(column.key),
              },
              column.title,
            ),
          ),
        ]),
      ])
    }
    // Too many for chips: a list behind a button, with a box that narrows it.
    const columnList = () => {
      const { columns } = state.value
      const words = columnQuery.value.toLowerCase().split(/\s+/).filter(Boolean)
      const listed = props.columns.filter((column) =>
        words.every((word) => column.title.toLowerCase().includes(word)),
      )
      return h('details', { class: 'cs-matrix-columns' }, [
        h('summary', { class: 'cs-filter-toggle' }, [
          props.columnLabel,
          h(
            'span',
            { class: 'cs-count' },
            columns.length === 0 ? 'All' : `${columns.length} of ${props.columns.length}`,
          ),
        ]),
        h('div', { class: 'cs-matrix-column-list' }, [
          h('input', {
            class: 'cs-input',
            type: 'search',
            value: columnQuery.value,
            placeholder: `Find ${props.columnLabel.toLowerCase()}`,
            'aria-label': `Find ${props.columnLabel.toLowerCase()}`,
            autocomplete: 'off',
            onInput: (event: Event) => {
              columnQuery.value = (event.target as HTMLInputElement).value
            },
          }),
          h(
            'button',
            {
              type: 'button',
              class: 'cs-link-button',
              disabled: columns.length === 0,
              onClick: () => setColumns([]),
            },
            'Show all',
          ),
          ...listed.map((column) =>
            h('label', { key: column.key, class: 'cs-check' }, [
              h('input', {
                type: 'checkbox',
                checked: columns.includes(column.key),
                onChange: () => toggleColumn(column.key),
              }),
              h('span', column.title),
            ]),
          ),
        ]),
      ])
    }

    return () => {
      const { group, columns, query } = state.value
      const at = candidates.value.findIndex((row) => row.key === current.value)
      const columnCount = columns.length === 0 ? props.columns.length : columns.length
      return h('div', { class: 'cs-matrix-controls' }, [
        props.groups.length === 0
          ? null
          : h('div', { class: 'cs-chips cs-matrix-groups', role: 'group', 'aria-label': 'Group' }, [
              h(
                'button',
                {
                  type: 'button',
                  class: 'cs-chip',
                  'aria-pressed': group === null,
                  onClick: () => set({ ...state.value, group: null, row: null }),
                },
                ['All', h('span', { class: 'cs-count' }, String(props.rows.length))],
              ),
              ...props.groups.map((g) =>
                h(
                  'button',
                  {
                    key: g.key,
                    type: 'button',
                    class: 'cs-chip',
                    'aria-pressed': group === g.key,
                    onClick: () => set({ ...state.value, group: g.key, row: null }),
                  },
                  [g.label, h('span', { class: 'cs-count' }, String(g.count))],
                ),
              ),
            ]),
        props.columns.length > MAX_COLUMN_CHIPS ? columnList() : columnChips(),
        h('div', { class: 'cs-matrix-tools' }, [
          h('div', { class: 'cs-search' }, [
            h('label', { for: queryId, class: 'cs-sr' }, `Filter ${props.rowLabel.toLowerCase()}`),
            h('input', {
              id: queryId,
              class: 'cs-input',
              type: 'search',
              value: query,
              placeholder: `Filter ${props.rowLabel.toLowerCase()}`,
              autocomplete: 'off',
              onInput: (event: Event) =>
                set(
                  { ...state.value, query: (event.target as HTMLInputElement).value, row: null },
                  false,
                ),
            }),
          ]),
        ]),
        h(
          'div',
          { class: 'cs-matrix-rowpick', hidden: !isNarrow.value && current.value === null },
          [
            h('label', { for: rowId, class: 'cs-sr' }, props.rowLabel),
            h(
              'select',
              {
                id: rowId,
                class: 'cs-select',
                value: current.value ?? '',
                onChange: (event: Event) =>
                  set({ ...state.value, row: (event.target as HTMLSelectElement).value || null }),
              },
              [
                isNarrow.value
                  ? null
                  : h('option', { value: '' }, `All ${props.rowLabel.toLowerCase()}`),
                ...candidates.value.map((row) =>
                  h(
                    'option',
                    { key: row.key, value: row.key, selected: row.key === current.value },
                    row.title,
                  ),
                ),
              ],
            ),
            current.value === null
              ? null
              : h('div', { class: 'cs-matrix-step' }, [
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'cs-button',
                      disabled: at <= 0,
                      onClick: () => step(-1),
                    },
                    'Previous',
                  ),
                  h('span', { class: 'cs-matrix-at' }, `${at + 1} of ${candidates.value.length}`),
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'cs-button',
                      disabled: at === -1 || at >= candidates.value.length - 1,
                      onClick: () => step(1),
                    },
                    'Next',
                  ),
                ]),
          ],
        ),
        h(
          'p',
          { class: 'cs-result-count', role: 'status', 'aria-live': 'polite' },
          candidates.value.length === 0
            ? 'Nothing matches.'
            : `${shownRows.value.length} of ${props.rows.length} ${props.rowLabel.toLowerCase()}, ${columnCount} of ${props.columns.length} ${props.columnLabel.toLowerCase()}`,
        ),
      ])
    }
  },
})
