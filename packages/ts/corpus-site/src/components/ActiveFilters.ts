/** The active filters as chips: each removes its filter, and one button removes them all. */
import { defineComponent, h, type PropType } from 'vue'
import type { ActiveFilter } from '../filter.ts'

export const ActiveFilters = defineComponent({
  name: 'CorpusActiveFilters',
  props: {
    filters: { type: Array as PropType<ActiveFilter[]>, required: true },
    /** The search box's text, shown as a chip too. */
    query: { type: String, default: '' },
  },
  emits: {
    remove: (filter: ActiveFilter) => typeof filter === 'object',
    'clear-query': () => true,
    clear: () => true,
  },
  setup(props, { emit }) {
    const chip = (key: string, label: string, text: string, onClick: () => void) =>
      h('li', { key }, [
        h(
          'button',
          {
            type: 'button',
            class: 'cs-active',
            'aria-label': `Remove filter ${label}: ${text}`,
            onClick,
          },
          [
            h('span', { class: 'cs-active-label' }, label),
            h('span', { class: 'cs-active-text' }, text),
            h('span', { class: 'cs-active-x', 'aria-hidden': 'true' }, '×'),
          ],
        ),
      ])
    return () => {
      const query = props.query.trim()
      if (props.filters.length === 0 && query === '') return null
      return h('ul', { class: 'cs-actives', 'aria-label': 'Active filters' }, [
        query === '' ? null : chip('\0q', 'Search', `"${query}"`, () => emit('clear-query')),
        ...props.filters.map((f) =>
          chip(`${f.field}\0${f.value ?? ''}`, f.label, f.text, () => emit('remove', f)),
        ),
        h('li', { key: '\0clear' }, [
          h(
            'button',
            { type: 'button', class: 'cs-clear', onClick: () => emit('clear') },
            'Clear all',
          ),
        ]),
      ])
    }
  },
})
