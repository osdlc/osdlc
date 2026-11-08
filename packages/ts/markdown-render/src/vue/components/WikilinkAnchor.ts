/**
 * A `[[wikilink]]`.
 *
 * Navigation is the host's job — the anchor reports the click and lets the app
 * decide (route, open a pane, create the missing note). Plain-click is
 * intercepted; modified clicks (new tab, download) fall through to the browser.
 */

import { defineComponent, h, type PropType } from 'vue'
import type { HastNode } from '../render.ts'
import { hastNodeText, toVueProps } from '../render.ts'
import { useHandlers, type WikilinkTarget } from '../context.ts'
import { isSafeLinkPath } from '../../url.ts'
import type { LinkResolution } from '../../types.ts'

/**
 * Rebuild the resolution the pipeline recorded on the anchor.
 *
 * `data-path` is re-checked here rather than trusted. `wikilinkNode` already
 * refuses to write an unsafe one, but a note may write the anchor itself —
 * `<a class="wikilink" data-path="javascript:…">` survives sanitization,
 * because no schema polices `data-*`, and by this point a forged anchor is
 * indistinguishable from a produced one. Dropping the path leaves the host
 * with nothing to navigate to, which is the same shape as a `missing` link.
 */
export function resolutionFromNode(node: HastNode): WikilinkTarget {
  const p = node.properties ?? {}
  const kind = String(p.dataKind ?? 'note') as LinkResolution['kind']
  const resolution: WikilinkTarget = {
    target: String(p.dataWikilink ?? ''),
    kind,
    display: '',
  }
  if (typeof p.dataPath === 'string' && isSafeLinkPath(p.dataPath)) {
    resolution.path = p.dataPath
  }
  if (typeof p.dataHeading === 'string') resolution.heading = p.dataHeading
  if (typeof p.dataBlockId === 'string') resolution.blockId = p.dataBlockId
  return resolution
}

export const WikilinkAnchor = defineComponent({
  name: 'WikilinkAnchor',
  props: {
    node: { type: Object as PropType<HastNode>, required: true },
  },
  setup(props, { slots }) {
    const handlers = useHandlers()

    const resolution = (): WikilinkTarget => ({
      ...resolutionFromNode(props.node),
      display: hastNodeText(props.node),
    })

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (event.button !== 0) return
      event.preventDefault()
      handlers.linkClick(resolution(), event)
    }

    const onEnter = (event: MouseEvent) => {
      handlers.linkHover({
        resolution: resolution(),
        el: event.currentTarget as HTMLElement,
      })
    }
    const onLeave = () => handlers.linkHover(null)

    return () =>
      h(
        'a',
        {
          ...toVueProps(props.node.properties),
          onClick,
          onMouseenter: onEnter,
          onMouseleave: onLeave,
        },
        slots.default?.(),
      )
  },
})
