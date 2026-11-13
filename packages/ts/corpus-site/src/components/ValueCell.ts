/** One value of a record in a table cell: a badge, a link to a record, a date, or text. */
import { defineComponent, h, type PropType, type VNodeChild } from 'vue'
import type { DataField, DataScalar, DataTarget, DataValue } from '../data-types.ts'
import { formatScalar } from '../format.ts'

/** The most values of a list a cell shows before `+n`. */
const MAX_ITEMS = 3

export const ValueCell = defineComponent({
  name: 'CorpusValueCell',
  props: {
    field: { type: Object as PropType<DataField>, required: true },
    value: { type: [String, Number, Boolean, Array] as PropType<DataValue>, default: null },
    /** The records reference values name, from the type's data file. */
    targets: { type: Object as PropType<Record<string, DataTarget>>, default: () => ({}) },
    locale: { type: String, default: 'en' },
  },
  setup(props) {
    const one = (value: DataScalar): VNodeChild => {
      const { field } = props
      if (field.kind === 'reference') {
        const target = props.targets[String(value)]
        if (target === undefined) return String(value)
        return target.url === null ? target.title : h('a', { href: target.url }, target.title)
      }
      if (field.kind === 'enum' || field.format.kind === 'badge') {
        const option = field.options.find((o) => o.value === String(value))
        return h(
          'span',
          {
            class: 'cs-badge',
            'data-color': option?.color ?? 'neutral',
            title: option?.description ?? undefined,
          },
          option?.label ?? String(value),
        )
      }
      if (field.kind === 'url' && typeof value === 'string')
        return h('a', { href: value, rel: 'noopener' }, value.replace(/^https?:\/\/(www\.)?/, ''))
      const text = formatScalar(value, field.format, props.locale)
      if (field.kind === 'date' || field.kind === 'datetime')
        return h('time', { datetime: String(value) }, text)
      return field.format.kind === 'code' ? h('code', text) : text
    }
    return () => {
      const { value } = props
      if (value === null || (Array.isArray(value) && value.length === 0))
        return h('span', { class: 'cs-empty', 'aria-label': 'none' }, '–')
      if (!Array.isArray(value)) return h('span', { class: 'cs-value' }, [one(value)])
      const shown = value.slice(0, MAX_ITEMS)
      return h('span', { class: 'cs-value cs-value-list' }, [
        ...shown.map((v, i) => h('span', { key: i, class: 'cs-value-item' }, [one(v)])),
        value.length > shown.length
          ? h('span', { class: 'cs-more' }, `+${value.length - shown.length}`)
          : null,
      ])
    }
  },
})
