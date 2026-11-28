import type { FileContent, LinguistAttributes } from '../types.ts'
import {
  createGroupClassifier,
  FILE_GROUPS,
  isUnreviewed,
  kindInGroup,
  type GroupRules,
} from '../groups.ts'
import { addKindCounts, countKinds, emptyKindCounts, firstLine, splitLines } from '../scan/kinds.ts'
import { createScannerRegistry, type ScannerRegistry } from '../scan/registry.ts'
import { listed, READER_NAME } from './notes.ts'
import type { CountReport } from './schema.ts'

/**
 * A file to count: its path, its content as read, and what `.gitattributes` says about it.
 */
export interface CountFile {
  path: string
  content: FileContent
  attributes?: LinguistAttributes | undefined
}

/**
 * Options for {@link buildCountReport}: the scanners, the group rules and whether to list every
 * file.
 */
export interface CountOptions {
  registry?: ScannerRegistry
  groups?: GroupRules
  /** Include a row per file. Default false. */
  detail?: boolean
}

type Language = CountReport['languages'][number]

/**
 * Assembles a {@link CountReport} from files read: an array, or any iterable,
 * such as one that reads each file as it is asked for, so only one is held.
 */
export function buildCountReport(
  source: CountReport['source'],
  paths: readonly string[],
  files: Iterable<CountFile>,
  options: CountOptions = {},
): CountReport {
  const registry = options.registry ?? createScannerRegistry()
  const classifyGroup = createGroupClassifier(options.groups)
  const total = emptyKindCounts()
  const languages = new Map<string | null, Language>()
  const groups = Object.fromEntries(
    FILE_GROUPS.map((g) => [
      g,
      { files: 0, lines: 0, kinds: isUnreviewed(g) ? null : emptyKindCounts() },
    ]),
  ) as CountReport['groups']
  const fileList: NonNullable<CountReport['fileList']> = []
  const skipped: CountReport['skipped'] = []
  let unknown = 0
  const failed: Record<'table' | 'one-line', string[]> = { table: [], 'one-line': [] }
  let lines = 0
  let read = 0

  for (const file of files) {
    read += 1
    if (file.content.kind !== 'text') {
      skipped.push({ path: file.path, reason: file.content.kind })
      continue
    }
    const text = file.content.text
    const language = registry.languageOf(file.path, firstLine(text))
    const group = classifyGroup({
      path: file.path,
      category: language.category,
      attributes: file.attributes,
      text,
    })
    const g = groups[group]
    // Generated and vendored files are counted by lines only, so they are not scanned.
    const scan = g.kinds === null ? null : registry.scan(text, file.path)
    const lineCount = scan === null ? splitLines(text).length : scan.kinds.length
    g.files += 1
    g.lines += lineCount
    lines += lineCount
    let kinds = null
    if (scan !== null && g.kinds !== null) {
      kinds = countKinds(scan.kinds.map((k) => kindInGroup(group, k)))
      addKindCounts(g.kinds, kinds)
      addKindCounts(total, kinds)
      const row = languages.get(scan.name) ?? {
        language: scan.name,
        files: 0,
        lines: 0,
        kinds: emptyKindCounts(),
      }
      row.files += 1
      row.lines += lineCount
      addKindCounts(row.kinds, kinds)
      languages.set(scan.name, row)
      if (scan.fallback?.reason === 'unknown-language') unknown += 1
      else if (scan.fallback !== null && scan.reader !== 'scanner') {
        failed[scan.reader].push(`${file.path} (${scan.fallback.detail})`)
      }
    }
    if (options.detail === true) {
      fileList.push({ path: file.path, language: language.name, group, lines: lineCount, kinds })
    }
  }

  const notes: string[] = []
  if (unknown > 0) {
    notes.push(`${unknown} file(s) of no known language were read with the one-line comment rule`)
  }
  for (const reader of ['table', 'one-line'] as const) {
    const paths = failed[reader]
    if (paths.length > 0) {
      notes.push(
        `a scanner failed on ${paths.length} file(s), which ${READER_NAME[reader]} read instead: ${listed(paths)}`,
      )
    }
  }

  return {
    schema: 1,
    source,
    paths: [...paths],
    files: read - skipped.length,
    lines,
    kinds: total,
    languages: [...languages.values()].sort(
      (a, b) => b.lines - a.lines || (a.language ?? '').localeCompare(b.language ?? ''),
    ),
    groups,
    fileList: options.detail === true ? fileList : null,
    skipped,
    notes,
  }
}
