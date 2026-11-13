/** The filters of a type: one labelled control per filter field, with its note and its info button. */
import { computed, defineComponent, h, useId, type PropType } from 'vue'
import type { DataField, TypeData } from '../data-types.ts'
import { fieldBounds, filterOptions, type FilterState, type FilterValue } from '../filter.ts'
import { FieldInfo, hasFieldInfo } from './FieldInfo.ts'
import { FilterControl } from './FilterControl.ts'

export const FilterPanel = defineComponent({
  name: 'CorpusFilterPanel',
  props: {
    fields: { type: Array as PropType<DataField[]>, required: true },
    state: { type: Object as PropType<FilterState>, required: true },
    /** The type's data file, or null before it has loaded. */
    data: { type: Object as PropType<TypeData | null>, default: null },
    /** Counts per field and value under the other filters. Empty before the data loads. */
    facets: {
      type: Object as PropType<Record<string, Record<string, number>>>,
      default: () => ({}),
    },
  },
  emits: {
    change: (field: string, value: FilterValue | null) =>
      typeof field === 'string' && (value === null || typeof value === 'object'),
  },
  setup(props, { emit }) {
    const id = useId()
    const filters = computed(() => props.fields.filter((f) => f.filter && f.control !== 'hidden'))
    const extras = computed(() =>
      Object.fromEntries(
        filters.value.map((field) => [
          field.name,
          {
            options: filterOptions(field, props.data),
            bounds:
              field.control === 'range' && props.data !== null
                ? fieldBounds(props.data, field.name)
                : null,
          },
        ]),
      ),
    )
    return () =>
      h(
        'div',
        { class: 'cs-filters' },
        filters.value.map((field, i) => {
          const inputId = `${id}-${i}`
          const labelId = `${id}-${i}-label`
          return h('div', { key: field.name, class: 'cs-filter', 'data-control': field.control }, [
            h('div', { class: 'cs-filter-head' }, [
              h('label', { id: labelId, for: inputId, class: 'cs-filter-label' }, field.label),
              hasFieldInfo(field) ? h(FieldInfo, { field }) : null,
            ]),
            h(FilterControl, {
              field,
              value: props.state.filters[field.name] ?? null,
              options: extras.value[field.name]?.options ?? [],
              counts: props.facets[field.name] ?? null,
              bounds: extras.value[field.name]?.bounds ?? null,
              inputId,
              labelId,
              onChange: (value: FilterValue | null) => emit('change', field.name, value),
            }),
            field.note === null ? null : h('p', { class: 'cs-filter-note' }, field.note),
          ])
        }),
      )
  },
})
