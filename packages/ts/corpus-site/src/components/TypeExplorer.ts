/**
 * A type's records with their filters: the search box, the filter panel, the active filters,
 * the result count, the table and the pager. It fetches the type's data file when it mounts.
 * Until then it shows its default slot, which is where a page puts the first rows as plain
 * HTML, so the list is there without script and does not move when the data arrives.
 */
import {
  computed,
  defineComponent,
  h,
  nextTick,
  shallowRef,
  useId,
  useTemplateRef,
  type PropType,
} from 'vue'
import { useFilterState, useTypeData, useTypeQuery } from '../client.ts'
import type { DataField } from '../data-types.ts'
import { activeFilters, isEmptyFilter, removeFilter } from '../filter.ts'
import { parseSort } from '../url-state.ts'
import { ActiveFilters } from './ActiveFilters.ts'
import { FilterPanel } from './FilterPanel.ts'
import { Pager } from './Pager.ts'
import { ResultTable } from './ResultTable.ts'

export const TypeExplorer = defineComponent({
  name: 'CorpusTypeExplorer',
  props: {
    /** The address of the type's data file, `data/types/<slug>.json`. */
    dataUrl: { type: String, required: true },
    /** The type's columns and filters, as the data file's `fields`. */
    fields: { type: Array as PropType<DataField[]>, required: true },
    /** How many records the type has, for the count before the data loads. */
    total: { type: Number, required: true },
    /** The type's label, such as `Statements`. */
    label: { type: String, required: true },
    pageSize: { type: Number, default: 50 },
    /** The default sort, written as `parseSort` reads it. */
    defaultSort: { type: String, default: null },
    titleLabel: { type: String, default: 'Title' },
    locale: { type: String, default: 'en' },
    /** The filters a reader starts with, by field name, as the page's address writes them. */
    defaults: { type: Object as PropType<Record<string, string[]>>, default: () => ({}) },
    /** Keep the view in the page's query string. */
    url: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    const { data, error } = useTypeData(() => props.dataUrl)
    const filter = useFilterState(() => props.fields, {
      defaultSort: parseSort(props.defaultSort),
      url: props.url,
      defaults: props.defaults,
    })
    const { matches, page, facets } = useTypeQuery(data, filter.state, () => props.pageSize)

    const panelId = useId()
    const searchId = useId()
    const panelOpen = shallowRef(false)
    const root = useTemplateRef<HTMLElement>('root')

    const hasFilters = computed(() => props.fields.some((f) => f.filter && f.control !== 'hidden'))
    const active = computed(() => activeFilters(props.fields, filter.state.value, data.value))
    const activeCount = computed(
      () => Object.values(filter.state.value.filters).filter((f) => !isEmptyFilter(f)).length,
    )
    const status = computed(() => {
      const noun = props.label.toLowerCase()
      if (data.value === null) return `${props.total} ${noun}`
      const filtered = active.value.length > 0 || filter.state.value.query.trim() !== ''
      return filtered
        ? `${matches.value.length} of ${data.value.count} ${noun}`
        : `${data.value.count} ${noun}`
    })

    const go = (to: number): void => {
      filter.setPage(to)
      void nextTick(() => root.value?.scrollIntoView({ block: 'start' }))
    }

    return () => {
      const state = filter.state.value
      const loaded = data.value
      return h('div', { class: 'cs-explorer', ref: 'root' }, [
        h('div', { class: 'cs-toolbar' }, [
          h('div', { class: 'cs-search' }, [
            h('label', { for: searchId, class: 'cs-sr' }, `Search ${props.label.toLowerCase()}`),
            h('input', {
              id: searchId,
              class: 'cs-input',
              type: 'search',
              value: state.query,
              placeholder: `Search ${props.label.toLowerCase()}`,
              autocomplete: 'off',
              onInput: (event: Event) => filter.setQuery((event.target as HTMLInputElement).value),
            }),
          ]),
          hasFilters.value
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'cs-filter-toggle',
                  'aria-expanded': panelOpen.value,
                  'aria-controls': panelId,
                  onClick: () => (panelOpen.value = !panelOpen.value),
                },
                [
                  'Filters',
                  activeCount.value > 0
                    ? h('span', { class: 'cs-count' }, String(activeCount.value))
                    : null,
                ],
              )
            : null,
        ]),
        hasFilters.value
          ? h(
              'div',
              {
                id: panelId,
                class: 'cs-filter-region',
                role: 'region',
                'aria-label': 'Filters',
                'data-open': panelOpen.value ? '' : undefined,
              },
              [
                h(FilterPanel, {
                  fields: props.fields,
                  state,
                  data: loaded,
                  facets: facets.value,
                  onChange: filter.setFilter,
                }),
              ],
            )
          : null,
        h('div', { class: 'cs-status' }, [
          h('p', { class: 'cs-result-count', role: 'status', 'aria-live': 'polite' }, status.value),
          h(ActiveFilters, {
            filters: active.value,
            query: state.query,
            onRemove: (f) => filter.set(removeFilter(state, f)),
            onClearQuery: () => filter.setQuery(''),
            onClear: filter.clear,
          }),
        ]),
        error.value === null
          ? null
          : h(
              'p',
              { class: 'cs-error', role: 'alert' },
              `The records could not be loaded: ${error.value.message}`,
            ),
        loaded === null
          ? slots.default?.()
          : matches.value.length === 0
            ? h('p', { class: 'cs-none' }, 'No records match these filters.')
            : h(ResultTable, {
                fields: loaded.fields,
                columns: loaded.columns,
                rows: page.value.rows,
                targets: loaded.targets,
                sort: state.sort,
                sortable: true,
                titleLabel: props.titleLabel,
                locale: props.locale,
                onSort: filter.toggleSort,
              }),
        loaded === null
          ? null
          : h(Pager, {
              page: page.value.page,
              pages: page.value.pages,
              start: page.value.start,
              shown: page.value.rows.length,
              total: matches.value.length,
              onGo: go,
            }),
      ])
    }
  },
})
