/**
 * A minimal frontmatter reader, the only markdown function the readers need.
 *
 * `@osdlc/frontmatter-lossless` finds the frontmatter block. This module adds a
 * small `yaml` parse of it. Reads are lenient (`splitLenient` accepts a BOM,
 * leading blank lines and padded fence lines). This module never writes
 * anything back.
 *
 * Runtime-agnostic: pure, no `node:`/Bun coupling.
 */

import { splitLenient } from '@osdlc/frontmatter-lossless'
import { parse as parseYaml } from 'yaml'

import { asObject } from './json.ts'

/**
 * Split `text` into `[rawFrontmatterYaml | null, body]`. With no frontmatter the
 * first element is null and the body is the whole input; otherwise the body is
 * exactly what follows the closing fence line.
 *
 * It is as lenient as {@link parseFrontmatter}. The documents that parse must
 * also split, or a block the parser recognised (padded fence, leading blanks,
 * BOM) would be returned as body. Read-only: the tolerated framing is not
 * recorded, so never rebuild a file from this pair.
 */
export function splitFrontmatter(text: string): [string | null, string] {
  const s = splitLenient(text)
  if (s === null) return [null, text]
  return [s.yaml, s.body]
}

/**
 * Top-level `argument-hint: <value>` lines with an unquoted value on the same
 * line. Claude Code reads the value as text, but forms such as
 * `[pr-number] [priority]` or `[--fix] <path>` are not valid YAML.
 */
const HINT_LINE = /^argument-hint:[ \t]+(?!['"|>])(\S.*?)[ \t]*$/gm

/** `raw` with every unquoted `argument-hint` value quoted, so YAML reads it as the text the author typed. */
function quoteArgumentHint(raw: string): string {
  return raw.replace(HINT_LINE, (_, value: string) => {
    // A ` #` starts a YAML comment, as it does after a quoted value.
    const text = value.replace(/[ \t]+#.*$/, '')
    return `argument-hint: ${JSON.stringify(text)}`
  })
}

/** The keys {@link rawFields} reads when the block is not valid YAML. */
const RAW_KEYS = ['name', 'description', 'argument-hint'] as const

/**
 * `name`, `description` and `argument-hint` read line by line from a block
 * that is not valid YAML. A value is the rest of its `key:` line, without
 * matching outer quotes; a `|` or `>` value is the indented lines below it.
 */
function rawFields(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const lines = raw.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const match = /^([A-Za-z][\w-]*):(?:[ \t]+(.*?))?[ \t]*$/.exec(lines[i]!)
    const key = match?.[1]
    if (key === undefined || !(RAW_KEYS as readonly string[]).includes(key) || key in out) continue
    const value = match![2] ?? ''
    if (/^[|>][+-]?$/.test(value)) {
      const block: string[] = []
      while (i + 1 < lines.length && (/^[ \t]/.test(lines[i + 1]!) || lines[i + 1] === '')) {
        block.push(lines[++i]!.trim())
      }
      out[key] = block.join(value.startsWith('>') ? ' ' : '\n').trim()
      continue
    }
    const quoted = /^(['"])(.*)\1$/.exec(value)
    out[key] = quoted ? quoted[2] : value.replace(/[ \t]+#.*$/, '')
  }
  return out
}

/**
 * Parse the leading frontmatter block into a plain object, or null when it is
 * absent or not a mapping. An empty block yields `{}`. Values are the raw
 * YAML types, uncoerced.
 *
 * Claude Code accepts some front matter that is not valid YAML, so the parse
 * is lenient in two steps. An unquoted `argument-hint` value is always read
 * as text. When the block is still not valid YAML, `name`, `description`
 * and `argument-hint` are read from their raw lines and the other keys are
 * dropped.
 */
export function parseFrontmatter(text: string): Record<string, unknown> | null {
  const raw = splitLenient(text)?.yaml
  if (raw === undefined) return null
  let data: unknown
  try {
    data = parseYaml(quoteArgumentHint(raw))
  } catch {
    return rawFields(raw)
  }
  if (data === null || data === undefined) return {}
  return asObject(data)
}

/** Coerce a frontmatter value to a trimmed string (block scalars arrive parsed). */
export function frontmatterString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

/**
 * The `argument-hint` field, trimmed, or null when it is unset, blank or not
 * text. {@link parseFrontmatter} reads an unquoted value such as
 * `[pr-number] [priority]` as text, so the hint reads as the author typed it.
 */
export function argumentHintOf(fm: Record<string, unknown>): string | null {
  const value = fm['argument-hint']
  if (typeof value !== 'string') return null
  const hint = value.trim()
  return hint === '' ? null : hint
}
