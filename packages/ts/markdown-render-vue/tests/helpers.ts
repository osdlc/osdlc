/** Shared test helpers. */

import {
  renderToHtml,
  type LinkResolution,
  type MarkdownRenderOptions,
} from '@osdlc/markdown-render'

/** Render markdown to HTML with the default (vault-less) resolver. */
export async function html(markdown: string, options: MarkdownRenderOptions = {}): Promise<string> {
  return (await renderToHtml(markdown, options)).trim()
}

/**
 * A resolver backed by a fixed set of note paths: anything listed resolves,
 * anything else is missing. `*.png` etc resolve as attachments.
 */
export function vaultResolver(paths: string[]) {
  const set = new Set(paths)
  return (target: string): LinkResolution => {
    const display = target.split('/').pop() ?? target
    if (/^https?:\/\//.test(target)) return { kind: 'external', path: target, display }
    if (!set.has(target)) return { kind: 'missing', display }
    return {
      kind: /\.(png|jpg|jpeg|gif|svg|pdf)$/i.test(target) ? 'attachment' : 'note',
      path: `/vault/${target}`,
      display,
    }
  }
}
