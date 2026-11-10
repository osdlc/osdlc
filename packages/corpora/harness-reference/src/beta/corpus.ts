/**
 * Read the beta corpus once and answer questions about its records: which record a link names,
 * what a record's folder-relative path is. Shared by `lint`, `import-alpha` and `compile`.
 */
import { posix, resolve } from 'node:path'

import { type CorpusReport, type Data, markdownLink, validateCorpus } from '@osdlc/corpus-schema'
import { stringify } from 'yaml'

export const BETA = resolve(import.meta.dirname, '../../corpora/beta')

export type Strength = 'weak' | 'moderate' | 'strong'
/** Weakest first, so a strength's index is its rank. */
export const STRENGTHS: Strength[] = ['weak', 'moderate', 'strong']
/**
 * The strongest a supporting line can be, by the best kind among its study results. An unlisted
 * kind is weak. See corpora/beta/README.md#statements.
 */
export const KIND_STRENGTH: Record<string, Strength> = {
  run: 'strong',
  source: 'strong',
  'help-text': 'strong',
  docs: 'moderate',
  changelog: 'moderate',
  issue: 'weak',
  'third-party': 'weak',
  inferred: 'weak',
}

export interface RecordRef {
  type: string
  id: string
  /** Corpus-relative path, with `/` separators. */
  file: string
}

export interface Beta {
  report: CorpusReport
  /** The record a corpus-relative path is, by path. */
  byFile: Map<string, RecordRef>
  /** Every record of a type, sorted by file path. */
  all(type: string): { ref: RecordRef; data: Data }[]
  get(type: string, id: string): Data | undefined
  /** The record `link` names when written in the record at `fromFile`, or undefined. */
  resolve(fromFile: string, link: unknown): RecordRef | undefined
}

const LINK = /^\[(?:\\.|[^\]\\])*\]\((<[^>]*>|[^)]*)\)$/u

/** The path inside a relative Markdown link string, decoded, or undefined when it is not one. */
export function linkPath(link: unknown): string | undefined {
  if (typeof link !== 'string') return undefined
  const m = LINK.exec(link)
  if (m === null) return undefined
  let target = m[1] ?? ''
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
  const hash = target.indexOf('#')
  if (hash >= 0) target = target.slice(0, hash)
  try {
    return decodeURIComponent(target)
  } catch {
    return undefined
  }
}

export function loadBeta(root: string = BETA): Beta {
  const report = validateCorpus(root)
  const byFile = new Map<string, RecordRef>()
  for (const [type, files] of report.files)
    for (const [id, file] of files) byFile.set(file, { type, id, file })
  return {
    report,
    byFile,
    all: (type) =>
      [...(report.files.get(type) ?? [])]
        .sort(([, a], [, b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([id, file]) => ({
          ref: { type, id, file },
          data: report.records.get(type)?.get(id) ?? {},
        })),
    get: (type, id) => report.records.get(type)?.get(id),
    resolve(fromFile, link) {
      const path = linkPath(link)
      if (path === undefined) return undefined
      return byFile.get(posix.normalize(posix.join(posix.dirname(fromFile), path)))
    },
  }
}

/** A record file: YAML frontmatter, then the body when there is one. */
export function record(data: Data, body: string): string {
  return `---\n${stringify(data, { lineWidth: 0 })}---\n${body === '' ? '' : `\n${body}\n`}`
}

/** A relative Markdown link from the file `from` to the file `to`, both corpus-relative. */
export function link(from: string, to: string, text?: string): string {
  return markdownLink(
    text ?? posix.basename(to, posix.extname(to)),
    posix.relative(posix.dirname(from), to),
  )
}

/** The `created` contribution a contributor made on `date` (`YYYY-MM-DD`). */
export function createdBy(name: string, agentType: 'person' | 'software', date: string): Data {
  return {
    contributor: { name, agentType },
    activityType: 'created',
    date: `${date}T00:00:00Z`,
  }
}

/** A URL as documents compare it: surrounding space and trailing slashes dropped. */
export const normalizeUrl = (url: string): string => url.trim().replace(/\/+$/u, '')

/** JSON text with object keys sorted at every depth, so equal values give equal text. Arrays keep their order. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, x]) => [k, sort(x)]),
          )
        : v
  return JSON.stringify(sort(value))
}
