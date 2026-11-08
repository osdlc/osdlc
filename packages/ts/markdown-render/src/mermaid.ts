/**
 * Mermaid rendering, framework-free.
 *
 * Mermaid is a ~1MB optional peer, so it is imported the first time a diagram
 * is actually rendered and never before. A host without it gets one warning
 * and a rejection per render, which the caller turns into a source fallback.
 */

import { warnMissingPeer } from './peers.ts'

/** A mermaid theme; the built-in names complete, any other string passes through. */
export type MermaidTheme = 'default' | 'dark' | 'forest' | 'neutral' | 'base' | (string & {})

/** The slice of the mermaid module a renderer uses. */
export interface MermaidLike {
  initialize(config: object): void
  /** The config in force; when present, a level another caller loosened is put back. */
  getConfig?(): { securityLevel?: string }
  render(id: string, source: string): Promise<{ svg: string }>
}

/**
 * Build a renderer over a mermaid loader: the cached module, initialized
 * theme, and id sequence live in this closure, per renderer, not at module
 * level, so the once-per-theme guard tracks one mermaid module's global state
 * per loader. `renderMermaid` below is the single instance over the real
 * dynamic import, giving production exactly one guard and one id sequence;
 * tests pass a fake loader through the same factory for isolated instances.
 */
export function createMermaidRenderer(
  load: () => Promise<MermaidLike>,
): (source: string, theme?: MermaidTheme) => Promise<string> {
  let loading: Promise<MermaidLike> | undefined
  let sequence = 0

  /**
   * `mermaid.initialize` is global state, so it is called once per theme rather
   * than once per draw.
   *
   * Every block on a page shares one mermaid module, so re-initializing it for
   * each diagram lets the last block to render decide the config for all of
   * them — which is invisible while every block passes the same `theme` and
   * quietly wrong the moment one does not. Keyed by theme so a genuine change
   * still takes: a re-initialize with a NEW value is a real instruction, a
   * re-initialize with the one already in force is not.
   */
  let initializedTheme: string | null = null

  return async (source, theme = 'default') => {
    // Memoize the module, not the attempt: a failed import (a stale chunk after
    // a redeploy) must not disable every later diagram, so a rejection drops
    // the cached promise and the next render loads again.
    if (!loading) {
      loading = load().catch((cause: unknown) => {
        loading = undefined
        throw cause
      })
    }
    const mermaid = await loading
    const loosened =
      mermaid.getConfig !== undefined && mermaid.getConfig().securityLevel !== 'strict'
    if (initializedTheme !== theme || loosened) {
      // `securityLevel` is passed rather than left to mermaid's default, which
      // is already `strict`. `initialize` MERGES into one module-global config,
      // so the level in force is whatever the last caller left — and mermaid is
      // a singleton this package shares with anything else on the page. Naming
      // it here means a diagram is sanitized because this renderer said so, not
      // because nobody else spoke. A `%%{init}%%` directive in the source
      // cannot lower it: mermaid keeps `securityLevel` on its `secure` list.
      //
      // `suppressErrorRendering`: without it, a failed render draws mermaid's
      // "Syntax error" graphic into the temporary div it appended to
      // `document.body` and throws without removing it, so every invalid
      // diagram left a stray bomb at the bottom of the page. With it, mermaid
      // removes the div and rethrows; the caller shows its own fallback.
      mermaid.initialize({
        startOnLoad: false,
        theme,
        securityLevel: 'strict',
        suppressErrorRendering: true,
      })
      initializedTheme = theme
    }
    // mermaid first removes any element in the document holding this id, `d`
    // + id or `i` + id, so the id must be one the pipeline cannot put on the
    // page. It holds an uppercase letter and an underscore: a heading slug is
    // lowercase, and a `^block-id` allows no underscore. A note's raw ids all
    // start `user-content-`, and footnote ids, which share this `markdownRender_`
    // prefix, continue with `fn-` or `fnref-`, never `mermaid-`.
    const { svg } = await mermaid.render(`markdownRender_mermaid-${++sequence}`, source)
    return svg
  }
}

/**
 * Render `source` to SVG markup. Initializes mermaid once per theme and mints
 * ids from one sequence. Rejects on a mermaid error, or on every call when the
 * `mermaid` peer is not installed (warned once); the caller decides the
 * fallback.
 */
export const renderMermaid: (source: string, theme?: MermaidTheme) => Promise<string> =
  createMermaidRenderer(() =>
    import('mermaid').then(
      (m) => m.default,
      (err: unknown) => {
        warnMissingPeer('mermaid', 'diagrams render as source')
        throw err
      },
    ),
  )
