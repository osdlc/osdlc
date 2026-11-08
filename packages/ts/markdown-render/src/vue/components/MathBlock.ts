/**
 * `$math$` and `$$math$$` as Vue components. Rendering is `../../math.ts`'s
 * job; see its header for the lazy KaTeX import and the stylesheet the host
 * must supply. When that import fails — the optional `katex` peer is not
 * installed — the block shows its LaTeX source as readable code.
 */

import { defineComponent, h, onMounted, ref, watch, type PropType } from 'vue'
import { renderMath } from '../../math.ts'
import { hastNodeText, type HastNode } from '../render.ts'

function latexOf(node: HastNode): string {
  return hastNodeText(node).trim()
}

/** Replace `el`'s content with the source as `<code class="markdown-math-fallback">`. */
export function showMathSource(el: HTMLElement, latex: string): void {
  const code = el.ownerDocument.createElement('code')
  code.className = 'markdown-math-fallback'
  code.textContent = latex
  el.replaceChildren(code)
}

function makeMathComponent(name: string, displayMode: boolean, tagName: string) {
  return defineComponent({
    name,
    props: {
      node: { type: Object as PropType<HastNode>, required: true },
    },
    setup(props) {
      const host = ref<HTMLElement | null>(null)

      const draw = async () => {
        const el = host.value
        if (!el) return
        const latex = latexOf(props.node)
        try {
          el.innerHTML = await renderMath(latex, displayMode)
        } catch {
          showMathSource(el, latex)
        }
      }

      onMounted(draw)
      watch(() => latexOf(props.node), draw)

      return () =>
        h(tagName, {
          ref: host,
          class: displayMode
            ? 'markdown-math markdown-math-block'
            : 'markdown-math markdown-math-inline',
          'data-line': props.node.properties?.dataLine,
          // A fence's `^block-id` (lifted onto the `<pre>` by `rehypeCodeMeta`):
          // the anchor a `[[#^id]]` link scrolls to.
          id: props.node.properties?.id,
          'data-block-id': props.node.properties?.dataBlockId,
        })
    },
  })
}

/** `$$…$$` — a display-mode block. Routed from the `lang:math` fence key. */
export const MathBlock = makeMathComponent('MathBlock', true, 'div')

/** `$…$` — inline math. Routed from the `math-inline` key. */
export const MathInline = makeMathComponent('MathInline', false, 'span')
