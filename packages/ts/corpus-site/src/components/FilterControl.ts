/**
 * One field's filter, drawn as its control says: chips, a select, a range, a toggle or a text
 * box. It holds no state: the value comes in and a change goes out.
 */
import { defineComponent, h, type PropType, type VNode } from 'vue'
import type { DataField } from '../data-types.ts'
import type { FilterOption, FilterValue } from '../filter.ts'

export const FilterControl = defineComponent({
  name: 'CorpusFilterControl',
  props: {
    field: { type: Object as PropType<DataField>, required: true },
    /** The field's filter, or null for none. */
    value: { type: Object as PropType<FilterValue | null>, default: null },
    /** The values a select or chips offers. */
    options: { type: Array as PropType<FilterOption[]>, default: () => [] },
    /** How many records hold each value (see `facetCounts`), or null before the data loads. */
    counts: { type: Object as PropType<Record<string, number> | null>, default: null },
    /** The lowest and highest value the records hold: a range's `min` and `max`, and a number's placeholders. */
    bounds: { type: Object as PropType<{ min: string; max: string } | null>, default: null },
    /** The id of the control's first input, which the field's label points at. */
    inputId: { type: String, required: true },
    /** The id of the element that labels the control. */
    labelId: { type: String, required: true },
  },
  emits: {
    change: (value: FilterValue | null) => value === null || typeof value === 'object',
  },
  setup(props, { emit }) {
    const selected = (): string[] => (props.value?.kind === 'set' ? props.value.values : [])
    const countOf = (value: string): number | null => {
      if (props.counts !== null) return props.counts[value] ?? 0
      const option = props.field.options.find((o) => o.value === value)
      return option === undefined ? null : option.count
    }

    const chips = (): VNode =>
      h(
        'div',
        { class: 'cs-chips', role: 'group', 'aria-labelledby': props.labelId },
        props.options.map((option, i) => {
          const on = selected().includes(option.value)
          const count = countOf(option.value)
          return h(
            'button',
            {
              key: option.value,
              id: i === 0 ? props.inputId : undefined,
              type: 'button',
              class: 'cs-chip',
              'aria-pressed': on,
              'data-color': option.color ?? undefined,
              'data-empty': count === 0 && !on ? '' : undefined,
              title: option.description ?? undefined,
              onClick: () => {
                const values = on
                  ? selected().filter((v) => v !== option.value)
                  : [...selected(), option.value]
                emit('change', values.length === 0 ? null : { kind: 'set', values })
              },
            },
            [option.label, count === null ? null : h('span', { class: 'cs-count' }, String(count))],
          )
        }),
      )

    const select = (): VNode => {
      const values = selected()
      const known = new Set(props.options.map((o) => o.value))
      return h(
        'select',
        {
          id: props.inputId,
          class: 'cs-select',
          value: values.length > 1 ? '\0many' : (values[0] ?? ''),
          onChange: (event: Event) => {
            const value = (event.target as HTMLSelectElement).value
            emit('change', value === '' ? null : { kind: 'set', values: [value] })
          },
        },
        [
          h('option', { value: '' }, 'Any'),
          values.length > 1
            ? h('option', { value: '\0many', disabled: true }, `${values.length} chosen`)
            : null,
          // A value from a link that the options do not hold yet still shows as chosen.
          ...values
            .filter((v) => values.length === 1 && !known.has(v))
            .map((v) => h('option', { key: v, value: v }, v)),
          ...props.options.map((option) => {
            const count = countOf(option.value)
            return h(
              'option',
              { key: option.value, value: option.value },
              count === null ? option.label : `${option.label} (${count})`,
            )
          }),
        ],
      )
    }

    const range = (): VNode => {
      const value = props.value?.kind === 'range' ? props.value : { min: null, max: null }
      const type = props.field.kind === 'number' ? 'number' : 'date'
      const bound = (text: string | undefined): string | undefined =>
        text === undefined ? undefined : type === 'date' ? text.slice(0, 10) : text
      const input = (side: 'min' | 'max'): VNode =>
        h('input', {
          id: side === 'min' ? props.inputId : undefined,
          class: 'cs-input',
          type,
          value: value[side] ?? '',
          min: bound(props.bounds?.min),
          max: bound(props.bounds?.max),
          placeholder: type === 'number' ? bound(props.bounds?.[side]) : undefined,
          'aria-label': `${props.field.label}, ${side === 'min' ? 'from' : 'to'}`,
          onChange: (event: Event) => {
            const text = (event.target as HTMLInputElement).value
            const next = { kind: 'range' as const, min: value.min, max: value.max }
            next[side] = text === '' ? null : text
            emit('change', next.min === null && next.max === null ? null : next)
          },
        })
      return h('div', { class: 'cs-range', role: 'group', 'aria-labelledby': props.labelId }, [
        input('min'),
        h('span', { class: 'cs-range-sep', 'aria-hidden': 'true' }, 'to'),
        input('max'),
      ])
    }

    const toggle = (): VNode => {
      const current = props.value?.kind === 'toggle' ? String(props.value.value) : ''
      const choice = (value: string, label: string, first: boolean): VNode =>
        h('label', { key: value, class: 'cs-segment' }, [
          h('input', {
            id: first ? props.inputId : undefined,
            type: 'radio',
            name: props.inputId,
            value,
            checked: current === value,
            onChange: () =>
              emit('change', value === '' ? null : { kind: 'toggle', value: value === 'true' }),
          }),
          h('span', label),
        ])
      return h(
        'div',
        { class: 'cs-segments', role: 'radiogroup', 'aria-labelledby': props.labelId },
        [choice('', 'Any', true), choice('true', 'Yes', false), choice('false', 'No', false)],
      )
    }

    const text = (): VNode =>
      h('input', {
        id: props.inputId,
        class: 'cs-input',
        type: 'search',
        value: props.value?.kind === 'text' ? props.value.value : '',
        placeholder: 'Contains…',
        onInput: (event: Event) => {
          const value = (event.target as HTMLInputElement).value
          emit('change', value.trim() === '' ? null : { kind: 'text', value })
        },
      })

    return () => {
      switch (props.field.control) {
        case 'chips':
          return chips()
        case 'select':
          return select()
        case 'range':
          return range()
        case 'toggle':
          return toggle()
        case 'search':
          return text()
        case 'hidden':
          return null
      }
    }
  },
})
