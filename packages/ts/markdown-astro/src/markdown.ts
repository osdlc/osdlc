import { embedKind, embedSize, isMediaKind, splitFragment } from '@osdlc/markdown-render/plugins'
import { bodyLinksSpanned, displayText, parseInner, stripCode } from '@osdlc/markdown-link'
import type { AssetIndex } from './assets.ts'

/**
 * Low-level rewrites between Obsidian markdown and Astro markdown. These touch
 * ONLY the constructs that differ between the two worlds —
 *
 *   1. embedded images    `![[img.png]]`   <->  `![img.png](/base/img.png)`
 *   2. frontmatter assets `[[img.png]]`    <->  `/base/img.png`
 *
 * Relational `[[Note]]` wikilinks, every non-image embed (`![[Note]]`,
 * `![[clip.mp4]]`, `![[doc.pdf]]`) and a sized image (`![[img.png|300]]`) are
 * left UNTOUCHED; the remark plugin renders them at build time instead.
 *
 * Going vault -> Astro, embeds are resolved against an {@link AssetIndex} so a
 * media file anywhere in the vault (not just `_attachments`) is found, copied,
 * and given a correct URL. Going Astro -> vault, an image keeps its path under
 * the public base, and the files of the media embeds left in place are found
 * through the asset manifest.
 */

/** Standard markdown image: `![alt](src "title")`. `d` reports the alt's span. */
const MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g

/**
 * `body` with fenced and inline code blanked to spaces, at the same UTF-16
 * offsets. `stripCode` keeps the code point count, so a blanked character
 * outside the Basic Multilingual Plane is widened back to two units.
 */
function maskCode(body: string): string {
  const stripped = Array.from(stripCode(body))
  let out = ''
  let i = 0
  for (const c of body) {
    const s = stripped[i++] ?? c
    out += s === c ? c : s.repeat(c.length)
  }
  return out
}

const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p

/** A file copy the rewrite implies; paths are relative to direction-specific roots. */
export interface CopyOp {
  /** Source path (vault -> Astro: relative to vault root). */
  srcRel: string
  /** Destination path (vault -> Astro: relative to the public asset dir). */
  destRel: string
}

/**
 * Build a `/base/sub/path.png` URL with each path segment percent-encoded.
 * `(` and `)` are encoded too: `encodeURIComponent` leaves them, and a `)` in
 * a markdown image destination ends it.
 */
export function assetUrl(base: string, outSub: string): string {
  const tail = outSub
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/\(/g, '%28').replace(/\)/g, '%29'))
    .join('/')
  return `${base}/${tail}`
}

interface ToAstroResult {
  body: string
  copies: CopyOp[]
  /** Embed targets that did not match any file in the vault. */
  missing: string[]
  /**
   * Each resolved media embed's (or media link's) target, as written, to its
   * path under the public asset dir. The remark plugin reads these from the
   * asset manifest to point a media embed or link at its copy.
   */
  assets: Record<string, string>
}

/**
 * VAULT -> ASTRO. Classify every embed with markdown-render's `embedKind`, the
 * rule markdown-render uses. An image embed becomes a markdown image at the
 * resolved public URL. Every other embed stays as written for the remark
 * plugin to render, and so does a sized image (`![[img.png|300]]`): a
 * markdown image cannot carry the size, and leaving it keeps the size on the
 * way back to the vault. A copy (or a miss) is recorded for every media embed
 * — image, video, audio and PDF — but not for a note, heading or block embed,
 * which names a note rather than a file to publish. A plain `[[report.pdf]]`
 * link to a media file in the vault is copied and recorded too, and left as
 * written.
 *
 * The alt text is what a reader sees for the embed, as in the app: the alias
 * with any size dropped, else the target. The toVault rewrite drops an alt
 * that is just the file name, so the embed comes back as written.
 *
 * Embeds come from `@osdlc/markdown-link`'s scanner, which skips code spans and
 * fences, so an embed shown in a code sample stays as written. The scan is
 * linear, so a long unterminated `![[` costs no more than its length.
 */
export function embedsToImages(body: string, publicBase: string, index: AssetIndex): ToAstroResult {
  const base = publicBase.replace(/\/$/, '')
  const copies: CopyOp[] = []
  const missing: string[] = []
  const assets: Record<string, string> = {}
  let out = ''
  let last = 0
  for (const link of bodyLinksSpanned(body)) {
    if (link.kind === 'markdown') continue
    const fragment = splitFragment(parseInner(link.raw, true)?.heading ?? undefined)
    if (link.kind === 'wikilink') {
      // A `[[report.pdf]]` link to a vault file is published like an embed,
      // so the remark plugin can link its copy. The link stays as written.
      if (!isMediaKind(embedKind(link.target, fragment, 'missing'))) continue
      const ref = index.resolve(link.target)
      if (!ref.resolved) continue
      copies.push({ srcRel: ref.vaultPath, destRel: ref.outSub })
      assets[link.target] = ref.outSub
      continue
    }
    const ref = index.resolve(link.target)
    const kind = embedKind(link.target, fragment, ref.resolved ? 'attachment' : 'missing')
    if (!isMediaKind(kind)) continue
    if (ref.resolved) {
      copies.push({ srcRel: ref.vaultPath, destRel: ref.outSub })
      assets[link.target] = ref.outSub
    } else missing.push(link.target)
    // `embedSize` reads the last `|` part, so `|300` and `|Caption|300` both stay.
    if (kind !== 'image' || embedSize(link.alias ?? undefined)) continue
    const alt = displayText(body.slice(link.start, link.end))
    out += `${body.slice(last, link.start)}![${alt}](${assetUrl(base, ref.outSub)})`
    last = link.end
  }
  return { body: out + body.slice(last), copies, missing, assets }
}

/**
 * Undo {@link assetUrl}: decode each `/` segment with `decodeURIComponent`, so
 * `%26`, `%2C` and the like come back too. `%2F` stays encoded: decoded, it
 * would split the path. A segment with a malformed percent sequence (e.g. a
 * literal "50%" in a src) is left untouched instead of throwing.
 */
function decodePath(value: string): string {
  return value
    .split('/')
    .map((seg) => {
      try {
        return decodeURIComponent(seg.replace(/%2F/gi, '%252F'))
      } catch {
        return seg
      }
    })
    .join('/')
}

interface FmToAstroResult {
  value: string
  copy: CopyOp | null
  missing: string | null
}

/**
 * Frontmatter single-asset value, VAULT -> ASTRO. `[[img.png]]`, a bare path, or
 * a vault sub-path is resolved against the index; external URLs pass through.
 * A value already under the public base is a URL, so its tail is decoded first.
 */
export function fmAssetToUrl(
  value: string,
  publicBase: string,
  index: AssetIndex,
): FmToAstroResult {
  const base = publicBase.replace(/\/$/, '')
  // Anchored, but a `\s*` beside a lazy class is ambiguous: an
  // unterminated `[[<spaces>|<spaces>` frontmatter value went cubic (~3.5s at
  // 1600 spaces). Greedy bounded classes stop at the delimiter; `raw` is
  // trimmed below either way.
  const wiki = value.match(/^\[\[([^\]|]{1,512})(?:\|[^\]]{0,512})?\]\]$/)
  const raw = (wiki?.[1] ?? value).trim()
  if (/^https?:\/\//.test(raw)) return { value: raw, copy: null, missing: null }
  const ref = index.resolve(
    raw.startsWith(base + '/') ? decodePath(raw.slice(base.length + 1)) : raw,
  )
  return {
    value: assetUrl(base, ref.outSub),
    copy: ref.resolved ? { srcRel: ref.vaultPath, destRel: ref.outSub } : null,
    missing: ref.resolved ? null : raw,
  }
}

interface ToVaultResult {
  body: string
  /** Paths under the public dir of the images that point at the public base, to copy into the vault. */
  assets: string[]
  /**
   * Targets, as written, of the media embeds the forward rewrite left in
   * place (video, audio, PDF, sized image). Their files are copied too.
   */
  embeds: string[]
  /**
   * Targets, as written, of `[[file.pdf]]` media links. Their files are
   * copied only if the transform published them.
   */
  links: string[]
}

/** `[`, `]`, `|` and `#` break the `[[target|alias#fragment]]` syntax, so a name holding one cannot be an embed target. */
const embeddable = (sub: string): boolean => !/[[\]|#]/.test(sub)

/**
 * ASTRO -> VAULT. Turn markdown images that point at the public asset base back
 * into Obsidian embeds. A sub-path under the base is preserved in the embed so
 * the asset round-trips. Other srcs (external URLs) are left as-is, and so is
 * every `![[embed]]` the forward rewrite left in place. An image in a code
 * span or fence is code, not an image, and stays as written. `mediaPath` is the
 * asset manifest lookup; a target it knows counts as a media file whatever its
 * extension.
 */
export function imagesToEmbeds(
  body: string,
  publicBase: string,
  mediaPath?: (target: string) => string | null,
): ToVaultResult {
  const assets: string[] = []
  const base = publicBase.replace(/\/$/, '')
  let out = ''
  let last = 0
  for (const m of maskCode(body).matchAll(MD_IMAGE_RE)) {
    // The src holds no spaces, so none of it was masked; the alt may hold a
    // code span, so it is read from the body.
    const start = m.index!
    const alt = body.slice(start + 2, start + 2 + m[1]!.length)
    const decoded = decodePath(m[2]!)
    if (!decoded.startsWith(base + '/')) continue
    const sub = decoded.slice(base.length + 1)
    assets.push(sub)
    if (!embeddable(sub)) continue
    // An alt that is only the file name is the default the forward rewrite
    // writes, not an alias. An alt that reads as a size (`300`, `x|200`) is
    // dropped: embedSize reads a numeric last `|` part as a size, so any alias
    // whose label is `300` also carries a size (`300|0` is width 0).
    const alias = alt && basename(alt) !== basename(sub) && !embedSize(alt) ? alt : ''
    out += body.slice(last, start) + (alias ? `![[${sub}|${alias}]]` : `![[${sub}]]`)
    last = start + m[0].length
  }
  const embeds: string[] = []
  const links: string[] = []
  for (const link of bodyLinksSpanned(body)) {
    if (link.kind === 'markdown') continue
    const fragment = splitFragment(parseInner(link.raw, true)?.heading ?? undefined)
    // A target the manifest says was published is a file even when its
    // extension names no media kind.
    const fallback = mediaPath?.(link.target) == null ? 'missing' : 'attachment'
    if (!isMediaKind(embedKind(link.target, fragment, fallback))) continue
    ;(link.kind === 'embed' ? embeds : links).push(link.target)
  }
  return { body: out + body.slice(last), assets, embeds, links }
}

/**
 * Frontmatter single-asset value, ASTRO -> VAULT. `/base/img.png` -> `[[img.png]]`.
 * A name no embed can hold keeps the URL as written; its file is still copied.
 */
export function fmUrlToAsset(
  value: string,
  publicBase: string,
): { value: string; asset: string | null } {
  const base = publicBase.replace(/\/$/, '')
  const decoded = decodePath(value)
  if (!decoded.startsWith(base + '/')) return { value, asset: null }
  const sub = decoded.slice(base.length + 1)
  return { value: embeddable(sub) ? `[[${sub}]]` : value, asset: sub }
}

export { basename }
