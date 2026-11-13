/**
 * Plain text for a value that is not one scalar: an object or a list on one line, and whether
 * a string reads as code. No imports but types, so the browser code shares it.
 */

import type { DataTree } from './data-types.ts'

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A key in words: `version_basis` and `reportedIn` become `Version basis` and `Reported in`. */
export function keyLabel(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The text of a string that is one whole Markdown link or wikilink, else the string. */
function linkText(value: string): string {
  const md = /^\[([^\]]*)\]\(\s*<?[^)>]+?>?\s*\)$/.exec(value.trim())
  if (md !== null && md[1] !== '') return md[1] as string
  const wiki = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]$/.exec(value.trim())
  if (wiki !== null) return wiki[2] ?? (wiki[1] as string)
  return value
}

/**
 * Whether a string reads as code and not as words: a flag, a path, a command, a variable or a
 * key. `/acme:review`, `--resume <id>`, `CLAUDE_HOME` and `workspace-write` do. A sentence and
 * a plain word do not.
 */
export function looksLikeCode(text: string): boolean {
  const t = text.trim()
  if (t === '' || t.length > 80 || t.includes('\n')) return false
  if (/^(--?[a-z]|\/[\w.$~-]|\.{0,2}\/|~\/|\$[\w{(])/i.test(t)) return true
  if (/\s/.test(t)) return false
  if (/^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(t)) return true
  return /[\\/_$:=<>{}[\]@~*()]|\w[.-]\w/.test(t) && !/^https?:/.test(t)
}

/**
 * A value on one line: a scalar as text (`Yes` and `No` for a boolean), a list joined with
 * commas, and an object as `Key: value` pairs joined with `·`. Null and empty values are left
 * out. Text past `max` characters is cut with `…`.
 */
export function oneLine(value: unknown, max = 160): string {
  const text = line(value, true)
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function line(value: unknown, top: boolean): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') return linkText(value).replace(/\s+/g, ' ').trim()
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value))
    return value
      .map((v) => line(v, false))
      .filter(Boolean)
      .join(', ')
  if (isObject(value)) {
    const pairs = Object.entries(value)
      .map(([key, v]) => [keyLabel(key), line(v, false)] as const)
      .filter(([, text]) => text !== '')
      .map(([label, text]) => `${label}: ${text}`)
    return top ? pairs.join(' · ') : pairs.join('; ')
  }
  return String(value)
}

/** The text of a tree on one line, as `oneLine` writes a value. */
export function treeText(tree: DataTree | undefined, top = true): string {
  if (tree === null || tree === undefined) return ''
  if (typeof tree === 'string') return tree
  if (Array.isArray(tree))
    return tree
      .map((item) => treeText(item, false))
      .filter(Boolean)
      .join(', ')
  if ('entries' in tree)
    return tree.entries
      .map((entry) => `${entry.label}: ${treeText(entry.value, false)}`)
      .join(top ? ' · ' : '; ')
  return tree.text
}
