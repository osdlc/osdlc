import DOMPurify from 'dompurify'
import { computed, ref } from 'vue'

// ============================================================================
// Markdown Renderer Types
// ============================================================================

/**
 * Turns the markdown source of a text node into HTML. Register one with
 * `registerMarkdownRenderer`; the board uses the active renderer for every
 * text node.
 */
export interface MarkdownRenderer {
  /** Unique identifier for this renderer */
  id: string
  /** Human-readable name for UI display */
  name: string
  /**
   * Render markdown text to HTML. May be synchronous or return a promise;
   * `renderedMarkdown` awaits either.
   * @param markdown - The markdown source text
   * @returns HTML string, or a promise of one
   */
  render(markdown: string): string | Promise<string>
  /**
   * The renderer's output is ALREADY safe HTML — it sanitizes itself (or
   * escapes everything). When true, `renderedMarkdown` injects the output
   * as-is; when absent or false, the seam runs DOMPurify over it before it
   * reaches `v-html`. Declare this only for a pipeline that really does
   * sanitize: a second DOMPurify pass is merely wasted work, but it also
   * strips custom elements a sanitizing pipeline chose to keep.
   */
  sanitized?: boolean
}

// ============================================================================
// Built-in Renderer
// ============================================================================

/**
 * The default renderer: escapes HTML and preserves whitespace. The only
 * built-in; a host registers a real markdown pipeline through
 * `registerMarkdownRenderer`.
 */
export const plainTextRenderer: MarkdownRenderer = {
  id: 'plaintext',
  name: 'Plain Text',
  sanitized: true,
  render(markdown: string): string {
    const escaped = markdown
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

    return `<pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0; font-family: inherit;">${escaped}</pre>`
  },
}

// ============================================================================
// Renderer Registry
// ============================================================================

/** All available renderers */
const renderers = ref<MarkdownRenderer[]>([plainTextRenderer])

/** Currently active renderer ID */
const activeRendererId = ref<string>(plainTextRenderer.id)

/** Version counter to trigger reactivity when renderer changes */
const rendererVersion = ref(0)

/**
 * Every registered renderer, the plain-text default first. The list is
 * reactive and shared by every board on the page.
 */
export function getRenderers(): MarkdownRenderer[] {
  return renderers.value
}

/**
 * The active renderer, or the plain-text default when none matches.
 *
 * @experimental The registry is module-wide, so all boards share the active
 * renderer. A per-board `renderer` prop may replace it before 1.0.
 */
export function getActiveRenderer(): MarkdownRenderer {
  const renderer = renderers.value.find((r) => r.id === activeRendererId.value)
  return renderer ?? plainTextRenderer
}

/**
 * The id of the active renderer. `plaintext` until `setActiveRenderer` picks
 * another.
 *
 * @experimental The registry is module-wide, so all boards share the active
 * renderer. A per-board `renderer` prop may replace it before 1.0.
 */
export function getActiveRendererId(): string {
  return activeRendererId.value
}

/**
 * Select the renderer every board on the page uses, and re-render the open
 * text nodes.
 *
 * @experimental The registry is module-wide, so all boards share the active
 * renderer. A per-board `renderer` prop may replace it before 1.0.
 * @param id - The renderer ID to activate
 * @returns true if renderer was found and activated, false otherwise
 */
export function setActiveRenderer(id: string): boolean {
  const renderer = renderers.value.find((r) => r.id === id)
  if (renderer) {
    activeRendererId.value = id
    rendererVersion.value++
    return true
  }
  return false
}

/**
 * Register a markdown renderer, or replace the one with the same id. Replacing
 * the active renderer re-renders the open text nodes.
 *
 * @experimental The registry is module-wide, so all boards share it. A
 * per-board `renderer` prop may replace it before 1.0.
 * @param renderer - The renderer to register
 */
export function registerMarkdownRenderer(renderer: MarkdownRenderer): void {
  const index = renderers.value.findIndex((r) => r.id === renderer.id)
  if (index >= 0) {
    renderers.value.splice(index, 1, renderer)
    // Open nodes hold the old renderer's output until the version changes.
    if (activeRendererId.value === renderer.id) rendererVersion.value++
  } else {
    renderers.value.push(renderer)
  }
}

/**
 * Unregister a renderer by ID. The plain-text default cannot be removed;
 * removing the active renderer falls back to it.
 *
 * @experimental The registry is module-wide, so all boards share it. A
 * per-board `renderer` prop may replace it before 1.0.
 * @param id - The renderer ID to remove
 */
export function unregisterMarkdownRenderer(id: string): boolean {
  if (id === plainTextRenderer.id) {
    return false
  }

  const index = renderers.value.findIndex((r) => r.id === id)
  if (index >= 0) {
    renderers.value.splice(index, 1)
    if (activeRendererId.value === id) {
      activeRendererId.value = plainTextRenderer.id
      rendererVersion.value++
    }
    return true
  }
  return false
}

/**
 * A reactive counter that changes when the active renderer is switched,
 * replaced or removed. Watch it to render again. The board's text nodes do.
 */
export function useRendererVersion() {
  return computed(() => rendererVersion.value)
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Render markdown using the currently active renderer.
 *
 * The output lands in `v-html`, so this seam is where safety lives: unless
 * the renderer declares `sanitized: true`, its output goes through DOMPurify
 * here — a registered renderer cannot take sanitization out of the path by
 * simply not thinking about it. The sanitizer keeps `target`, and every
 * element that keeps one gets `noopener noreferrer` in its `rel`, next to any
 * tokens the renderer put there. The `rel` is set on the DOM the sanitizer
 * returns, not through a DOMPurify hook, because a hook is global to the
 * shared module instance and would change the host's own use of DOMPurify.
 *
 * Async: callers await the result and should drop it if a newer render was
 * started meanwhile (see `CanvasNode`). This function is not a reactive
 * dependency site; watch `useRendererVersion()` to re-render on a switch.
 *
 * Rejects when the renderer does, and when DOMPurify has no DOM to work on
 * (a server render) and the renderer is not `sanitized`.
 *
 * @param text - The markdown text to render
 * @returns HTML string, safe to inject
 */
export async function renderedMarkdown(text: string): Promise<string> {
  const renderer = getActiveRenderer()
  const html = await renderer.render(text)
  if (renderer.sanitized) return html
  // Where DOMPurify cannot run, `sanitize` is missing or hands its input back
  // as it came.
  if (!DOMPurify.isSupported) {
    throw new Error(`renderedMarkdown needs a DOM to sanitize the output of "${renderer.id}"`)
  }
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ['target'], RETURN_DOM_FRAGMENT: true })
  for (const el of clean.querySelectorAll('[target]')) {
    const rel = new Set((el.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean))
    rel.add('noopener')
    rel.add('noreferrer')
    el.setAttribute('rel', [...rel].join(' '))
  }
  // A fragment has no `innerHTML`. The holder is made in the fragment's own
  // document, the inert one the sanitizer parsed into, not the page's.
  const holder = clean.ownerDocument.createElement('div')
  holder.append(clean)
  return holder.innerHTML
}
