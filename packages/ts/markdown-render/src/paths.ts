/**
 * Vault-path classification and display helpers — Obsidian-dialect knowledge:
 * which extensions render as markdown, which embed as media, and how a path
 * spells its display name.
 * Pure string functions over `/`-separated vault-relative paths.
 */

import { ATTACHMENT_EXTENSIONS } from '@osdlc/markdown-link'

const MARKDOWN_EXT = /\.(md|markdown)$/i

/**
 * Media the dialect embeds, split by what renders them: one `image` bucket
 * would render `![[talk.mp4]]` or `![[paper.pdf]]` as a broken `<img>`.
 */
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i
const VIDEO_EXT = /\.(mp4|webm|ogv|mov|mkv)$/i
const AUDIO_EXT = /\.(mp3|wav|m4a|3gp|flac|ogg|oga|opus)$/i
const PDF_EXT = /\.pdf$/i

/** Extensions worth showing as raw text rather than as a binary placeholder. */
const TEXTUAL_EXT = /\.(canvas|base|json|ya?ml|toml|txt|csv|tsv|ts|js|css|html?)$/i

/** Delimited table files a viewer can show as a grid. */
const DELIMITED_EXT = /\.(csv|tsv)$/i

// Owned by @osdlc/markdown-link; re-exported for hosts that import it from here.
export { ATTACHMENT_EXTENSIONS }

/** Last path segment, extension included. */
export function noteBasename(vaultPath: string): string {
  return vaultPath.split('/').pop() ?? vaultPath
}

/** Last path segment with its markdown extension removed — the display title. */
export function noteStem(vaultPath: string): string {
  return noteBasename(vaultPath).replace(MARKDOWN_EXT, '')
}

/** The whole path with its markdown extension removed, directories intact. */
export function stripMarkdownExt(vaultPath: string): string {
  return vaultPath.replace(MARKDOWN_EXT, '')
}

/** Everything above the file, or `''` for a vault-root file. */
export function noteFolder(vaultPath: string): string {
  const cut = vaultPath.lastIndexOf('/')
  return cut === -1 ? '' : vaultPath.slice(0, cut)
}

/** Lowercase extension without the dot, or `''` when there is none. */
export function noteExtension(vaultPath: string): string {
  const base = noteBasename(vaultPath)
  const cut = base.lastIndexOf('.')
  return cut <= 0 ? '' : base.slice(cut + 1).toLowerCase()
}

export function isMarkdownPath(vaultPath: string): boolean {
  return MARKDOWN_EXT.test(vaultPath)
}

export function isImagePath(vaultPath: string): boolean {
  return IMAGE_EXT.test(vaultPath)
}

export function isVideoPath(vaultPath: string): boolean {
  return VIDEO_EXT.test(vaultPath)
}

export function isAudioPath(vaultPath: string): boolean {
  return AUDIO_EXT.test(vaultPath)
}

export function isPdfPath(vaultPath: string): boolean {
  return PDF_EXT.test(vaultPath)
}

export function isTextualPath(vaultPath: string): boolean {
  return TEXTUAL_EXT.test(vaultPath)
}

/** A CSV or TSV file. */
export function isDelimitedPath(vaultPath: string): boolean {
  return DELIMITED_EXT.test(vaultPath)
}

/** A Bases query file. */
export function isBasePath(vaultPath: string): boolean {
  return noteExtension(vaultPath) === 'base'
}

/** A JSON Canvas board. */
export function isCanvasPath(vaultPath: string): boolean {
  return noteExtension(vaultPath) === 'canvas'
}

/**
 * The subset of {@link ATTACHMENT_EXTENSIONS} the reading view can actually
 * render inline, as an `<img>`/`<video>`/`<audio>` or a PDF frame.
 *
 * DERIVED, never hand-listed: it is exactly the extensions the four media
 * predicates above claim. That is what keeps it honestly a subset — a format
 * added to one of those sets joins this one automatically, and a format that
 * nothing renders (`tiff`, `heic`) or that a host renders for itself (`base`,
 * `canvas`) stays out without anyone having to remember to exclude it.
 */
export const EMBEDDABLE_EXTENSIONS = ATTACHMENT_EXTENSIONS.filter((ext) => {
  const probe = `x.${ext}`
  return isImagePath(probe) || isVideoPath(probe) || isAudioPath(probe) || isPdfPath(probe)
})
