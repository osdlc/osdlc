import type { z } from 'zod'

import { isUnreviewed, type FileGroup } from '../groups.ts'
import type { dependencyChangeSchema, dependencyEntrySchema } from '../report/schema.ts'
import { linesMatch, splitLines, stripBom, type ContentKind } from '../scan/kinds.ts'
import { basename, isShebang, languageNamed, type Language } from '../scan/language.ts'
import { lexLines, type LineFacts } from '../scan/lexer.ts'
import type { InsignificantWhitespace } from '../scan/overlay.ts'
import type { DiffLine, FileDiff } from './parse.ts'

/**
 * The one kind of change a file got; first match wins in this order. A new
 * test file is `added`, not `tests`. `non-text` is a binary file, a symlink or
 * a submodule: nothing with lines to classify. `mode` is a permission change
 * with no line changed.
 */
export const CHANGE_CATEGORIES = [
  'generated',
  'vendored',
  'non-text',
  'deleted',
  'added',
  'renamed',
  'mode',
  'dependencies',
  'instructions',
  'docs',
  'tests',
  'formatting',
  'config',
  'comments',
  'boilerplate',
  'logic',
] as const
/**
 * One of {@link CHANGE_CATEGORIES}.
 */
export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number]

/**
 * A dependency a manifest names, with its version as written.
 */
export type DependencyEntry = z.infer<typeof dependencyEntrySchema>
/**
 * The dependencies one manifest's diff adds, removes and bumps.
 */
export type DependencyChange = z.infer<typeof dependencyChangeSchema>

/** A value that reads as a version requirement, in package.json and Cargo.toml alike. */
const VERSIONISH = /^(?:[\^~<>=*]|\d|workspace:|npm:|github:|git\+|file:|link:|catalog:)/
const PACKAGE_JSON_ENTRY = /^\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/
/** A `version = "…"` key at the start of a line or inside an inline table. */
const CARGO_VERSION = /(?:^|[{,])\s*version\s*=\s*"([^"]+)"/
/** Cargo package and profile keys whose quoted values can look like versions. */
const CARGO_NOT_DEPENDENCY = new Set([
  'name',
  'version',
  'edition',
  'license',
  'description',
  'authors',
  'repository',
  'homepage',
  'readme',
  'rust-version',
  'resolver',
  'path',
  'publish',
  'license-file',
  'documentation',
  'build',
  'links',
  'default-run',
  'workspace',
  'opt-level',
  'debug',
  'strip',
  'lto',
  'panic',
  'split-debuginfo',
])

/** package.json objects whose entries are dependencies. */
const PACKAGE_JSON_SECTIONS = new Set([
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'overrides',
  'resolutions',
  'catalog',
])
/** Keys outside those objects whose values look like versions: `engines`, mostly. */
const PACKAGE_JSON_NOT_DEPENDENCY = new Set([
  'version',
  'url',
  'node',
  'npm',
  'bun',
  'pnpm',
  'yarn',
  'vscode',
])
const CARGO_SECTION = /^\s*\[+\s*([^\]]+?)\s*\]+/
const CARGO_DEPENDENCY_TABLE = /(?:^|\.)(?:dev-|build-)?dependencies$/

/**
 * The object or table a manifest line sits in, read from the whole file:
 * the nearest opening key above it at a shallower indent in package.json, the
 * nearest `[table]` header in Cargo.toml. Undefined when it cannot be told.
 */
function sectionAt(manifest: string, fileLines: readonly string[], at: number): string | undefined {
  const indent = (l: string) => l.length - l.trimStart().length
  const own = indent(fileLines[at - 1] ?? '')
  for (let i = at - 2; i >= 0; i -= 1) {
    const line = fileLines[i]!
    if (manifest === 'Cargo.toml') {
      const header = CARGO_SECTION.exec(line)
      if (header !== null) return header[1]!.replace(/\s+/g, '')
    } else if (indent(line) < own) {
      return /^\s*"([^"]+)"\s*:\s*\{/.exec(line)?.[1] ?? ''
    }
  }
  return undefined
}

function isDependencySection(manifest: string, section: string): boolean {
  return manifest === 'Cargo.toml'
    ? CARGO_DEPENDENCY_TABLE.test(section)
    : PACKAGE_JSON_SECTIONS.has(section)
}

/** `name = "1.0"` or `name = { … }` in Cargo.toml: the name, and the version or the whole table. */
const CARGO_ANY_ENTRY = /^\s*([A-Za-z0-9_-]+)\s*=\s*("([^"]*)"|\{.*\})\s*$/

/**
 * Dependency entries on one side of a manifest diff. With the side's text,
 * a line counts when it sits in a dependency section, whatever its value
 * (`latest`, a URL, `{ workspace = true }`). Without the text (a PR diff whose
 * commits are not here) a line counts by the look of its key and value.
 */
function dependencyEntries(
  manifest: string,
  lines: readonly DiffLine[],
  text: string | null,
): DependencyEntry[] {
  const fileLines = text === null ? null : splitLines(text)
  const out: DependencyEntry[] = []
  for (const line of lines) {
    const section = fileLines === null ? undefined : sectionAt(manifest, fileLines, line.at)
    const entry =
      section === undefined
        ? guessedEntry(manifest, line.text)
        : sectionEntry(manifest, section, line.text)
    if (entry !== null) out.push(entry)
  }
  return out
}

/** A dependency line's name and version, read alike in and out of a known section. */
interface ParsedEntry {
  name: string
  /** Undefined for a Cargo table with no `version` key. */
  version: string | undefined
  /** The value as written: a version, or a whole inline table. */
  value: string
}

function parseEntry(manifest: string, line: string): ParsedEntry | null {
  if (manifest === 'package.json') {
    const m = PACKAGE_JSON_ENTRY.exec(line)
    return m === null ? null : { name: m[1]!, version: m[2]!, value: m[2]! }
  }
  const m = CARGO_ANY_ENTRY.exec(line)
  if (m === null) return null
  return { name: m[1]!, version: m[3] ?? CARGO_VERSION.exec(m[2]!)?.[1], value: m[2]! }
}

function sectionEntry(manifest: string, section: string, line: string): DependencyEntry | null {
  if (!isDependencySection(manifest, section)) {
    // `[dependencies.serde]` with `version = "1"` names the dependency in its header.
    const table = /\.([^.]+)$/.exec(section)
    const m = CARGO_VERSION.exec(line)
    const parent = table === null ? '' : section.slice(0, -table[0].length)
    return manifest === 'Cargo.toml' && m !== null && isDependencySection(manifest, parent)
      ? { name: table![1]!, version: m[1]! }
      : null
  }
  const e = parseEntry(manifest, line)
  return e === null ? null : { name: e.name, version: e.version ?? e.value.replace(/\s+/g, ' ') }
}

function guessedEntry(manifest: string, line: string): DependencyEntry | null {
  const e = parseEntry(manifest, line)
  const version = e?.version ?? ''
  const notDependency =
    manifest === 'package.json' ? PACKAGE_JSON_NOT_DEPENDENCY : CARGO_NOT_DEPENDENCY
  if (e === null || !VERSIONISH.test(version) || notDependency.has(e.name)) return null
  return { name: e.name, version }
}

/** The text of each side of a file, when it could be read. */
export interface FileSides {
  before: string | null
  after: string | null
}

/**
 * Dependencies added, removed and bumped in a `package.json` or `Cargo.toml`;
 * null for other files and for entries that only moved or were re-indented.
 *
 * @experimental
 */
export function dependencyChange(
  f: FileDiff,
  sides: FileSides = { before: null, after: null },
): DependencyChange | null {
  const manifest = basename(f.path)
  if (manifest !== 'package.json' && manifest !== 'Cargo.toml') return null
  const added = dependencyEntries(manifest, f.added, sides.after)
  const removed = dependencyEntries(manifest, f.removed, sides.before)
  const before = new Map(removed.map((e) => [e.name, e.version]))
  const after = new Map(added.map((e) => [e.name, e.version]))
  const change: DependencyChange = { file: f.path, added: [], removed: [], bumped: [] }
  for (const e of added) {
    const from = before.get(e.name)
    if (from === undefined) change.added.push(e)
    else if (from !== e.version) change.bumped.push({ name: e.name, from, to: e.version })
  }
  for (const e of removed) if (!after.has(e.name)) change.removed.push(e)
  return change.added.length + change.removed.length + change.bumped.length === 0 ? null : change
}

const WORD = /[\p{L}\p{N}_$]/u
const OPERATOR = /[-+*/%<>=!&|^~?:.]/
/** Punctuation a CSS space may follow, and precede, without being a combinator. */
const CSS_LOOSE_BEFORE = /[{};,>~(:]/
const CSS_LOOSE_AFTER = /[{};,>~)]/
const WHITESPACE = /[ \t]/g

/**
 * Whether the run of whitespace at `text[start, end)` may go without changing
 * meaning. Whitespace after a backslash never may: it is escaped, or it keeps
 * the line from going on. In `markup`, the spaces beside a tag are text.
 */
function insignificant(
  rule: InsignificantWhitespace | null,
  markup: boolean,
  text: string,
  start: number,
  end: number,
): boolean {
  const a = text[start - 1]
  const b = text[end]
  if (a === '\\') return false
  if (b === undefined) return true
  if (rule === null) return false
  if (a === undefined) return true
  if (markup && ((a === '>' && text[start - 2] !== '=') || b === '<')) return false
  if ((WORD.test(a) && WORD.test(b)) || (OPERATOR.test(a) && OPERATOR.test(b))) return false
  return rule === 'between-tokens' || CSS_LOOSE_BEFORE.test(a) || CSS_LOOSE_AFTER.test(b)
}

/**
 * Whether `line` is one of the language's
 * {@link Language.significantWhitespaceLines}, or a `#!` line, which the
 * system reads, not the language: either way only its trailing whitespace
 * may go.
 */
function rigid(language: Language, line: DiffLine): boolean {
  return (
    (line.at === 1 && isShebang(lexedText(line))) ||
    language.significantWhitespaceLines.some((r) => r.test(line.text))
  )
}

/** `text` without the whitespace outside strings and literals that `rule` lets go. */
function squeezed(
  rule: InsignificantWhitespace | null,
  markup: boolean,
  text: string,
  facts: LineFacts,
): string {
  let out = ''
  let from = 0
  for (const [start, end] of facts.spaces ?? []) {
    if (!insignificant(rule, markup, text, start, end)) continue
    out += text.slice(from, start)
    from = end
  }
  return out + text.slice(from)
}

/** A changed line's text as the lexer reads it: line 1 without a byte-order mark. */
function lexedText(l: DiffLine): string {
  return l.at === 1 ? stripBom(l.text) : l.text
}

/**
 * The lexer's facts for one side's changed lines, block by block: read in
 * the side's whole file when given, so that a line inside a string or comment
 * opened above it reads as one; else in each block alone. Null when, read
 * alone, a line leaves a string open: it may as well close one opened above it.
 */
function sideFacts(
  language: Language,
  blocks: readonly (readonly DiffLine[])[],
  fileLines: readonly string[] | null,
): LineFacts[][] | null {
  if (fileLines !== null) {
    const lexed = lexLines(language, fileLines, { spaces: true })
    return blocks.map((b) => b.map((l) => lexed[l.at - 1]!))
  }
  const alone = blocks.map((b) => lexLines(language, [...b.map(lexedText), ''], { spaces: true }))
  if (alone.some((facts) => facts.slice(1).some((f) => f.startsInString))) return null
  return alone.map((facts) => facts.slice(0, -1))
}

/** A line without its trailing whitespace, unless a backslash escapes it. */
function withoutTrailing(text: string): string {
  return text.replace(/(?<![\\ \t])[ \t]+$/, '')
}

/** A JSX closing tag's `</`, or a self-closing `/>`. */
const JSX_TAG = /<\/|\/>/

/**
 * Every block pairs removed and added lines one to one, differing only in
 * whitespace that may go. Where it may go is the language's
 * {@link Language.insignificantWhitespace}, read with the lexer over both
 * sides' whole files. Only trailing whitespace may go when the language is
 * unknown, and when a side's text is missing or does not match the diff: a
 * block read alone can't tell a line inside a multi-line string from code.
 */
function isFormattingOnly(f: FileDiff, facts: ChangeFacts): boolean {
  const language = facts.language === null ? null : languageNamed(facts.language)
  if (f.blocks.length === 0) return false
  const bare = (l: DiffLine) => l.text.replace(WHITESPACE, '')
  const paired = f.blocks.every(
    (b) =>
      b.added.length === b.removed.length &&
      b.added.length > 0 &&
      b.added.every((line, i) => {
        const was = b.removed[i]!
        // A CR is not whitespace a formatter may drop where the language is unknown.
        if ((language?.significantLineEndings ?? true) && line.cr !== was.cr) return false
        return bare(line) === bare(was)
      }),
  )
  if (!paired) return false
  if (language === null) {
    return f.blocks.every((b) =>
      b.added.every(
        (line, i) => withoutTrailing(line.text) === withoutTrailing(b.removed[i]!.text),
      ),
    )
  }
  const removed = f.blocks.map((b) => b.removed)
  const added = f.blocks.map((b) => b.added)
  const beforeLines = facts.before == null ? null : splitLines(facts.before)
  const afterLines = facts.after == null ? null : splitLines(facts.after)
  const matching = (lines: string[] | null, blocks: readonly (readonly DiffLine[])[]) =>
    lines !== null && blocks.every((b) => linesMatch(lines, b)) ? lines : null
  const beforeWhole = matching(beforeLines, removed)
  const afterWhole = matching(afterLines, added)
  const whole = beforeWhole !== null && afterWhole !== null
  const before = sideFacts(language, removed, beforeWhole)
  const after = sideFacts(language, added, afterWhole)
  if (before === null || after === null) return false
  const path = f.path.toLowerCase()
  const markup =
    whole &&
    language.markupExtensions.some((e) => path.endsWith(`.${e}`)) &&
    (JSX_TAG.test(facts.before!) || JSX_TAG.test(facts.after!))
  return f.blocks.every((b, k) =>
    b.added.every((line, i) => {
      const was = b.removed[i]!
      const rule =
        !whole || rigid(language, line) || rigid(language, was)
          ? null
          : language.insignificantWhitespace
      return (
        squeezed(rule, markup, lexedText(line), after[k]![i]!) ===
        squeezed(rule, markup, lexedText(was), before[k]![i]!)
      )
    }),
  )
}

/**
 * What a file's category is decided from, besides its diff. With each side's
 * text, a formatting change is judged knowing which lines lie inside a string
 * or comment opened above them.
 */
export interface ChangeFacts extends Partial<FileSides> {
  group: FileGroup
  /** The file's language name, as the scanner registry reports it; null when unknown. */
  language: string | null
  /** The changed lines' kinds, both sides. */
  added: readonly ContentKind[]
  removed: readonly ContentKind[]
  dependencies: DependencyChange | null
}

/**
 * The one {@link ChangeCategory} a file's change falls in, first match winning in the order of
 * {@link CHANGE_CATEGORIES}.
 *
 * @experimental
 */
export function categorizeChange(f: FileDiff, facts: ChangeFacts): ChangeCategory {
  const { group } = facts
  if (isUnreviewed(group)) return group
  if (f.binary || f.entry !== 'file') return 'non-text'
  if (f.status === 'deleted') return 'deleted'
  if (f.status === 'added') return 'added'
  if (f.status === 'renamed') return 'renamed'
  if (facts.dependencies !== null) return 'dependencies'
  if (group === 'instructions' || group === 'docs' || group === 'tests') return group
  const changed = f.added.length + f.removed.length > 0
  if (!changed) return 'mode'
  const only = (allowed: readonly ContentKind[]) =>
    [...facts.added, ...facts.removed].every((k) => allowed.includes(k))
  if (isFormattingOnly(f, facts) || only(['blank'])) return 'formatting'
  if (group === 'other') return 'config'
  if (only(['comment', 'doc', 'blank'])) return 'comments'
  if (only(['boilerplate', 'blank'])) return 'boilerplate'
  return 'logic'
}
