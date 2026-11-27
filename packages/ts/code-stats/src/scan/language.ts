import { SCC_LANGUAGES } from './languages.generated.ts'
import {
  EXTENSION_PREFERENCE,
  SPLIT_LANGUAGES,
  PATH_LANGUAGES,
  overlayFor,
  type DocMarkers,
  type DocstringRule,
  type InsignificantWhitespace,
  type LanguageCategory,
  type SyntaxFlags,
} from './overlay.ts'
import type { LanguageSyntax } from './syntax.ts'

/** A language's syntax with our overlay applied. */
export interface Language extends LanguageSyntax {
  category: LanguageCategory
  doc: Required<DocMarkers>
  boilerplate: readonly RegExp[]
  boilerplateComments: readonly RegExp[]
  boilerplatePrefixes: readonly RegExp[]
  codeTokens: readonly string[]
  syntax: SyntaxFlags
  heredoc: RegExp | null
  docstrings: DocstringRule | null
  /** The overlay's `columnOneComments`: markers that open a comment only in column 1. */
  columnOneComments: readonly string[]
  /** The overlay's `insignificantWhitespace`; null where any whitespace but trailing may matter. */
  insignificantWhitespace: InsignificantWhitespace | null
  /** The overlay's `significantWhitespaceLines`. */
  significantWhitespaceLines: readonly RegExp[]
  /** The overlay's `significantLineEndings`. */
  significantLineEndings: boolean
  /** The overlay's `markupExtensions`. */
  markupExtensions: readonly string[]
}

const NO_SYNTAX_FLAGS: SyntaxFlags = {
  multilineStrings: false,
  regexLiterals: false,
  charLiterals: false,
  cppRawStrings: false,
  csharpRawStrings: false,
  fencedCode: false,
  blockCommentsAtLineStart: false,
  blockCommentLines: false,
  lineCommentsAtWordStart: false,
  percentLiterals: false,
  questionMarkChars: false,
  lineContinuation: false,
}

function withOverlay(scc: LanguageSyntax): Language {
  const o = overlayFor(scc.name)
  return {
    ...scc,
    extensions: [...scc.extensions, ...(o.extraExtensions ?? [])],
    shebangs: [...scc.shebangs, ...(o.extraShebangs ?? [])],
    blockComments: o.blockComments ?? scc.blockComments,
    quotes: [...(o.quotes ?? scc.quotes), ...(o.extraQuotes ?? [])].map((q) => {
      const interpolation = o.interpolation?.[q.start]
      return interpolation === undefined ? q : { ...q, interpolation }
    }),
    category: o.category ?? 'programming',
    doc: { line: o.doc?.line ?? [], block: o.doc?.block ?? [] },
    boilerplate: o.boilerplate ?? [],
    boilerplateComments: o.boilerplateComments ?? [],
    boilerplatePrefixes: o.boilerplatePrefixes ?? [],
    codeTokens: o.codeTokens ?? [],
    syntax: { ...NO_SYNTAX_FLAGS, ...o.syntax },
    heredoc: o.heredoc ?? null,
    docstrings: o.docstrings ?? null,
    columnOneComments: o.columnOneComments ?? [],
    insignificantWhitespace: o.insignificantWhitespace ?? null,
    significantWhitespaceLines: o.significantWhitespaceLines ?? [],
    significantLineEndings: o.significantLineEndings ?? false,
    markupExtensions: o.markupExtensions ?? [],
  }
}

interface LanguageIndex {
  byName: Map<string, Language>
  byFileName: Map<string, Language>
  byExtension: Map<string, Language>
  byInterpreter: Map<string, Language>
}

let index: LanguageIndex | undefined

/** Later claims to a key lose, unless the key's preference names them. */
function claim(map: Map<string, Language>, key: string, language: Language): void {
  const preferred = EXTENSION_PREFERENCE[key]
  if (!map.has(key) || preferred === language.name) map.set(key, language)
}

/** scc's table with {@link SPLIT_LANGUAGES} split out of the rows that held them. */
function sccLanguages(): LanguageSyntax[] {
  const split = (row: LanguageSyntax) => SPLIT_LANGUAGES.filter((s) => s.from === row.name)
  return SCC_LANGUAGES.flatMap((row) => {
    const parts = split(row)
    if (parts.length === 0) return [row]
    const moved = new Set(parts.flatMap((p) => p.extensions))
    return [
      { ...row, extensions: row.extensions.filter((e) => !moved.has(e)) },
      ...parts.map((p) => ({
        ...row,
        name: p.name,
        extensions: [...p.extensions],
        filenames: [],
        shebangs: [],
      })),
    ]
  })
}

function buildIndex(): LanguageIndex {
  const idx: LanguageIndex = {
    byName: new Map(),
    byFileName: new Map(),
    byExtension: new Map(),
    byInterpreter: new Map(),
  }
  for (const scc of sccLanguages()) {
    const language = withOverlay(scc)
    idx.byName.set(language.name, language)
    for (const f of language.filenames) claim(idx.byFileName, f, language)
    for (const e of language.extensions) claim(idx.byExtension, e, language)
    for (const s of language.shebangs) claim(idx.byInterpreter, s, language)
  }
  return idx
}

function languages(): LanguageIndex {
  index ??= buildIndex()
  return index
}

/**
 * Every known language, by name.
 *
 * @experimental
 */
export function knownLanguages(): ReadonlyMap<string, Language> {
  return languages().byName
}

/**
 * A known language by name, or null.
 *
 * @experimental
 */
export function languageNamed(name: string): Language | null {
  return languages().byName.get(name) ?? null
}

export const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/**
 * The language of a file: by a known path pattern, its whole name, its
 * longest matching extension (`x.d.ts` before `x.ts`), then the interpreter
 * a `#!` first line names. The path matches case-insensitively.
 */
export function detectLanguage(path: string, firstLine?: string): Language | null {
  const idx = languages()
  const lower = path.toLowerCase()
  const pattern = PATH_LANGUAGES.find(([re]) => re.test(lower))
  if (pattern !== undefined) return idx.byName.get(pattern[1]) ?? null
  const base = basename(lower)
  const exact = idx.byFileName.get(base) ?? idx.byExtension.get(base)
  if (exact !== undefined) return exact
  for (let dot = base.indexOf('.'); dot >= 0; dot = base.indexOf('.', dot + 1)) {
    const found = idx.byExtension.get(base.slice(dot + 1))
    if (found !== undefined) return found
  }
  const interpreter = firstLine === undefined ? null : shebangInterpreter(firstLine)
  if (interpreter === null) return null
  return (
    idx.byInterpreter.get(interpreter) ??
    idx.byInterpreter.get(interpreter.replace(/[\d.]+$/, '')) ??
    null
  )
}

export function isShebang(line: string | undefined): boolean {
  return line !== undefined && line.startsWith('#!') && !line.startsWith('#![')
}

/** `node` from `#!/usr/bin/env node`, `python3` from `#!/usr/bin/python3 -u`; null for Rust's `#![attr]`. */
export function shebangInterpreter(line: string): string | null {
  if (!isShebang(line)) return null
  const words = line.slice(2).trim().split(/\s+/)
  let program = words[0] ?? ''
  if (program.endsWith('/env')) program = words.find((w, i) => i > 0 && !w.startsWith('-')) ?? ''
  const name = program.slice(program.lastIndexOf('/') + 1)
  return name === '' ? null : name
}

const ENDS_IN_WORD = /[\p{L}\p{N}]$/u
const WORD_CHAR = /[\p{L}\p{N}_]/u

/**
 * Whether line-comment `marker`, found at `at` in `line`, opens a comment
 * there. A column-one marker (the overlay's `columnOneComments`) opens one
 * only at column 1, whatever follows it. A marker that ends in a letter or
 * digit must stand as a word, with no letter, digit or `_` on either side, so
 * `REM` opens `REM note` and `REM.` but not `REMOVE=1`.
 */
export function lineCommentOpens(
  language: Language,
  marker: string,
  line: string,
  at: number,
): boolean {
  if (language.columnOneComments.includes(marker)) return at === 0
  if (!ENDS_IN_WORD.test(marker)) return true
  const next = line[at + marker.length]
  if (next !== undefined && WORD_CHAR.test(next)) return false
  return at === 0 || !WORD_CHAR.test(line[at - 1]!)
}
