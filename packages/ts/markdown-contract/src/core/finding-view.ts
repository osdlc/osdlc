/**
 * Helpers over `Finding[]`: render a location, format a line, filter by area or id, and count
 * levels. None of them changes a finding.
 */
import type { Finding } from './types.js'

/**
 * The location text for a finding:
 *   - `<path>:<line>` when `opts.withPath` is set and the finding has a `path` (just `<path>`
 *     if it has no `pos`).
 *   - Otherwise `line <n>` when the finding has a `pos`.
 *   - Otherwise `opts.root` (default `"<root>"`), meaning the whole document.
 *
 * Wrap the result in parentheses for a `(line N)` form.
 */
export function findingLocation(f: Finding, opts?: { root?: string; withPath?: boolean }): string {
  if (opts?.withPath && f.path) {
    return f.pos !== undefined ? `${f.path}:${f.pos.line}` : f.path
  }
  if (f.pos !== undefined) return `line ${f.pos.line}`
  return opts?.root ?? '<root>'
}

/**
 * A finding as one line of text.
 *   - `"full"` (default): `[<id>] (<location>): <message>`. It always has a location from
 *     `findingLocation`, so `<root>` when the finding has no `pos`.
 *   - `"line"`: `[<id>] (line <n>): <message>`, without the ` (line <n>)` when the finding has
 *     no `pos`.
 */
export function formatFinding(f: Finding, opts?: { style?: 'line' | 'full' }): string {
  const style = opts?.style ?? 'full'
  if (style === 'line') {
    const loc = f.pos !== undefined ? ` (line ${f.pos.line})` : ''
    return `[${f.id}]${loc}: ${f.message}`
  }
  return `[${f.id}] (${findingLocation(f)}): ${f.message}`
}

/**
 * Selects findings by `area`, by `ids`, or both. `area` keeps findings whose id is in that area
 * (`id === area` or `id.startsWith(area + "/")`), so `{ area: "frontmatter" }` keeps every
 * `frontmatter/*` finding. `ids` keeps findings whose id is in the set. When both are given, a
 * finding must match both.
 */
export function filterFindings(
  findings: Finding[],
  sel: { area?: string; ids?: Iterable<string> },
): Finding[] {
  const idSet = sel.ids !== undefined ? new Set(sel.ids) : undefined
  const { area } = sel
  return findings.filter((f) => {
    if (area !== undefined && !(f.id === area || f.id.startsWith(area + '/'))) return false
    if (idSet !== undefined && !idSet.has(f.id)) return false
    return true
  })
}

/** True when any finding is error-level, the same test `read()` uses before it throws. */
export function hasErrors(findings: Finding[]): boolean {
  return findings.some((f) => f.level === 'error')
}

/** Counts findings by level. */
export function countByLevel(findings: Finding[]): { error: number; warn: number; report: number } {
  const out = { error: 0, warn: 0, report: 0 }
  for (const f of findings) out[f.level]++
  return out
}
