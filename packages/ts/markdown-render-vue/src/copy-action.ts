/**
 * The copy control, as every block that offers one needs it.
 *
 * A copy button is three things that are easy to get subtly wrong: a write that
 * swallows every failure, a confirmation that reverts on a clock the next copy
 * restarts, and an accessible name that does NOT move while it does. They live
 * here so a second block cannot drift from the first.
 *
 * Class names and labels are the caller's, not this module's. Each block owns
 * its own `markdown-*` namespace, and a shared prefix would be a rename of every
 * selector a host or a test already writes.
 *
 * Nothing here is emitted into hast. The chrome exists only in the Vue target —
 * see `components/CodeBlock.ts` for why that is a security boundary and not a
 * layering preference.
 */

import { h, onBeforeUnmount, ref, type Ref, type VNode } from 'vue'

/** How long a copy button stays in its confirmation state. */
const COPIED_MS = 2000

const ICON_ATTRS = {
  viewBox: '0 0 16 16',
  width: '16',
  height: '16',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.4',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
  focusable: 'false',
}

/** Inline SVG, because this package has no icon set and will not grow one. */
export function icon(children: VNode[]): VNode {
  return h('svg', ICON_ATTRS, children)
}

const copyIcon = () =>
  icon([
    h('rect', { x: '5.5', y: '5.5', width: '8', height: '8', rx: '1.5' }),
    h('path', { d: 'M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2' }),
  ])

const copiedIcon = () => icon([h('path', { d: 'M3.5 8.5 6.5 11.5 12.5 4.5' })])

export interface CopyAction {
  /** Whether the confirmation window is open. */
  copied: Ref<boolean>
  /** Write `getText()` to the clipboard and confirm it. Never throws. */
  copy: () => Promise<void>
}

/**
 * Clipboard writes plus the confirmation clock, for one control.
 *
 * `getText` is called on click and never at render: a note of forty blocks
 * would otherwise walk forty trees to build text nobody asked for. It is also
 * called inside the try, so a block whose text extraction throws fails as
 * quietly as a denied clipboard does.
 *
 * `navigator.clipboard` is read at call time for the same reason — the object
 * is absent in an insecure context and can be swapped under a live page.
 */
export function useCopyAction(getText: () => string): CopyAction {
  const copied = ref(false)
  let revert: ReturnType<typeof setTimeout> | undefined
  // `onBeforeUnmount` fires before an in-flight `writeText` resolves, so the
  // handle alone does not stop a resolution from arming a timer nothing will
  // ever clear.
  let alive = true

  onBeforeUnmount(() => {
    alive = false
    clearTimeout(revert)
  })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getText())
    } catch {
      // No clipboard, or the page is not allowed one. Say nothing: a reader
      // who cannot copy can still select.
      return
    }
    if (!alive) return
    copied.value = true
    clearTimeout(revert)
    revert = setTimeout(() => {
      copied.value = false
    }, COPIED_MS)
  }

  return { copied, copy }
}

export interface CopyButtonOptions {
  /** The block's action class, e.g. `markdown-code-action`. */
  class: string
  /** Added while the confirmation is open, e.g. `markdown-code-copied`. */
  copiedClass: string
  /** The accessible name. Stable across the confirmation — see below. */
  label: string
  copied: boolean
  onClick: () => void
}

/**
 * One `<button>`, and nothing wrapping it.
 *
 * The name does not change when the copy lands: a changed accessible name is
 * not reliably re-announced, and a name describing a past event tells a reader
 * arriving mid-window nothing about what the button does. Only the icon and the
 * tooltip move; {@link copyStatus} is what actually announces.
 */
export function copyButton(options: CopyButtonOptions): VNode {
  return h(
    'button',
    {
      type: 'button',
      class: [options.class, options.copied ? options.copiedClass : ''],
      'aria-label': options.label,
      title: options.copied ? 'Copied' : options.label,
      onClick: options.onClick,
    },
    [options.copied ? copiedIcon() : copyIcon()],
  )
}

/**
 * The live region that carries the confirmation.
 *
 * Present from the first render and empty until it has something to say: a
 * region inserted along with its text is not announced.
 */
export function copyStatus(className: string, copied: boolean): VNode {
  return h('span', { class: className, role: 'status' }, copied ? 'Copied' : '')
}
