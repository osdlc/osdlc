/**
 * Minimal frontmatter reader — the only markdown primitive the readers need.
 *
 * The framing comes from `@osdlc/frontmatter-lossless` (the shared byte-exact
 * splitter); what stays local is the small `yaml` reader over it. Reads are LENIENT (`splitLenient`: BOM,
 * leading blanks, and padded fence lines are tolerated) — this module never
 * writes anything back.
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
 * Lenient framing, matching {@link parseFrontmatter}: the same documents that
 * parse must also split, or a block the parser recognised (padded fence, leading
 * blanks, BOM) would be handed back as body. Read-only — the tolerated framing
 * is not recorded, so never rebuild a file from this pair.
 */
export function splitFrontmatter(text: string): [string | null, string] {
  const s = splitLenient(text)
  if (s === null) return [null, text]
  return [s.yaml, s.body]
}

/**
 * Parse the leading frontmatter block into a plain object, or null when it is
 * absent, malformed or not a mapping. An empty block yields `{}`. Values are the
 * raw YAML types, uncoerced.
 */
export function parseFrontmatter(text: string): Record<string, unknown> | null {
  const raw = splitLenient(text)?.yaml
  if (raw === undefined) return null
  let data: unknown
  try {
    data = parseYaml(raw)
  } catch {
    return null
  }
  if (data === null || data === undefined) return {}
  return asObject(data)
}
