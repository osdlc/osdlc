/**
 * A mermaid diagram. Rendering is `../../mermaid.ts`; this component owns the
 * host element and the fallback. Failure degrades to the source text rather
 * than to nothing — a broken diagram is still readable markdown.
 *
 * Two ways in. `MarkdownRender` routes a ```mermaid fence here with `node`,
 * and the text is the fence body. A host that holds diagram text and no hast
 * node passes `source` instead. When both are given, `source` is the text and
 * `node` only supplies `data-line` and the fence's block id. Empty text
 * draws nothing and never loads mermaid.
 */

import { defineComponent, h, onMounted, ref, watch, type PropType } from 'vue'
import { hastNodeText, type HastNode } from '../render.ts'
import { renderMermaid, type MermaidTheme } from '@osdlc/markdown-render'

function sourceOf(node: HastNode): string {
  return hastNodeText(node).replace(/\n$/, '')
}

export const MermaidBlock = defineComponent({
  name: 'MermaidBlock',
  props: {
    /** The fence node. Optional when `source` is given. */
    node: { type: Object as PropType<HastNode>, required: false },
    /** Diagram text, for callers without a hast node. Wins over `node`'s text. */
    source: { type: String, required: false },
    /** Mermaid theme; defaults to `default`. Live — a change redraws. */
    theme: { type: String as PropType<MermaidTheme>, default: 'default' },
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    const failed = ref(false)

    const text = (): string => props.source ?? (props.node ? sourceOf(props.node) : '')

    /**
     * The draw whose result this block is allowed to show.
     *
     * Draws overlap — `renderMermaid` is async and a fast toggle starts a
     * second before the first answers — and they do not necessarily finish in
     * order, so the last one to settle would otherwise win and leave the older
     * diagram on screen describing text that is no longer there.
     *
     * Worse, `renderMermaid`'s `initialize` is mermaid's own global state: a
     * later draw can retheme the module while an earlier render is still
     * running, and that earlier SVG comes back painted in the later theme.
     * Both are the same bug, and bailing on a stale token fixes both.
     */
    let drawn = 0

    const draw = async () => {
      const el = host.value
      if (!el) return
      const token = ++drawn
      failed.value = false
      const source = text()
      if (source === '') {
        el.textContent = ''
        return
      }
      try {
        const svg = await renderMermaid(source, props.theme)
        if (token !== drawn) return
        // Mermaid-generated SVG, not note content — never the raw markdown.
        el.innerHTML = svg
      } catch {
        if (token !== drawn) return
        failed.value = true
        el.textContent = ''
      }
    }

    onMounted(draw)
    // Source and theme both feed `renderMermaid`, so both have to redraw. The
    // old SVG stays on screen until the new one replaces it, so a host that
    // binds `theme` to dark mode gets no blank gap and no reflow.
    watch([text, () => props.theme], draw)

    return () =>
      h(
        'div',
        {
          class: 'markdown-mermaid',
          'data-line': props.node?.properties?.dataLine,
          // A fence's `^block-id` (lifted onto the `<pre>` by `rehypeCodeMeta`):
          // the anchor a `[[#^id]]` link scrolls to.
          id: props.node?.properties?.id,
          'data-block-id': props.node?.properties?.dataBlockId,
        },
        [
          h('div', { ref: host, class: 'markdown-mermaid-canvas' }),
          failed.value
            ? h('pre', { class: 'markdown-mermaid-fallback' }, [h('code', text())])
            : null,
        ],
      )
  },
})
