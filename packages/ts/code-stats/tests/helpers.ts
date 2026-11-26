import type { ContentKind } from '../src/scan/kinds.ts'

const KIND_BY_MARK: Record<string, ContentKind> = {
  L: 'logic',
  B: 'boilerplate',
  C: 'comment',
  D: 'doc',
  _: 'blank',
}

/**
 * A source text and the kind of each line, written as `<mark> <line>`:
 * `L` logic, `B` boilerplate, `C` comment, `D` doc, `_` blank.
 */
export function annotated(source: string): { text: string; kinds: ContentKind[] } {
  const rows = source
    .replace(/^\n/, '')
    .replace(/\n\s*$/, '')
    .split('\n')
  const indent = Math.min(...rows.filter((r) => r.trim() !== '').map((r) => r.search(/\S/)))
  const kinds: ContentKind[] = []
  const lines: string[] = []
  for (const row of rows) {
    const body = row.slice(indent)
    const kind = KIND_BY_MARK[body[0] ?? '_']
    if (kind === undefined) throw new Error(`no kind mark on fixture row: ${row}`)
    kinds.push(kind)
    lines.push(body.slice(2))
  }
  return { text: `${lines.join('\n')}\n`, kinds }
}

/** A one-file unified diff whose body is `-`/`+` lines in one hunk. */
export function diff(path: string, body: string[]): string {
  const removed = body.filter((l) => l.startsWith('-')).length
  const added = body.filter((l) => l.startsWith('+')).length
  return (
    `diff --git a/${path} b/${path}\nindex 1..2 100644\n--- a/${path}\n+++ b/${path}\n` +
    `@@ -1,${removed} +1,${added} @@\n${body.join('\n')}\n`
  )
}
