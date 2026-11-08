/**
 * A code fence, with the chrome a reader wants on one: its language, a copy
 * button and a per-block wrap toggle.
 *
 * The chrome exists only here, in the Vue target, and never in hast. Emitting a
 * `<button>` upstream would put `button`/`type`/`aria-label` into the
 * sanitizer's allowlist — widening a security boundary for decoration — and
 * would stamp dead, unclickable buttons into `renderToHtml`'s string output,
 * which the static consumers render as-is.
 *
 * Copying and wrapping are this reader's business with this block, so they stay
 * local state: no handler on `RenderHandlers`, no emit, nothing written back.
 * The rendered document remains a pure function of the source.
 *
 * The copy half is `../copy-action.ts`, shared with the table's chrome; only
 * the wrap toggle and the language label are the fence's own.
 *
 * Fences reserved by another renderer (`mermaid`, `math`, a host's `base`) never
 * arrive here — `routeKeys` tries `lang:<language>` before the tag name. A host
 * that wants no chrome at all passes `{ pre: undefined }` as `components`:
 * `matchOverride` skips a falsy entry, and the bare `<pre>` renders.
 */

import { defineComponent, h, ref, type PropType, type VNode } from 'vue'
import { nodeText, toVueProps, type HastNode } from '../render.ts'
import { copyButton, copyStatus, icon, useCopyAction } from '../copy-action.ts'

const wrapIcon = () =>
  icon([
    h('path', { d: 'M2.5 4h11' }),
    h('path', { d: 'M2.5 8h8a2.5 2.5 0 0 1 0 5H6.5' }),
    h('path', { d: 'M8.2 11.3 6.5 13l1.7 1.7' }),
  ])

export const CodeBlock = defineComponent({
  name: 'CodeBlock',
  props: {
    node: { type: Object as PropType<HastNode>, required: true },
  },
  setup(props, { slots }) {
    const wrapped = ref(false)
    // Read on click, never at render: a note of forty fences would otherwise
    // walk forty highlighted trees to build text nobody asked for.
    const { copied, copy } = useCopyAction(() => nodeText(props.node).replace(/\n$/, ''))

    return () => {
      const raw = props.node.properties?.dataLang
      const lang = typeof raw === 'string' && raw ? raw : undefined
      const copyLabel = lang ? `Copy ${lang} code` : 'Copy code'

      const chrome: VNode[] = []
      if (lang) chrome.push(h('span', { class: 'markdown-code-lang' }, lang))
      chrome.push(
        copyButton({
          class: 'markdown-code-action',
          copiedClass: 'markdown-code-copied',
          label: copyLabel,
          copied: copied.value,
          onClick: copy,
        }),
        h(
          'button',
          {
            type: 'button',
            class: 'markdown-code-action',
            'aria-label': 'Wrap long lines',
            'aria-pressed': String(wrapped.value),
            title: 'Wrap long lines',
            onClick: () => {
              wrapped.value = !wrapped.value
            },
          },
          [wrapIcon()],
        ),
      )

      return h(
        'div',
        { class: ['markdown-code-block', wrapped.value ? 'markdown-code-wrapped' : ''] },
        [
          h('div', { class: 'markdown-code-chrome' }, chrome),
          h('pre', toVueProps(props.node.properties), slots.default?.()),
          copyStatus('markdown-code-status', copied.value),
        ],
      )
    }
  },
})
