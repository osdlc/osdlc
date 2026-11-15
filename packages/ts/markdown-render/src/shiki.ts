/**
 * `@osdlc/markdown-render/shiki` — the optional Shiki highlighting pass.
 *
 * Kept off the main entry so a build that never imports this subpath ships no
 * Shiki code. Opt in with `highlight: rehypeShiki()`.
 */

export { rehypeShiki, RESERVED_FENCE_LANGS, type RehypeShikiOptions } from './plugins/shiki.ts'
