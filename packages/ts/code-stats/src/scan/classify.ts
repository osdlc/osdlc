import type { ContentKind } from './kinds.ts'
import { isShebang, type Language } from './language.ts'
import { bracketDelta, lexLines, type LineFacts } from './lexer.ts'

/** A line of nothing but brackets and separators: `});`, `]`, `},`. */
export const PUNCTUATION_ONLY = /^[{}()[\];,]+$/

/** {@link PUNCTUATION_ONLY} with whitespace between, tested on a trimmed line. */
const PUNCTUATION_LINE = /^[{}()[\];,][{}()[\];,\s]*$/

const LICENCE_TEXT =
  /copyright\s+(?:\(c\)|©|\d{4})|SPDX-License-Identifier|licensed under|permission is hereby granted|all rights reserved/i

const SPDX = /SPDX-License-Identifier:/

/** A licence header is looked for only this far into a file. */
const HEADER_LINES = 40

/** Kinds before boilerplate: what the lexer saw, read through the language's category. */
function baseKind(language: Language, line: string, f: LineFacts): ContentKind {
  if (line.trim() === '') return 'blank'
  if (f.code) {
    if (language.category === 'prose') return 'doc'
    if (language.category === 'legal') return 'boilerplate'
    return 'logic'
  }
  return f.doc ? 'doc' : 'comment'
}

/**
 * Code lines that open or continue an import-like statement, or hold only
 * punctuation, and the prefix lines, such as annotations, right before such a
 * statement.
 */
function markBoilerplateCode(language: Language, facts: LineFacts[], kinds: ContentKind[]): void {
  let open = 0
  /** The line before ended in a line continuation, so this one goes on with its statement. */
  let joined = false
  /** Prefix lines since the last other code line, which the next statement may own. */
  let prefixes: number[] = []
  for (const [i, f] of facts.entries()) {
    if (kinds[i] !== 'logic') continue
    const statement = f.codeText.trim()
    const pending = prefixes
    prefixes = []
    if (open > 0 || joined) {
      kinds[i] = 'boilerplate'
      open = Math.max(0, open + bracketDelta(f.structure))
      joined = f.joinsNext
    } else if (f.startsInString) {
      continue
    } else if (language.boilerplate.some((r) => r.test(statement))) {
      kinds[i] = 'boilerplate'
      for (const p of pending) kinds[p] = 'boilerplate'
      // The statement goes on to the next line only when this one ends
      // unfinished, or in a line continuation.
      open = /[{([,]$/.test(f.structure.trimEnd()) ? Math.max(0, bracketDelta(f.structure)) : 0
      joined = f.joinsNext
    } else if (PUNCTUATION_LINE.test(statement)) {
      kinds[i] = 'boilerplate'
    } else if (language.boilerplatePrefixes.some((r) => r.test(statement))) {
      prefixes = [...pending, i]
    }
  }
}

/**
 * The file's first run of plain comment lines, when it reads as a licence,
 * and any SPDX line. Doc comments are never a licence header: a crate's docs
 * may well end with a licence section.
 */
function markLicence(
  lines: readonly string[],
  kinds: ContentKind[],
  endsInComment: (line: number) => boolean,
): void {
  let i = isShebang(lines[0]) ? 1 : 0
  while (i < lines.length && kinds[i] === 'blank') i += 1
  const header: number[] = []
  for (; i < Math.min(lines.length, HEADER_LINES); i += 1) {
    const kind = kinds[i]
    if (kind === 'comment') header.push(i)
    else if (!(kind === 'blank' && endsInComment(i - 1))) break
  }
  if (header.some((h) => LICENCE_TEXT.test(lines[h]!))) {
    for (const h of header) kinds[h] = 'boilerplate'
  }
  for (const [n, line] of lines.entries()) {
    if ((kinds[n] === 'comment' || kinds[n] === 'doc') && SPDX.test(line)) kinds[n] = 'boilerplate'
  }
}

/** What a scanner saw on a line, beyond its kind, that {@link finishKinds} reads. */
export interface LineTraits {
  /** The line holds a doc comment or docstring. */
  doc: boolean
  /** The line holds a comment and no code but a pair of braces. */
  bracedComment: boolean
  /** The line ends inside a block comment, so a blank line after it does not end a licence header. */
  endsInComment: boolean
}

/**
 * The rules every scanner applies last. JSX's `{/* note *\/}` is a comment
 * that needs braces to be one. In a programming or data language, directive
 * comments such as `/// <reference>`, a licence header, SPDX lines and a
 * shebang are boilerplate.
 */
export function finishKinds(
  language: Language,
  lines: readonly string[],
  kinds: ContentKind[],
  traits: readonly LineTraits[],
): ContentKind[] {
  for (const [i, t] of traits.entries()) if (t.bracedComment) kinds[i] = t.doc ? 'doc' : 'comment'
  if (language.category === 'prose' || language.category === 'legal') return kinds
  for (const [i, kind] of kinds.entries()) {
    if (kind === 'comment' || kind === 'doc') {
      const text = lines[i]!.trim()
      if (language.boilerplateComments.some((r) => r.test(text))) kinds[i] = 'boilerplate'
    }
  }
  markLicence(lines, kinds, (i) => traits[i]?.endsInComment === true)
  if (isShebang(lines[0])) kinds[0] = 'boilerplate'
  return kinds
}

/**
 * One {@link ContentKind} per line of `lines`, read as `language`.
 *
 * @experimental
 */
export function classifyLines(language: Language, lines: readonly string[]): ContentKind[] {
  const facts = lexLines(language, lines)
  const kinds = facts.map((f, i) => baseKind(language, lines[i]!, f))
  // Only programming and data files have logic lines for this to mark.
  markBoilerplateCode(language, facts, kinds)
  return finishKinds(language, lines, kinds, facts)
}
