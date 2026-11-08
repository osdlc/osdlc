/**
 * `$math$` and `$$math$$` rendering with KaTeX, framework-free.
 *
 * KaTeX is an optional peer, imported lazily on first use with the module
 * cached, so a host that never renders math never loads it — and need not
 * install it. When it is absent the import rejects, {@link loadKatex} warns
 * once, and the caller falls back to the source. A host that renders math must
 * import `katex/dist/katex.min.css` itself — a library that injects global
 * stylesheets is a library that fights the host's build.
 *
 * That stylesheet is not optional polish: it carries the rule that clips
 * `.katex-mathml` out of the visual layer. Without it, the MathML twin
 * {@link renderMath} emits renders as a second, garbled copy of every
 * equation. `theme.css` ships the same rule as a floor, so a host that imports
 * the renderer's theme and forgets KaTeX's gets ugly math rather than doubled
 * math — but KaTeX's own stylesheet is still what makes the glyphs correct.
 */

import { warnMissingPeer } from './peers.ts'

export type KatexModule = typeof import('katex').default

let katexPromise: Promise<KatexModule> | undefined

/**
 * The lazily imported KaTeX module; the promise is cached once it resolves.
 * A rejection is not cached — a failed import (a stale chunk after a redeploy)
 * must not disable every later render — so the next call imports again. Rejects
 * when the `katex` peer is not installed, after one warning.
 */
export function loadKatex(): Promise<KatexModule> {
  katexPromise ??= import('katex').then(
    (m) => m.default,
    (err: unknown) => {
      katexPromise = undefined
      warnMissingPeer('katex', 'math renders as source')
      throw err
    },
  )
  return katexPromise
}

/**
 * KaTeX HTML for `latex`. Safe to assign to `innerHTML`: KaTeX produces the
 * markup from the source it escapes itself. Never rejects for bad LaTeX —
 * `throwOnError: false` renders the offending source in a `.katex-error` span
 * instead.
 */
export async function renderMath(latex: string, displayMode: boolean): Promise<string> {
  const katex = await loadKatex()
  // `htmlAndMathml`, not `html`: the HTML output is a pile of positioned spans
  // that spells an equation to an eye and nothing at all to a screen reader.
  // This mode emits both — a MathML twin in a clipped `.katex-mathml` span
  // (the semantic copy, carrying the TeX source in an `<annotation>`), and
  // the visual copy marked `aria-hidden`. Assistive tech reads one, sighted
  // readers see the other, and neither sees the other's copy.
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    output: 'htmlAndMathml',
  })
}
