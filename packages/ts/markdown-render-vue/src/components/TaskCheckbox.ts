/**
 * A task-list checkbox.
 *
 * GFM emits these disabled — correct for a static document, wrong for a notes
 * app, where ticking a box is the point. The checkbox is rendered live and
 * reports `task-toggle` with the source line; the host writes the change back
 * to the file and re-renders. The DOM state is not mutated locally, so the
 * rendered document stays a pure function of the source.
 *
 * Inside a transclusion the checkbox keeps GFM's `disabled`: its toggle is
 * deliberately not forwarded to the host (see `TasksLiveKey`), and a live box
 * nothing listens to would be a control that does nothing.
 */

import { defineComponent, h, inject, type PropType } from 'vue'
import { toVueProps, type HastNode } from '../render.ts'
import { TasksLiveKey, useHandlers } from '../context.ts'

export const TaskCheckbox = defineComponent({
  name: 'TaskCheckbox',
  props: {
    node: { type: Object as PropType<HastNode>, required: true },
    /** Source line of the enclosing list item. */
    line: { type: Number, default: undefined },
  },
  setup(props) {
    const handlers = useHandlers()
    const live = inject(TasksLiveKey, true)

    return () => {
      const attrs = toVueProps(props.node.properties)
      if (!live) {
        return h('input', {
          ...attrs,
          type: 'checkbox',
          disabled: true,
          class: ['task-list-item-checkbox', attrs.class].filter(Boolean).join(' '),
        })
      }
      delete attrs.disabled
      return h('input', {
        ...attrs,
        type: 'checkbox',
        class: ['task-list-item-checkbox', attrs.class].filter(Boolean).join(' '),
        onClick: (event: MouseEvent) => {
          const el = event.target as HTMLInputElement
          const checked = el.checked
          // Let the host own the state: revert the optimistic DOM flip.
          el.checked = !checked
          if (props.line !== undefined) handlers.taskToggle(props.line, checked)
        },
      })
    }
  },
})
