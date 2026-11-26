import { classifyLines } from './classify.ts'
import { CONTENT_KINDS, splitLines, type ContentKind } from './kinds.ts'
import { detectLanguage } from './language.ts'
import type { LanguageCategory } from './overlay.ts'
import { prefixKind } from './prefix.ts'

/** A scanner a caller adds for a language the built-in table reads poorly or not at all. */
export interface LanguageScanner {
  /** Names the scanner in fallback details. */
  readonly id: string
  /** The language name reports show for the files it reads that the built-in table does not know. */
  readonly language: string
  /** Defaults to `programming`. Used with {@link language}. */
  readonly category?: LanguageCategory
  matches(path: string): boolean
  /** One kind per line, as {@link splitLines} splits the text. */
  scan(text: string, path: string): readonly ContentKind[]
}

/**
 * What a file's language is, as far as the registry can tell: the built-in
 * table's name for it, else the name its matching scanner gives.
 */
export interface FileLanguage {
  name: string | null
  category: LanguageCategory | null
}

/** Why a file was not read by its preferred reader: a matching scanner, else the table. */
export interface ScanFallback {
  reason: 'unknown-language' | 'scanner-failed'
  detail: string
}

/**
 * Which reader produced a file's kinds: a caller's scanner, the built-in
 * table, or the one-line rule ({@link prefixKind}) when neither could.
 */
export type ScanReader = 'scanner' | 'table' | 'one-line'

/**
 * The result of scanning one file: a kind for each line, the language, and which reader produced
 * them.
 */
export interface FileScan extends FileLanguage {
  kinds: ContentKind[]
  reader: ScanReader
  fallback: ScanFallback | null
}

/** Scans a file by its path's language: caller scanners first, then the built-in table, then the one-line rule. */
export interface ScannerRegistry {
  languageOf(path: string, firstLine?: string): FileLanguage
  scan(text: string, path: string): FileScan
}

/** Options for {@link createScannerRegistry}. */
export interface ScannerRegistryOptions {
  /** Tried in order before the built-in table. */
  scanners?: readonly LanguageScanner[]
}

const KINDS = new Set<string>(CONTENT_KINDS)

/** Runs a caller's scanner: one valid kind per line, else why its result cannot be used. */
function runCustom(
  scanner: LanguageScanner,
  text: string,
  path: string,
  lineCount: number,
): ContentKind[] | string {
  let kinds: ContentKind[]
  try {
    kinds = [...scanner.scan(text, path)]
  } catch (e) {
    return String(e)
  }
  if (kinds.length !== lineCount) return `${kinds.length} kinds for ${lineCount} lines`
  const bad = kinds.find((k) => !KINDS.has(k))
  return bad === undefined ? kinds : `not a content kind: ${String(bad)}`
}

/**
 * A registry that scans a text by its path's language, with optional custom scanners. A scanner
 * that throws, or returns the wrong number of kinds, is skipped and the reason is reported in
 * {@link FileScan.fallback}.
 */
export function createScannerRegistry(options: ScannerRegistryOptions = {}): ScannerRegistry {
  const custom = options.scanners ?? []

  /** The file's scanner, if any; a caller's `matches` that throws counts as no match. */
  function resolve(path: string, firstLine: string | undefined) {
    const scanner = custom.find((s) => {
      try {
        return s.matches(path)
      } catch {
        return false
      }
    })
    const table = detectLanguage(path, firstLine)
    const language: FileLanguage =
      table !== null
        ? { name: table.name, category: table.category }
        : scanner !== undefined
          ? { name: scanner.language, category: scanner.category ?? 'programming' }
          : { name: null, category: null }
    return { scanner, table, language }
  }

  function scan(text: string, path: string): FileScan {
    const lines = splitLines(text)
    const { scanner, table, language } = resolve(path, lines[0])
    let fallback: ScanFallback | null = null
    if (scanner !== undefined) {
      const kinds = runCustom(scanner, text, path, lines.length)
      if (typeof kinds !== 'string') return { ...language, kinds, reader: 'scanner', fallback }
      fallback = { reason: 'scanner-failed', detail: `${scanner.id}: ${kinds}` }
    } else if (table === null) {
      fallback = { reason: 'unknown-language', detail: path }
    }
    return table !== null
      ? { ...language, kinds: classifyLines(table, lines), reader: 'table', fallback }
      : { ...language, kinds: lines.map((l) => prefixKind(l)), reader: 'one-line', fallback }
  }

  return { languageOf: (path, firstLine) => resolve(path, firstLine).language, scan }
}
