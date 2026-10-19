/**
 * Finding formatting and filtering: helpers over `Finding[]` that render a location, format a
 * line, filter by area or id, and count levels. Pure functions; nothing here mutates a finding.
 */
import type { Finding } from './types.js'

/**
 * The location token for a finding:
 *   - `<path>:<line>` when `opts.withPath` and the finding has a `path` (just `<path>` if it has
 *     no `pos`);
 *   - else `line <n>` when the finding is position-pinned;
 *   - else `opts.root` (default `"<root>"`) — the whole-document fallback.
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
 * A full one-line rendering of a finding.
 *   - `"full"` (default): `[<id>] (<location>): <message>` — always carries a location token
 *     (`findingLocation`, so `<root>` when unpinned).
 *   - `"line"`: `[<id>] (line <n>): <message>`, with the ` (line <n>)` omitted when the finding
 *     has no `pos`.
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
 * Select findings by `area` and/or explicit `ids`. `area` keeps findings whose id is in that area
 * (`id === area` or `id.startsWith(area + "/")`) — so `{ area: "frontmatter" }` keeps every
 * `frontmatter/*` finding. `ids` keeps findings whose id is a member of the set. When both are
 * given, both must hold (intersection).
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

/** True iff any finding is error-level — the strict-door / exit-nonzero gate. */
export function hasErrors(findings: Finding[]): boolean {
  return findings.some((f) => f.level === 'error')
}

/** Count findings by level. */
export function countByLevel(findings: Finding[]): { error: number; warn: number; report: number } {
  const out = { error: 0, warn: 0, report: 0 }
  for (const f of findings) out[f.level]++
  return out
}
