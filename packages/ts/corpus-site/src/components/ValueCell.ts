/**
 * One value of a record in a table cell: a badge, a link to a record, a date, text, or, for a
 * field with `tree` set, an object or a list cut short.
 */
import { defineComponent, h, type PropType, type VNodeChild } from 'vue'
import type { DataField, DataScalar, DataTarget, DataTree, DataValue } from '../data-types.ts'
import { formatScalar } from '../format.ts'
import { isLinkable, shortUrl } from '../value-text.ts'
import { link, TreeValue } from './TreeValue.ts'

/** The most values of a list a cell shows before `+n`. */
const MAX_ITEMS = 3

export const ValueCell = defineComponent({
  name: 'CorpusValueCell',
  props: {
    field: { type: Object as PropType<DataField>, required: true },
    value: { type: [String, Number, Boolean, Array, Object] as PropType<DataValue>, default: null },
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
      if (
        typeof value === 'string' &&
        isLinkable(value) &&
        (field.kind === 'url' || field.format.kind === 'link' || /^https?:\/\/\S+$/.test(value))
      )
        return link(value, true, shortUrl(value))
      const text = formatScalar(value, field.format, props.locale)
      if (field.kind === 'date' || field.kind === 'datetime')
        return h('time', { datetime: String(value) }, text)
      return field.format.kind === 'code' ? h('code', text) : text
    }
    const isScalar = (v: unknown): v is DataScalar =>
      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    return () => {
      const { value } = props
      if (value === null || (Array.isArray(value) && value.length === 0))
        return h('span', { class: 'cs-empty', 'aria-label': 'none' }, '–')
      if (props.field.tree === true) return h(TreeValue, { tree: value as DataTree, compact: true })
      if (!Array.isArray(value))
        return h('span', { class: 'cs-value' }, [isScalar(value) ? one(value) : null])
      const shown = value.filter(isScalar).slice(0, MAX_ITEMS)
      return h('span', { class: 'cs-value cs-value-list' }, [
        ...shown.map((v, i) => h('span', { key: i, class: 'cs-value-item' }, [one(v)])),
        value.length > shown.length
          ? h('span', { class: 'cs-more' }, `+${value.length - shown.length}`)
          : null,
      ])
    }
  },
})
