/** The records of a type as a table: the title, then one column per column field. */
import { computed, defineComponent, h, type PropType } from 'vue'
import type { DataField, DataRecord, DataTarget } from '../data-types.ts'
import type { SortState } from '../filter.ts'
import { ValueCell } from './ValueCell.ts'

export const ResultTable = defineComponent({
  name: 'CorpusResultTable',
  props: {
    /** The type's fields. Those with `column` set are drawn. */
    fields: { type: Array as PropType<DataField[]>, required: true },
    /** The column fields by name, in column order. Default: the order of `fields`. */
    columns: { type: Array as PropType<string[]>, default: null },
    rows: { type: Array as PropType<DataRecord[]>, default: () => [] },
    /** The rows under headings, in place of `rows`. A group with a null label has no heading. */
    groups: {
      type: Array as PropType<{ label: string | null; rows: DataRecord[] }[]>,
      default: null,
    },
    /** Draw the title column. Without it each row ends in a link to its record. */
    showTitle: { type: Boolean, default: true },
    targets: { type: Object as PropType<Record<string, DataTarget>>, default: () => ({}) },
    sort: { type: Object as PropType<SortState | null>, default: null },
    /** Draw the headers as sort buttons. Off for a table with no script behind it. */
    sortable: { type: Boolean, default: false },
    /** The header of the title column. */
    titleLabel: { type: String, default: 'Title' },
    locale: { type: String, default: 'en' },
  },
  emits: {
    /** A header was pressed: sort by this field, or by `title`. */
    sort: (field: string) => typeof field === 'string',
  },
  setup(props, { emit }) {
    const columns = computed(() => {
      const fields = props.fields.filter((f) => f.column && f.name !== 'title')
      const order = props.columns
      if (order === null) return fields
      const at = (name: string): number =>
        order.includes(name) ? order.indexOf(name) : order.length
      return [...fields].sort((a, b) => at(a.name) - at(b.name))
    })
    const header = (name: string, label: string) => {
      const active = props.sort?.field === name
      const direction = active ? (props.sort?.descending ? 'descending' : 'ascending') : undefined
      return h(
        'th',
        { scope: 'col', 'aria-sort': props.sortable ? (direction ?? 'none') : undefined },
        props.sortable
          ? h('button', { type: 'button', class: 'cs-sort', onClick: () => emit('sort', name) }, [
              label,
              h(
                'span',
                { class: 'cs-sort-mark', 'aria-hidden': 'true' },
                active ? (props.sort?.descending ? '↓' : '↑') : '',
              ),
            ])
          : label,
      )
    }
    const width = computed(() => columns.value.length + 1)
    const body = (rows: DataRecord[], label: string | null, key: number) =>
      h('tbody', { key }, [
        label === null
          ? null
          : h('tr', { class: 'cs-group-row' }, [
              h('th', { scope: 'rowgroup', colspan: width.value }, [
                label,
                h('span', { class: 'cs-group-count' }, String(rows.length)),
              ]),
            ]),
        ...rows.map((row) =>
          h('tr', { key: row.url || row.id }, [
            props.showTitle
              ? h('th', { scope: 'row', class: 'cs-cell-title' }, [
                  row.url === '' ? row.title : h('a', { href: row.url }, row.title),
                  row.summary === null ? null : h('div', { class: 'cs-summary' }, row.summary),
                ])
              : null,
            ...columns.value.map((f) =>
              h(
                'td',
                { key: f.name, 'data-label': f.label, 'data-tree': f.tree ? '' : undefined },
                [
                  h(ValueCell, {
                    field: f,
                    value: row.values[f.name] ?? null,
                    targets: props.targets,
                    locale: props.locale,
                  }),
                ],
              ),
            ),
            props.showTitle
              ? null
              : h('td', { class: 'cs-cell-open' }, [
                  row.url === ''
                    ? null
                    : h('a', { href: row.url, title: row.title }, [
                        'Open',
                        h('span', { class: 'cs-sr' }, ` ${row.title}`),
                      ]),
                ]),
          ]),
        ),
      ])
    return () =>
      h('div', { class: 'cs-table-wrap' }, [
        h('table', { class: 'cs-table', 'data-untitled': props.showTitle ? undefined : '' }, [
          h('thead', [
            h('tr', [
              props.showTitle ? header('title', props.titleLabel) : null,
              ...columns.value.map((f) => header(f.name, f.label)),
              props.showTitle
                ? null
                : h('th', { scope: 'col' }, h('span', { class: 'cs-sr' }, 'Record')),
            ]),
          ]),
          ...(props.groups === null
            ? [body(props.rows, null, 0)]
            : props.groups.map((group, i) => body(group.rows, group.label, i))),
        ]),
      ])
  },
})
