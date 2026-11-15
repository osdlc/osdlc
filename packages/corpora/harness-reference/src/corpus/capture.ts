/**
 * `capture`: fetch a page, check that a quote occurs on it, and write a study result to the corpus
 * corpus, adding the page's document record when it has none. The schemas in
 * corpus/documents/ and corpus/study-results/ hold the rules; this checks the result with
 * the corpus-schema validator and removes what it wrote if the corpus no longer validates.
 */
import { existsSync, mkdirSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import { type CorpusReport, type Data, fold, idProblem, validateCorpus } from '@osdlc/corpus-schema'

import { createdBy, link, normalizeUrl, record } from './corpus.ts'

/** The kinds study-results.schema.md requires a document for (its if/then); keep the two in step. */
export const PAGE_KINDS = ['docs', 'changelog', 'source', 'issue', 'third-party'] as const
export type PageKind = (typeof PAGE_KINDS)[number]
/** The `version_basis` enum of study-results.schema.md; keep the two in step. */
const VERSION_BASES = ['exact', 'inferred', 'unknown'] as const
type VersionBasis = (typeof VERSION_BASES)[number]

export interface CaptureOptions {
  corpus: string
  /** The harness record's id, such as `Claude Code`. */
  harness: string
  /** An https URL, or the path of a document record. */
  document: string
  kind: PageKind
  excerpt: string
  observedBy: string
  locator?: string
  version?: string
  /** Defaults to `inferred` when `version` is given. */
  versionBasis?: VersionBasis
  /** The study result's name after its date. Defaults to the document's id. */
  name?: string
  /** A new document's id. Defaults to the page title. */
  documentName?: string
  /** A new document's title. Defaults to the page's <title>. */
  title?: string
  /** A new document's publisher. Defaults to the harness's vendor. */
  publisher?: string
}

export interface CaptureDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  /** Today as YYYY-MM-DD. */
  today: () => string
}

export interface CaptureResult {
  /** Paths relative to the corpus root. */
  studyResult: string
  document: string
  createdDocument: boolean
}

/** Milliseconds `capture` waits for a page. */
const FETCH_TIMEOUT_MS = 30_000

/** Characters around the quote kept in `prefix` and `suffix`, as Hypothes.is does. */
const CONTEXT = 32

/** NFC, no zero-width characters, and each whitespace run as one space. */
export const normalize = (s: string): string =>
  s
    .normalize('NFC')
    .replace(/[\u200b-\u200d\ufeff]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  middot: '·',
}

const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/giu, (whole, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })

const BLOCK_TAGS =
  'address|article|aside|blockquote|br|dd|details|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|option|p|pre|section|summary|table|td|th|tr|ul'

/**
 * The visible text of an HTML page: no markup, scripts, styles or page chrome (nav, header, footer,
 * aside); block tags become spaces.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(
      /<(head|script|style|noscript|template|svg|nav|header|footer|aside)\b[\s\S]*?<\/\1\s*>/giu,
      ' ',
    )
    .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, 'giu'), ' ')
    .replace(/<[^>]*>/gu, '')
  return normalize(decodeEntities(text))
}

const pageTitle = (html: string): string | undefined => {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu.exec(html)
  const title = m?.[1] === undefined ? '' : normalize(decodeEntities(m[1]))
  return title === '' ? undefined : title
}

/** The quote found in `text`, whitespace-normalized, with the text either side of it. */
export function findExcerpt(
  text: string,
  excerpt: string,
): { exact: string; prefix: string; suffix: string } | undefined {
  const exact = normalize(excerpt)
  const at = exact === '' ? -1 : text.indexOf(exact)
  if (at < 0) return undefined
  // By code point, so a slice never starts or ends inside a surrogate pair.
  return {
    exact,
    prefix: [...text.slice(0, at)].slice(-CONTEXT).join(''),
    suffix: [...text.slice(at + exact.length)].slice(0, CONTEXT).join(''),
  }
}

/**
 * The `created` contribution for `observedBy`, written `person: <name>` or `agent: <name>`; an
 * agent is a software contributor.
 */
export function contribution(observedBy: string, observed: string): Data {
  const m = /^(person|agent):\s*(.*)$/su.exec(observedBy)
  const name = (m?.[2] ?? observedBy).trim()
  if (name === '') throw new Error(`observed-by "${observedBy}" names nobody`)
  return createdBy(name, m?.[1] === 'agent' ? 'software' : 'person', observed)
}

/**
 * What to fetch for `url`. A github.com page is chrome around a file, so a `blob/` URL is read as
 * the raw file and a repository URL as its README source; any other URL is read as it is.
 */
function fetchTarget(url: string): { url: string; accept: string } {
  const blob = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/u.exec(url)
  if (blob !== null)
    return {
      url: `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`,
      accept: 'text/plain, */*;q=0.1',
    }
  const repo = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/u.exec(url)
  if (repo !== null)
    return {
      url: `https://api.github.com/repos/${repo[1]}/${repo[2]}/readme`,
      accept: 'application/vnd.github.raw+json',
    }
  return { url, accept: 'text/html, text/markdown, text/plain;q=0.9, */*;q=0.1' }
}

/** Find or create the document, fetch the page, check the quote and write the study result. */
export async function capture(opts: CaptureOptions, deps: CaptureDeps): Promise<CaptureResult> {
  const corpus = resolve(opts.corpus)
  const before = validateCorpus(corpus)
  if (before.errors.length > 0)
    throw new Error(`the corpus has errors; fix them first:\n${before.errors.join('\n')}`)
  if (!PAGE_KINDS.includes(opts.kind))
    throw new Error(`kind must be one of ${PAGE_KINDS.join(', ')}; capture records pages only`)
  if (opts.versionBasis !== undefined && !VERSION_BASES.includes(opts.versionBasis))
    throw new Error(`version basis must be one of ${VERSION_BASES.join(', ')}`)

  const harness = before.records.get('harnesses')?.get(opts.harness)
  const harnessFile = before.files.get('harnesses')?.get(opts.harness)
  if (harness === undefined || harnessFile === undefined)
    throw new Error(`no harness record named "${opts.harness}"`)

  const documents = before.records.get('documents') ?? new Map<string, Data>()
  const documentFiles = before.files.get('documents') ?? new Map<string, string>()
  let documentId: string | undefined
  let url: string
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(opts.document)) {
    url = opts.document
    if (!url.startsWith('https://')) throw new Error(`${url}: a document URL must use https`)
    documentId = [...documents].find(([, data]) =>
      ((data['urls'] as string[] | undefined) ?? []).some(
        (u) => normalizeUrl(u) === normalizeUrl(url),
      ),
    )?.[0]
  } else {
    const abs = [resolve(opts.document), resolve(corpus, opts.document)].find(existsSync)
    const rel = abs === undefined ? undefined : relative(corpus, abs).split(sep).join('/')
    documentId = [...documentFiles].find(([, file]) => file === rel)?.[0]
    if (documentId === undefined) throw new Error(`${opts.document}: not a document record`)
    // A record with several URLs is read at its first, which the document lists as canonical.
    url = String((documents.get(documentId)?.['urls'] as string[] | undefined)?.[0])
  }

  const target = fetchTarget(url)
  const response = await deps.fetch(target.url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: target.accept },
  })
  if (!response.ok) throw new Error(`${url}: fetch failed with HTTP ${response.status}`)
  const raw = await response.text()
  const html =
    /html/iu.test(response.headers.get('content-type') ?? '') || /^\s*<(!doctype|html)/iu.test(raw)
  const found = findExcerpt(html ? htmlToText(raw) : normalize(raw), opts.excerpt)
  if (found === undefined)
    throw new Error(`${url}: excerpt not found on the page (compared with whitespace collapsed)`)

  const written: string[] = []
  const write = (rel: string, text: string): void => {
    mkdirSync(dirname(join(corpus, rel)), { recursive: true })
    writeFileSync(join(corpus, rel), text, { flag: 'wx' })
    written.push(rel)
  }
  try {
    let documentFile = documentId === undefined ? undefined : documentFiles.get(documentId)
    const createdDocument = documentFile === undefined
    if (documentFile === undefined) {
      const title = opts.title ?? (html ? pageTitle(raw) : undefined)
      if (title === undefined) throw new Error(`${url}: the page has no title; pass --title`)
      const name = normalize(opts.documentName ?? title)
      const publisher = normalize(opts.publisher ?? String(harness['vendor']))
      const nameProblem = idProblem(name)
      if (nameProblem !== undefined)
        throw new Error(`document name "${name}" ${nameProblem}; pass --document-name`)
      if (/[/\\]/u.test(publisher))
        throw new Error(`publisher "${publisher}" holds a slash; pass --publisher`)
      if ([...documents.keys()].some((id) => fold(id) === fold(name)))
        throw new Error(
          `a document named "${name}" already exists for another URL; pass --document-name`,
        )
      documentFile = `documents/${publisher.replace(/[ .]+$/u, '')}/${name}.md`
      write(documentFile, record({ title, urls: [url], publisher, url_status: 'live' }, ''))
    }

    const observed = deps.today()
    const name = opts.name ?? basename(documentFile, extname(documentFile))
    const studyResultFile = `study-results/${opts.harness}/${observed} ${name}.md`
    const nameProblem = idProblem(`${observed} ${name}`)
    if (nameProblem !== undefined)
      throw new Error(`study-result name "${observed} ${name}" ${nameProblem}; pass another --name`)
    if (existsSync(join(corpus, studyResultFile)))
      throw new Error(
        `${studyResultFile} already exists; study results are append-only, so pass --name`,
      )
    const basis = opts.versionBasis ?? (opts.version === undefined ? undefined : 'inferred')
    const data: Data = {
      kind: opts.kind,
      reportedIn: [link(studyResultFile, documentFile)],
      harness: link(studyResultFile, harnessFile),
      ...(opts.version === undefined ? {} : { version: opts.version }),
      ...(basis === undefined ? {} : { version_basis: basis }),
      observed,
      ...(opts.locator === undefined ? {} : { locator: opts.locator }),
      excerpt: found,
      contributions: [contribution(opts.observedBy, observed)],
    }
    write(studyResultFile, record(data, `> ${found.exact}`))

    const after: CorpusReport = validateCorpus(corpus)
    if (after.errors.length > 0)
      throw new Error(`the new records do not validate:\n${after.errors.join('\n')}`)
    return { studyResult: studyResultFile, document: documentFile, createdDocument }
  } catch (e) {
    for (const rel of written.reverse()) {
      rmSync(join(corpus, rel))
      for (
        let d = dirname(rel);
        d !== '.' && readdirSync(join(corpus, d)).length === 0;
        d = dirname(d)
      )
        rmdirSync(join(corpus, d))
    }
    throw e
  }
}

const USAGE = `usage: capture --harness <id> --document <url or path> --kind <${PAGE_KINDS.join('|')}>
               --excerpt <text> --observed-by <who> [--locator <where>]
               [--version <v> [--version-basis exact|inferred|unknown]] [--name <name>]
               [--document-name <name>] [--title <title>] [--publisher <name>] [--corpus <dir>]`

const today = (): string => {
  return new Date().toISOString().slice(0, 10)
}

async function main(argv: string[]): Promise<number> {
  let values: Record<string, string | undefined>
  try {
    const str = { type: 'string' } as const
    values = parseArgs({
      args: argv,
      options: {
        corpus: str,
        harness: str,
        document: str,
        kind: str,
        excerpt: str,
        locator: str,
        version: str,
        'version-basis': str,
        'observed-by': str,
        name: str,
        'document-name': str,
        title: str,
        publisher: str,
      },
    }).values
  } catch (e) {
    console.error(`${(e as Error).message}\n${USAGE}`)
    return 2
  }
  const { harness, document, kind, excerpt } = values
  const observedBy = values['observed-by']
  if (!harness || !document || !kind || !excerpt || !observedBy) {
    console.error(USAGE)
    return 2
  }
  try {
    const result = await capture(
      {
        corpus: values['corpus'] ?? resolve(import.meta.dirname, '../../corpus'),
        harness,
        document,
        kind: kind as PageKind,
        excerpt,
        observedBy,
        locator: values['locator'],
        version: values['version'],
        versionBasis: values['version-basis'] as VersionBasis | undefined,
        name: values['name'],
        documentName: values['document-name'],
        title: values['title'],
        publisher: values['publisher'],
      },
      { fetch: (url, init) => fetch(url, init), today },
    )
    if (result.createdDocument) console.log(`wrote ${result.document}`)
    console.log(`wrote ${result.studyResult}`)
    return 0
  } catch (e) {
    console.error(`capture: ${(e as Error).message}`)
    return 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main(process.argv.slice(2))
