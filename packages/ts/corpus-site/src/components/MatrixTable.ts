/**
 * A matrix view as a table: a row per row item, a column per column item, and in each cell the
 * records that hold both. It is drawn once, as plain HTML. `MatrixControls` then hides rows and
 * columns by the `data-row`, `data-group` and `data-col` attributes set here.
 */
import { defineComponent, h, type PropType } from 'vue'
import type { MatrixData, MatrixRow } from '../data-types.ts'
import { TreeValue } from './TreeValue.ts'

export const MatrixTable = defineComponent({
  name: 'CorpusMatrixTable',
  props: {
    matrix: { type: Object as PropType<MatrixData>, required: true },
    /** The id `MatrixControls` finds the table by. */
    id: { type: String, required: true },
  },
  setup(props) {
    const row = (item: MatrixRow) =>
      h(
        'tr',
        {
          key: item.key,
          'data-row': item.key,
          'data-group': item.group ?? undefined,
          'data-text': `${item.title} ${item.summary ?? ''}`.toLowerCase(),
        },
        [
          h('th', { scope: 'row', class: 'cs-matrix-row' }, [
            item.url === null ? item.title : h('a', { href: item.url }, item.title),
            item.summary === null ? null : h('div', { class: 'cs-summary' }, item.summary),
          ]),
          ...props.matrix.columns.map((column, i) => {
            const cells = item.cells[i] ?? []
            return h(
              'td',
              {
                key: column.key,
                'data-col': column.key,
                'data-label': column.title,
                'data-empty': cells.length === 0 ? '' : undefined,
              },
              cells.length === 0
                ? [h('span', { class: 'cs-empty', 'aria-label': 'none' }, '–')]
                : cells.map((cell, n) =>
                    h('div', { key: n, class: 'cs-matrix-cell' }, [
                      h(TreeValue, { tree: cell.value, compact: true }),
                      cell.url === null
                        ? null
                        : h('a', { class: 'cs-matrix-open', href: cell.url, title: cell.title }, [
                            h('span', { 'aria-hidden': 'true' }, '→'),
                            h('span', { class: 'cs-sr' }, cell.title),
                          ]),
                    ]),
                  ),
            )
          }),
        ],
      )
    return () => {
      const { matrix } = props
      const groups =
        matrix.groups.length === 0
          ? [{ key: null, label: null, rows: matrix.rows }]
          : [
              ...matrix.groups.map((group) => ({
                key: group.key as string | null,
                label: group.label as string | null,
                rows: matrix.rows.filter((r) => r.group === group.key),
              })),
              { key: null, label: 'Other', rows: matrix.rows.filter((r) => r.group === null) },
            ].filter((group) => group.rows.length > 0)
      return h(
        'div',
        {
          id: props.id,
          class: 'cs-matrix-wrap',
          role: 'region',
          'aria-label': matrix.label,
          tabindex: 0,
        },
        [
          h('table', { class: 'cs-matrix' }, [
            h('thead', [
              h('tr', [
                h('th', { scope: 'col', class: 'cs-matrix-corner' }, matrix.rowLabel),
                ...matrix.columns.map((column) =>
                  h('th', { key: column.key, scope: 'col', 'data-col': column.key }, [
                    column.url === null ? column.title : h('a', { href: column.url }, column.title),
                    // `MatrixControls` shows the button and answers it. Without script it stays hidden.
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'cs-matrix-drop',
                        'data-drop': column.key,
                        'aria-label': `Hide ${column.title}`,
                        title: `Hide ${column.title}`,
                        hidden: true,
                      },
                      '×',
                    ),
                  ]),
                ),
              ]),
            ]),
            ...groups.map((group) =>
              h('tbody', { key: group.key ?? '', 'data-group': group.key ?? undefined }, [
                group.label === null
                  ? null
                  : h('tr', { class: 'cs-group-row' }, [
                      h('th', { scope: 'rowgroup', colspan: matrix.columns.length + 1 }, [
                        h('span', group.label),
                        h('span', { class: 'cs-group-count' }, String(group.rows.length)),
                      ]),
                    ]),
                ...group.rows.map(row),
              ]),
            ),
          ]),
        ],
      )
    }
  },
})
