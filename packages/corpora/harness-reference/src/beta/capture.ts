/**
 * `capture`: fetch a page, check that a quote occurs on it, and write an evidence record to the
 * beta corpus, adding the page's reference record when it has none. The schemas in
 * corpora/beta/references/ and corpora/beta/evidence/ hold the rules; this checks the result with
 * the corpus-schema validator and removes what it wrote if the corpus no longer validates.
 */
import { existsSync, mkdirSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import {
  type CorpusReport,
  type Data,
  fold,
  idProblem,
  markdownLink,
  validateCorpus,
} from '@osdlc/corpus-schema'
import { stringify } from 'yaml'

/** The kinds evidence.schema.md requires a reference for (its if/then); keep the two in step. */
export const PAGE_KINDS = ['docs', 'changelog', 'source', 'issue', 'third-party'] as const
export type PageKind = (typeof PAGE_KINDS)[number]
/** The `version_basis` enum of evidence.schema.md; keep the two in step. */
const VERSION_BASES = ['exact', 'inferred', 'unknown'] as const
type VersionBasis = (typeof VERSION_BASES)[number]

export interface CaptureOptions {
  corpus: string
  /** The harness record's id, such as `Claude Code`. */
  harness: string
  /** An https URL, or the path of a reference record. */
  reference: string
  kind: PageKind
  excerpt: string
  observedBy: string
  locator?: string
  version?: string
  /** Defaults to `inferred` when `version` is given. */
  versionBasis?: VersionBasis
  /** The evidence record's name after its date. Defaults to the reference's id. */
  name?: string
  /** A new reference's id. Defaults to the page title. */
  referenceName?: string
  /** A new reference's title. Defaults to the page's <title>. */
  title?: string
  /** A new reference's publisher. Defaults to the harness's vendor. */
  publisher?: string
}

export interface CaptureDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  /** Today as YYYY-MM-DD. */
  today: () => string
}

export interface CaptureResult {
  /** Paths relative to the corpus root. */
  evidence: string
  reference: string
  createdReference: boolean
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

/** A relative Markdown link from the file `from` to the file `to`, both corpus-relative. */
const link = (from: string, to: string): string =>
  markdownLink(basename(to, extname(to)), relative(dirname(from), to).split(sep).join('/'))

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

function record(data: Data, body: string): string {
  return `---\n${stringify(data, { lineWidth: 0 })}---\n${body === '' ? '' : `\n${body}\n`}`
}

/** Find or create the reference, fetch the page, check the quote and write the evidence record. */
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

  const references = before.records.get('references') ?? new Map<string, Data>()
  const referenceFiles = before.files.get('references') ?? new Map<string, string>()
  let referenceId: string | undefined
  let url: string
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(opts.reference)) {
    url = opts.reference
    if (!url.startsWith('https://')) throw new Error(`${url}: a reference URL must use https`)
    referenceId = [...references].find(([, data]) => data['url'] === url)?.[0]
  } else {
    const abs = [resolve(opts.reference), resolve(corpus, opts.reference)].find(existsSync)
    const rel = abs === undefined ? undefined : relative(corpus, abs).split(sep).join('/')
    referenceId = [...referenceFiles].find(([, file]) => file === rel)?.[0]
    if (referenceId === undefined) throw new Error(`${opts.reference}: not a reference record`)
    url = String(references.get(referenceId)?.['url'])
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
    let referenceFile = referenceId === undefined ? undefined : referenceFiles.get(referenceId)
    const createdReference = referenceFile === undefined
    if (referenceFile === undefined) {
      const title = opts.title ?? (html ? pageTitle(raw) : undefined)
      if (title === undefined) throw new Error(`${url}: the page has no title; pass --title`)
      const name = normalize(opts.referenceName ?? title)
      const publisher = normalize(opts.publisher ?? String(harness['vendor']))
      const nameProblem = idProblem(name)
      if (nameProblem !== undefined)
        throw new Error(`reference name "${name}" ${nameProblem}; pass --reference-name`)
      if (/[/\\]/u.test(publisher))
        throw new Error(`publisher "${publisher}" holds a slash; pass --publisher`)
      if ([...references.keys()].some((id) => fold(id) === fold(name)))
        throw new Error(
          `a reference named "${name}" already exists for another URL; pass --reference-name`,
        )
      referenceFile = `references/${publisher.replace(/[ .]+$/u, '')}/${name}.md`
      write(referenceFile, record({ url, title, publisher, url_status: 'live' }, ''))
    }

    const observed = deps.today()
    const name = opts.name ?? basename(referenceFile, extname(referenceFile))
    const evidenceFile = `evidence/${opts.harness}/${observed} ${name}.md`
    const nameProblem = idProblem(`${observed} ${name}`)
    if (nameProblem !== undefined)
      throw new Error(`evidence name "${observed} ${name}" ${nameProblem}; pass another --name`)
    if (existsSync(join(corpus, evidenceFile)))
      throw new Error(`${evidenceFile} already exists; evidence is append-only, so pass --name`)
    const basis = opts.versionBasis ?? (opts.version === undefined ? undefined : 'inferred')
    const data: Data = {
      kind: opts.kind,
      reference: link(evidenceFile, referenceFile),
      harness: link(evidenceFile, harnessFile),
      ...(opts.version === undefined ? {} : { version: opts.version }),
      ...(basis === undefined ? {} : { version_basis: basis }),
      observed,
      ...(opts.locator === undefined ? {} : { locator: opts.locator }),
      excerpt: found,
      observed_by: opts.observedBy,
    }
    write(evidenceFile, record(data, `> ${found.exact}`))

    const after: CorpusReport = validateCorpus(corpus)
    if (after.errors.length > 0)
      throw new Error(`the new records do not validate:\n${after.errors.join('\n')}`)
    return { evidence: evidenceFile, reference: referenceFile, createdReference }
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

const USAGE = `usage: capture --harness <id> --reference <url or path> --kind <${PAGE_KINDS.join('|')}>
               --excerpt <text> --observed-by <who> [--locator <where>]
               [--version <v> [--version-basis exact|inferred|unknown]] [--name <name>]
               [--reference-name <name>] [--title <title>] [--publisher <name>] [--corpus <dir>]`

const today = (): string => {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
        reference: str,
        kind: str,
        excerpt: str,
        locator: str,
        version: str,
        'version-basis': str,
        'observed-by': str,
        name: str,
        'reference-name': str,
        title: str,
        publisher: str,
      },
    }).values
  } catch (e) {
    console.error(`${(e as Error).message}\n${USAGE}`)
    return 2
  }
  const { harness, reference, kind, excerpt } = values
  const observedBy = values['observed-by']
  if (!harness || !reference || !kind || !excerpt || !observedBy) {
    console.error(USAGE)
    return 2
  }
  try {
    const result = await capture(
      {
        corpus: values['corpus'] ?? resolve(import.meta.dirname, '../../corpora/beta'),
        harness,
        reference,
        kind: kind as PageKind,
        excerpt,
        observedBy,
        locator: values['locator'],
        version: values['version'],
        versionBasis: values['version-basis'] as VersionBasis | undefined,
        name: values['name'],
        referenceName: values['reference-name'],
        title: values['title'],
        publisher: values['publisher'],
      },
      { fetch: (url, init) => fetch(url, init), today },
    )
    if (result.createdReference) console.log(`wrote ${result.reference}`)
    console.log(`wrote ${result.evidence}`)
    return 0
  } catch (e) {
    console.error(`capture: ${(e as Error).message}`)
    return 1
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main(process.argv.slice(2))
