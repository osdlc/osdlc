/**
 * The "what is this" button beside a field's label. It opens a small note with the field's
 * help text, its longer explanation, what each enum value means, and a link to a document.
 */
import {
  computed,
  defineComponent,
  h,
  onUnmounted,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
  type PropType,
} from 'vue'
import type { DataField } from '../data-types.ts'

/** Whether a field has anything for the note to say. */
export function hasFieldInfo(field: DataField): boolean {
  return (
    field.help !== null ||
    field.info !== null ||
    field.link !== null ||
    field.options.some((o) => o.description !== null)
  )
}

export const FieldInfo = defineComponent({
  name: 'CorpusFieldInfo',
  props: {
    field: { type: Object as PropType<DataField>, required: true },
  },
  setup(props) {
    const open = shallowRef(false)
    const id = useId()
    const root = useTemplateRef<HTMLElement>('root')
    const described = computed(() => props.field.options.filter((o) => o.description !== null))

    const onPointer = (event: Event): void => {
      if (root.value !== null && !root.value.contains(event.target as Node)) open.value = false
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      open.value = false
      root.value?.querySelector('button')?.focus()
    }
    const listen = (on: boolean): void => {
      if (typeof document === 'undefined') return
      const method = on ? 'addEventListener' : 'removeEventListener'
      document[method]('pointerdown', onPointer)
      document[method]('keydown', onKey as EventListener)
    }
    watch(open, listen)
    onUnmounted(() => listen(false))

    return () =>
      h('span', { class: 'cs-info', ref: 'root' }, [
        h(
          'button',
          {
            type: 'button',
            class: 'cs-info-button',
            'aria-expanded': open.value,
            'aria-controls': id,
            'aria-label': `About ${props.field.label}`,
            onClick: () => (open.value = !open.value),
          },
          h('span', { 'aria-hidden': 'true' }, '?'),
        ),
        h('div', { id, class: 'cs-info-note', role: 'note', hidden: !open.value }, [
          props.field.help === null ? null : h('p', props.field.help),
          props.field.info === null ? null : h('p', props.field.info),
          described.value.length === 0
            ? null
            : h(
                'dl',
                described.value.flatMap((o) => [
                  h('dt', { key: `t${o.value}` }, o.label),
                  h('dd', { key: `d${o.value}` }, o.description as string),
                ]),
              ),
          props.field.link === null
            ? null
            : h('p', [
                h('a', { href: props.field.link.href }, props.field.link.label ?? 'Learn more'),
              ]),
        ]),
      ])
  },
})
