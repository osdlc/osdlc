/** Previous and next for a paged list, with the rows shown and the page count. */
import { defineComponent, h } from 'vue'

export const Pager = defineComponent({
  name: 'CorpusPager',
  props: {
    page: { type: Number, required: true },
    pages: { type: Number, required: true },
    /** The index of the page's first row, from 0. */
    start: { type: Number, required: true },
    /** The rows on the page. */
    shown: { type: Number, required: true },
    /** The rows in all. */
    total: { type: Number, required: true },
  },
  emits: {
    go: (page: number) => Number.isInteger(page),
  },
  setup(props, { emit }) {
    const button = (label: string, page: number, disabled: boolean) =>
      h(
        'button',
        { type: 'button', class: 'cs-page-button', disabled, onClick: () => emit('go', page) },
        label,
      )
    return () => {
      if (props.pages <= 1) return null
      return h('nav', { class: 'cs-pager', 'aria-label': 'Pages' }, [
        button('Previous', props.page - 1, props.page <= 1),
        h(
          'span',
          { class: 'cs-page-status' },
          `${props.start + 1}–${props.start + props.shown} of ${props.total} · page ${props.page} of ${props.pages}`,
        ),
        button('Next', props.page + 1, props.page >= props.pages),
      ])
    }
  },
})
