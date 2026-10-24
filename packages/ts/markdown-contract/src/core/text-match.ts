/**
 * Text matching and the `text/*` findings. Every text check uses this module. It does three
 * things:
 *
 *   1. {@link matchText}: `(text, spec) → { count, positions }`. It matches a literal `pattern`
 *      or a `regex`, counts every occurrence, and gives each hit's 1-based line and column in
 *      `text`. With `normalize` (default true) a phrase split across a wrapped line still
 *      matches. `normalize: false` matches the exact text. `ignoreCase` ignores case. Inline code
 *      and code blocks are matched too. Text checks do not skip code on purpose.
 *   2. {@link buildTextFindings}: turns a match result and the entry's `min` and `max` into
 *      findings. `text/requires` is a miss, placed on the scope's heading or on the document.
 *      `text/forbids` is a hit, placed on its line. `text/count` reads "found N times,
 *      expected …". Each message ends with the spec's `note`.
 *   3. {@link synthesizeTextId}: the id of an entry, `text/<kind>/<scopeKey>/<patternHash>`. The
 *      hash comes from the pattern, not the entry's position, so reordering entries keeps the
 *      ids. An entry's explicit `id` is used when set.
 *
 * The builders (`requires`, `forbids`, `textRule`) and the choice of scope text are in
 * `text-constraints.ts`. Nothing here knows about a `DocTree`, a section or YAML.
 */
import type { Ctx, Finding, FindingLevel, SourcePos } from './types.js'

// ── The match spec & result ──────────────────────────────────────────────────────────

/**
 * One text check. Exactly one of `pattern` (a literal substring) or `regex` (a regular expression
 * source) gives the text to find. `min` and `max` bound the count. `requires` defaults to
 * `min: 1` with no `max`. `forbids` defaults to `max: 0`. `id` keeps the finding id fixed when
 * the pattern changes. `note` is added to the message. `level` overrides the default level.
 */
export interface TextMatchSpec {
  /** The literal substring to find. One of `pattern` or `regex` is required. */
  pattern?: string
  /** A regular expression source to find, instead of `pattern`. */
  regex?: string
  /** Treat any run of whitespace in `pattern` as matching any run, so wrapped lines match. Default true. */
  normalize?: boolean
  /** Ignore case. Default false. */
  ignoreCase?: boolean
  /** The fewest occurrences. */
  min?: number
  /** The most occurrences. */
  max?: number
  /** A finding id to use instead of the generated one. It stays the same when the pattern changes. */
  id?: string
  /** The reason for the check, added to the finding message. */
  note?: string
  /** The finding level, `error` or `warn`. Overrides the default level. */
  level?: Extract<FindingLevel, 'error' | 'warn'>
}

/** The result of {@link matchText}: the number of hits and where each starts. */
export interface TextMatchResult {
  count: number
  /** One entry per hit, in order: the 1-based line and column where the match starts. */
  positions: SourcePos[]
}

/** The kind of a text check: presence (`requires`) or absence (`forbids`). */
export type TextKind = 'requires' | 'forbids'

/**
 * The kind part of a text finding id. `requires` and `forbids` are the presence and absence
 * findings. `count` means a `min` or `max` was not met.
 */
export type TextFindingKind = 'requires' | 'forbids' | 'count'

// ── The matcher ─────────────────────────────────────────────────────────────────

/** Escapes every regex special character in a literal so it matches itself. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Turns a literal pattern into a regex source in which each run of whitespace matches any run of
 * whitespace. So a phrase wrapped across lines still matches. Leading and trailing whitespace is
 * dropped. Each word is escaped.
 */
function normalizedPatternSource(pattern: string): string {
  const trimmed = pattern.trim()
  if (trimmed === '') return ''
  return trimmed.split(/\s+/).map(escapeRegex).join('\\s+')
}

/**
 * A function that maps a 0-based character offset in `text` to a 1-based { line, col } source
 * position. Offsets must not decrease between calls: it scans forward from the last one.
 */
function positionMapper(text: string): (offset: number) => SourcePos {
  let line = 1
  let lastNewline = -1
  let scanned = 0
  return (offset) => {
    for (; scanned < offset; scanned++) {
      if (text[scanned] === '\n') {
        line++
        lastNewline = scanned
      }
    }
    return { line, col: offset - lastNewline }
  }
}

/**
 * Matches a spec against `text` and returns the number of hits and where each starts. A literal
 * `pattern` is matched with `normalize` (default true, any whitespace run matches) or exactly
 * (`normalize: false`). A `regex` is used as given. `ignoreCase` applies to both. Code is
 * matched too. Throws when the spec has neither `pattern` nor `regex`.
 */
export function matchText(text: string, spec: TextMatchSpec): TextMatchResult {
  let source: string
  if (spec.regex !== undefined) {
    source = spec.regex
  } else if (spec.pattern !== undefined) {
    const normalize = spec.normalize ?? true
    source = normalize ? normalizedPatternSource(spec.pattern) : escapeRegex(spec.pattern)
  } else {
    throw new Error('matchText: a spec must supply one of `pattern` or `regex`')
  }
  // An empty pattern never matches. Otherwise it would match at every position.
  if (source === '') return { count: 0, positions: [] }

  const flags = spec.ignoreCase ? 'gi' : 'g'
  const re = new RegExp(source, flags)
  const positions: SourcePos[] = []
  const posAt = positionMapper(text)
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    positions.push(posAt(m.index))
    // A regex that can match the empty string would otherwise loop forever.
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return { count: positions.length, positions }
}

// ── Finding ids ──────────────────────────────────────────────────────

/** A short, stable hash (FNV-1a, in base 36). It needs no crypto module. */
function shortHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * The text the generated id hashes. It holds the search text (the normalized literal, or the
 * regex source) and the flags that change what matches (`normalize`, `ignoreCase`). So two
 * different checks get different ids, and one check keeps its id when entries are reordered.
 * `min` and `max` are left out on purpose. They change the message, not which text the check is
 * about.
 */
function patternKey(spec: TextMatchSpec): string {
  const fold = spec.ignoreCase ? 'i' : ''
  if (spec.regex !== undefined) return `regex|${spec.regex}|${fold}`
  const normalize = spec.normalize ?? true
  const needle = normalize ? (spec.pattern ?? '').trim().replace(/\s+/g, ' ') : (spec.pattern ?? '')
  return `pattern|${normalize ? 'n' : 'x'}|${needle}|${fold}`
}

/**
 * The finding id for one text check: `text/<kind>/<scopeKey>/<patternHash>`, where
 * `patternHash` is a short hash of the pattern and its match flags. Reordering entries does not
 * change it, and it differs between scopes. It changes when the section is renamed (`scopeKey`)
 * or the pattern or its flags change. An entry with an explicit `id` gets that id back.
 */
export function synthesizeTextId(
  kind: TextFindingKind,
  scopeKey: string,
  spec: TextMatchSpec,
): string {
  if (spec.id !== undefined) return spec.id
  return `text/${kind}/${scopeKey}/${shortHash(patternKey(spec))}`
}

// ── Building findings ──────────────────────────────────────────────────────────────

/** The search text for a finding message: `"literal"` for a pattern, `/source/` for a regex. */
function specRepr(spec: TextMatchSpec): string {
  if (spec.regex !== undefined) return `/${spec.regex}/`
  return `"${spec.pattern ?? ''}"`
}

/** The scope's name for messages. `doc` reads as `document`. */
function scopeLabel(scopeKey: string, scope: string | undefined): string {
  if (scope !== undefined) return scope
  return scopeKey === 'doc' ? 'document' : scopeKey
}

/** The `min` and `max` to check, with the kind's defaults applied. */
function boundsFor(kind: TextKind, spec: TextMatchSpec): { min: number; max: number | undefined } {
  if (kind === 'requires') return { min: spec.min ?? 1, max: spec.max }
  return { min: spec.min ?? 0, max: spec.max ?? 0 }
}

/** The input to {@link buildTextFindings}: one entry's match result and its scope. */
export interface TextFindingInput {
  /** Presence (`requires`) or absence (`forbids`). */
  kind: TextKind
  /** The entry's spec. */
  spec: TextMatchSpec
  /** The result of {@link matchText} for this entry over the scope's text. */
  match: TextMatchResult
  /** The scope's key, used in the id (`doc` for the whole document). */
  scopeKey: string
  /** The scope's name in messages. Defaults from `scopeKey` (`doc` → `document`). */
  scope?: string
  /** The scope's heading position, for a `requires` miss or a `count` finding. Omit for the whole document. */
  scopePos?: SourcePos
  /** Makes the findings. It sets `path` and the default `level`. */
  ctx: Ctx
}

/**
 * Turns one entry's match result into findings:
 *
 *   - `requires` with no hit (`min: 1`): one `text/requires`, "required phrase … not found in …",
 *     at `scopePos` (the section heading), or with no position when `scopePos` is omitted.
 *   - `forbids` with hits (`max: 0`): one `text/forbids`, "forbidden phrase … present", for each
 *     hit, on that hit's line.
 *   - Any other `min` or `max` not met: one `text/count`, "… found N times, expected …", at
 *     `scopePos`.
 *
 * Each message ends with the spec's `note`. The level is the spec's `level` when set, else the
 * default (`error`) from `ctx.finding`. An entry that passes gives no findings.
 */
export function buildTextFindings(input: TextFindingInput): Finding[] {
  const { kind, spec } = input
  const { min, max } = boundsFor(kind, spec)
  const derived: DerivedTextFinding = {
    ...input,
    min,
    max,
    repr: specRepr(spec),
    note: spec.note ? ` — ${spec.note}` : '',
  }
  return kind === 'requires' ? requiresFindings(derived) : forbidsFindings(derived)
}

/** {@link TextFindingInput} plus the bounds and message parts both kinds use. */
interface DerivedTextFinding extends TextFindingInput {
  min: number
  max: number | undefined
  repr: string
  note: string
}

/** The spec's `level` as an object to spread, or `{}` when it is not set. */
function levelOf(spec: TextMatchSpec): { level?: 'error' | 'warn' } {
  return spec.level === undefined ? {} : { level: spec.level }
}

/** A position as an object to spread, or `{}` when there is none. */
function posOf(pos: SourcePos | undefined): { pos?: SourcePos } {
  return pos === undefined ? {} : { pos }
}

/** A `text/count` finding (`… found N times, expected …`), at the scope heading. */
function countFinding(d: DerivedTextFinding, expected: string): Finding {
  return d.ctx.finding({
    id: synthesizeTextId('count', d.scopeKey, d.spec),
    ...levelOf(d.spec),
    message: `${d.repr} found ${d.match.count} times, expected ${expected}${d.note}`,
    ...posOf(d.scopePos),
  })
}

/** The `requires` findings: `text/requires` for a miss with `min: 1`, else `text/count`. */
function requiresFindings(d: DerivedTextFinding): Finding[] {
  const count = d.match.count
  if (count < d.min) {
    if (d.min === 1) {
      return [
        d.ctx.finding({
          id: synthesizeTextId('requires', d.scopeKey, d.spec),
          ...levelOf(d.spec),
          message: `required phrase ${d.repr} not found in ${scopeLabel(d.scopeKey, d.scope)}${d.note}`,
          ...posOf(d.scopePos),
        }),
      ]
    }
    return [countFinding(d, `at least ${d.min}`)]
  }
  if (d.max !== undefined && count > d.max) {
    return [countFinding(d, `at most ${d.max}`)]
  }
  return []
}

/** The `forbids` findings: one `text/forbids` per hit when `max` is 0, else `text/count`. */
function forbidsFindings(d: DerivedTextFinding): Finding[] {
  const max = d.max ?? 0
  if (d.match.count <= max) return []
  if (max === 0) {
    return d.match.positions.map((pos) =>
      d.ctx.finding({
        id: synthesizeTextId('forbids', d.scopeKey, d.spec),
        ...levelOf(d.spec),
        message: `forbidden phrase ${d.repr} present${d.note}`,
        pos,
      }),
    )
  }
  return [countFinding(d, `at most ${max}`)]
}
