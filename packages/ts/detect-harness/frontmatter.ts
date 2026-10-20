/**
 * Minimal frontmatter reader — the only markdown primitive the importer needs.
 *
 * The framing comes from `@osdlc/frontmatter-lossless` (the shared byte-exact
 * splitter); what stays local is the small `{ fm, parseError }` diagnostic
 * wrapper over the `yaml` reader. Reads are LENIENT (`splitLenient`: BOM,
 * leading blanks, and padded fence lines are tolerated) — this module never
 * writes anything back.
 *
 * Runtime-agnostic: pure, no `node:`/Bun coupling.
 */

import { splitLenient } from '@osdlc/frontmatter-lossless'
import { parse as parseYaml } from 'yaml'

/** The raw YAML text of the frontmatter block, or null when there is none. */
export function extractFrontmatter(text: string): string | null {
  return splitLenient(text)?.yaml ?? null
}

/**
 * Split `text` into `[rawFrontmatterYaml | null, body]`. With no frontmatter the
 * first element is null and the body is the whole input; otherwise the body is
 * exactly what follows the closing fence line.
 *
 * Lenient framing, matching {@link extractFrontmatter}: the same documents that
 * parse must also split, or a block the parser recognised (padded fence, leading
 * blanks, BOM) would be handed back as body. Read-only — the tolerated framing
 * is not recorded, so never rebuild a file from this pair.
 */
export function splitFrontmatter(text: string): [string | null, string] {
  const s = splitLenient(text)
  if (s === null) return [null, text]
  return [s.yaml, s.body]
}

/** The outcome of parsing a document's frontmatter block. */
export interface FrontmatterResult {
  fm: Record<string, unknown> | null
  parseError: string | null
}

/**
 * Parse the leading frontmatter block into `{ fm, parseError }`. A
 * present-but-empty block yields `fm: {}`; a non-mapping or malformed block
 * yields a `parseError`. Values are the raw YAML types, uncoerced.
 */
export function parseFrontmatterResult(text: string): FrontmatterResult {
  const raw = extractFrontmatter(text)
  if (raw === null) return { fm: null, parseError: 'no YAML frontmatter block found' }
  let data: unknown
  try {
    data = parseYaml(raw)
  } catch (e) {
    return { fm: null, parseError: `YAML parse error: ${(e as Error).message}` }
  }
  if (data === null || data === undefined) return { fm: {}, parseError: null }
  if (typeof data !== 'object' || Array.isArray(data)) {
    return {
      fm: null,
      parseError: `frontmatter must be a mapping, got ${Array.isArray(data) ? 'list' : typeof data}`,
    }
  }
  return { fm: data as Record<string, unknown>, parseError: null }
}

/**
 * Parse the frontmatter block into a plain object, or null when absent /
 * malformed / a non-mapping. An empty block yields `{}`.
 */
export function parseFrontmatter(text: string): Record<string, unknown> | null {
  const { fm, parseError } = parseFrontmatterResult(text)
  return parseError !== null ? null : fm
}
