import { compose, split as splitNote } from '@osdlc/frontmatter-lossless'
import { parse as parseYaml } from 'yaml'

import type { AssetIndex } from './assets.ts'
import { embedsToImages, fmAssetToUrl, fmUrlToAsset, imagesToEmbeds } from './markdown.ts'
import type { CopyOp } from './markdown.ts'

export type Direction = 'toAstro' | 'toVault'

export interface RewriteOptions {
  direction: Direction
  publicBase: string
  /** Frontmatter keys that hold a single asset reference. */
  frontmatterAssets: string[]
  /** Vault asset index — required for `toAstro` so embeds resolve to real files. */
  assetIndex?: AssetIndex
  /**
   * `toVault` only: where a media embed or link target was published under
   * the public dir (the transform's asset manifest). Without an answer an
   * embed's target itself is taken as that path, and a link is not copied.
   */
  mediaPath?: (target: string) => string | null
}

export interface FileRewriteResult {
  text: string
  /** Asset copies this file implies (paths relative to direction-specific roots). */
  copies: CopyOp[]
  /** Embed/asset targets that matched no file (vault -> Astro only). */
  missing: string[]
  /** Resolved media embed target -> path under the public asset dir (vault -> Astro only). */
  assets: Record<string, string>
}

/**
 * The string a frontmatter scalar's raw text holds, or `null` when it holds no
 * string to rewrite: a YAML null, or a quoted value YAML cannot read. A quoted
 * value is read with YAML rules, so escapes and a trailing comment are handled.
 * An unquoted value is taken as written minus a trailing ` # comment`, so an
 * unquoted `[[img.png]]` stays a wikilink rather than a YAML flow sequence.
 */
function scalarValue(raw: string): string | null {
  const t = raw.trim()
  if (t.startsWith('"') || t.startsWith("'")) {
    try {
      const v: unknown = parseYaml(t)
      return typeof v === 'string' ? v : null
    } catch {
      return null
    }
  }
  const plain = t.replace(/\s+#.*$/, '')
  return /^(?:null|Null|NULL|~)$/.test(plain) ? null : plain
}

/**
 * Rewrite a single markdown file in the given direction. Only asset constructs
 * are touched; frontmatter is edited line-by-line so unrelated keys stay
 * byte-for-byte identical. Relational `[[Note]]` wikilinks are never modified.
 *
 * @experimental Outside the stable API; it may change in a minor release.
 */
export function rewriteFile(text: string, opts: RewriteOptions): FileRewriteResult {
  const copies: CopyOp[] = []
  const missing: string[] = []
  let assets: Record<string, string> = {}
  const note = splitNote(text)
  const hasFm = note.yaml !== null

  if (opts.direction === 'toAstro' && !opts.assetIndex) {
    throw new Error('rewriteFile: toAstro requires opts.assetIndex')
  }

  let fm = note.yaml ?? ''
  if (hasFm && opts.frontmatterAssets.length) {
    // The top-level mapping's indent: that of the first line that is not
    // blank or a comment. Usually none.
    const indent = /^([ \t]*)[^\s#]/m.exec(fm)?.[1] ?? ''
    for (const key of opts.frontmatterAssets) {
      // At the top-level indent only: a deeper `key:` is a nested key or
      // block-scalar text.
      const lineRe = new RegExp(`^(${indent}${escapeRe(key)}:[ \\t]*)(.+?)[ \\t]*$`, 'm')
      fm = fm.replace(lineRe, (whole, prefix: string, rawValue: string) => {
        const value = scalarValue(rawValue)
        if (!value) return whole
        let next: string
        if (opts.direction === 'toAstro') {
          const res = fmAssetToUrl(value, opts.publicBase, opts.assetIndex!)
          if (res.copy) copies.push(res.copy)
          if (res.missing) missing.push(res.missing)
          next = res.value
        } else {
          const res = fmUrlToAsset(value, opts.publicBase)
          if (res.asset) copies.push({ srcRel: res.asset, destRel: res.asset })
          next = res.value
        }
        // A JSON string is a valid YAML double-quoted scalar.
        return next === value
          ? whole
          : `${prefix}${JSON.stringify(next)}${trailingComment(rawValue)}`
      })
    }
  }

  const bodySrc = note.body
  let body: string
  if (opts.direction === 'toAstro') {
    const res = embedsToImages(bodySrc, opts.publicBase, opts.assetIndex!)
    body = res.body
    copies.push(...res.copies)
    missing.push(...res.missing)
    assets = res.assets
  } else {
    const res = imagesToEmbeds(bodySrc, opts.publicBase, opts.mediaPath)
    body = res.body
    copies.push(...res.assets.map((a) => ({ srcRel: a, destRel: a })))
    for (const target of res.embeds) {
      const sub = opts.mediaPath?.(target) ?? target
      copies.push({ srcRel: sub, destRel: sub })
    }
    // A link the transform did not publish names no file in the public dir.
    for (const target of res.links) {
      const sub = opts.mediaPath?.(target)
      if (sub) copies.push({ srcRel: sub, destRel: sub })
    }
  }

  const out = compose(hasFm ? fm : null, body, note.shape)
  return { text: out, copies: dedupe(copies), missing, assets }
}

/** The ` # comment` after a frontmatter scalar's raw text, with its leading space, or `''`. */
function trailingComment(raw: string): string {
  const q = raw[0]
  if (q !== '"' && q !== "'") return /\s+#.*$/.exec(raw)?.[0] ?? ''
  let i = 1
  while (i < raw.length) {
    const c = raw[i]
    if (q === '"' && c === '\\') i += 2
    else if (q === "'" && c === "'" && raw[i + 1] === "'") i += 2
    else if (c === q) break
    else i += 1
  }
  const rest = raw.slice(i + 1)
  return /^\s+#/.test(rest) ? rest : ''
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function dedupe(copies: CopyOp[]): CopyOp[] {
  const seen = new Set<string>()
  return copies.filter((c) => {
    const k = `${c.srcRel} ${c.destRel}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
