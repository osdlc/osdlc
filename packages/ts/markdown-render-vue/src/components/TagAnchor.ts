/** An inline `#tag`. Clicking reports the tag; the host decides what a tag click means. */

import { defineComponent, h, type PropType } from 'vue'
import { toVueProps, type HastNode } from '../render.ts'
import { useHandlers } from '../context.ts'

export const TagAnchor = defineComponent({
  name: 'TagAnchor',
  props: {
    node: { type: Object as PropType<HastNode>, required: true },
  },
  setup(props, { slots }) {
    const handlers = useHandlers()
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (event.button !== 0) return
      event.preventDefault()
      handlers.tagClick(String(props.node.properties?.dataTag ?? ''), event)
    }
    return () => h('a', { ...toVueProps(props.node.properties), onClick }, slots.default?.())
  },
})
