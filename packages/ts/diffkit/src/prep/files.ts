/**
 * Which changed files deserve a reviewer's attention, and which can be set
 * aside with a stated reason. Prep classifies nothing itself: every fact comes
 * from the code-stats `DiffReport` of the change, its file group (which reads
 * `.gitattributes` linguist attributes) and its change category, so `prep` and
 * `code-stats diff` agree on what a generated file or a formatting-only change
 * is.
 */

import type { DiffReport } from '@osdlc/code-stats'

import type { PrepManifest } from './schema.ts'

type Row = DiffReport['fileList'][number]
type Dropped = PrepManifest['files']['dropped'][number]['reason']

/**
 * Why a file is not worth reading, or null when it is; the reasons are
 * described on `files.dropped[].reason` in ./schema.ts. A reformatted test or
 * doc file is kept, because code-stats puts the tests and docs categories
 * ahead of formatting, and so is a comment-only source file
 * (`category: 'comments'`): comment accuracy is reviewed.
 */
export function dropReason(row: Row): Dropped | null {
  if (row.group === 'generated' || row.group === 'vendored') return row.group
  return row.category === 'formatting' ? 'formatting-only' : null
}

export const byPath = (a: { path: string }, b: { path: string }): number =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0

export function splitFiles(report: DiffReport): PrepManifest['files'] {
  const kept: PrepManifest['files']['kept'] = []
  const dropped: PrepManifest['files']['dropped'] = []
  for (const row of report.fileList) {
    const reason = dropReason(row)
    if (reason !== null) dropped.push({ path: row.path, reason })
    else {
      kept.push({
        path: row.path,
        status: row.status,
        group: row.group,
        category: row.category,
        language: row.language,
        added: row.added,
        removed: row.removed,
      })
    }
  }
  return { kept: kept.sort(byPath), dropped: dropped.sort(byPath) }
}
