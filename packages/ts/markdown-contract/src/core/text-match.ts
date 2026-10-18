/**
 * The text-match predicate core and the `text/*` finding area.
 *
 * This is the runtime foundation every declarative text constraint emits through. It has
 * three responsibilities, all facets of one feature — matching a literal/regex over a bound
 * scope's rendered text and turning the result into findings:
 *
 *   1. {@link matchText} — a pure matcher: `(text, spec) → { count, positions }`. It matches a
 *      literal `pattern` or a `regex`, counts every occurrence, and pins each hit's source
 *      position (1-based line / col within `text`). `normalize` (default true) lets a phrase
 *      split across a wrapped line still match; `normalize: false` is exact bytes; `ignoreCase`
 *      folds case. It matches the raw text INCLUDING inline code spans and fenced blocks — text
 *      constraints deliberately do not skip code.
 *   2. {@link buildTextFindings} — maps a match result + the entry's `min` / `max` bound to
 *      `text/requires` (a miss, positioned at the scope's heading / document level),
 *      `text/forbids` (a hit, positioned at the offending line), and `text/count`
 *      (`found N times, expected …`) findings — each with the spec's `note` appended.
 *   3. {@link synthesizeTextId} — the stable per-entry id: `text/<kind>/<scopeKey>/<patternHash>`,
 *      a short hash of the normalized pattern (NOT index-based, so it survives entry reordering);
 *      returns the entry's explicit `id` when set.
 *
 * This module is the matcher and finding plumbing only. The combinator builders
 * (`requires` / `forbids` / `textRule`), scope binding and the YAML surface are downstream.
 * Nothing here knows about a `DocTree`, a section or YAML.
 */
import type { Ctx, Finding, FindingLevel, SourcePos } from './types.js'

// ── The match spec & result ──────────────────────────────────────────────────────────

/**
 * One match spec — the closed text-match vocabulary. Exactly one of
 * `pattern` (a literal substring) or `regex` (a regular-expression source) supplies the needle.
 * `min` / `max` are the count bound the finding-builder reads (`requires` defaults `min: 1`,
 * unbounded `max`; `forbids` defaults `max: 0`). `id` pins the finding identity across pattern
 * edits; `note` is appended to the message; `level` overrides the registry default.
 */
export interface TextMatchSpec {
  /** the literal substring to find (one of `pattern` / `regex` is required) */
  pattern?: string
  /** a regular-expression source to find (alternative to `pattern`) */
  regex?: string
  /** collapse runs of whitespace before matching, so prose line-wrapping is tolerated (default true) */
  normalize?: boolean
  /** case-insensitive match (default false) */
  ignoreCase?: boolean
  /** minimum occurrences */
  min?: number
  /** maximum occurrences */
  max?: number
  /** an explicit, author-supplied finding id — pins identity across pattern edits */
  id?: string
  /** author rationale, appended to the finding message */
  note?: string
  /** finding severity, `error` or `warn`; overrides the default level */
  level?: Extract<FindingLevel, 'error' | 'warn'>
}

/** The result of {@link matchText} — the occurrence count and each hit's source position. */
export interface TextMatchResult {
  count: number
  /** one entry per hit, in document order; each is the 1-based line / col of the match start */
  positions: SourcePos[]
}

/** The entry kind a text constraint is authored as — presence (`requires`) or absence (`forbids`). */
export type TextKind = 'requires' | 'forbids'

/**
 * The finding-id discriminator. `requires` / `forbids` are the pure presence / absence findings;
 * `count` is a `min` / `max` bound violation (a shortfall or an overflow).
 */
export type TextFindingKind = 'requires' | 'forbids' | 'count'

// ── The pure matcher ─────────────────────────────────────────────────────────────────

/** Escape every regex metacharacter in a literal so it matches itself. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Turn a literal pattern into a regex source whose internal whitespace runs match any run of
 * whitespace — so a phrase wrapped across a line (a newline + indentation between words) still
 * matches. Leading / trailing whitespace is dropped; each word is escaped literally.
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
 * Match a spec against `text`, returning the occurrence count and each hit's source position.
 * A literal `pattern` is matched with `normalize` (default true → whitespace-run flexible) or
 * exactly (`normalize: false`); a `regex` is matched as given. `ignoreCase` folds case in both.
 * Matching is over the raw text including code spans and fenced blocks. Throws when
 * the spec supplies neither `pattern` nor `regex`.
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
  // An empty needle never matches (avoids a zero-width regex looping over every position).
  if (source === '') return { count: 0, positions: [] }

  const flags = spec.ignoreCase ? 'gi' : 'g'
  const re = new RegExp(source, flags)
  const positions: SourcePos[] = []
  const posAt = positionMapper(text)
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    positions.push(posAt(m.index))
    // Guard against a zero-width match (e.g. a `regex` that can match empty) looping forever.
    if (m.index === re.lastIndex) re.lastIndex++
  }
  return { count: positions.length, positions }
}

// ── Stable finding-id synthesis ──────────────────────────────────────────────────────

/** A short, stable, deterministic hash (FNV-1a → base36). No crypto dep; pure. */
function shortHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * The canonical identity of a spec's *matcher* — what the synthesized id hashes over. It folds in
 * the needle (the normalized literal, or the regex source) and the flags that change what matches
 * (`normalize`, `ignoreCase`), so two genuinely different checks get different ids while the same
 * check is stable across reordering. The count bound (`min` / `max`) is deliberately NOT part of
 * the key — it changes the finding *message*, not which text the entry is about.
 */
function patternKey(spec: TextMatchSpec): string {
  const fold = spec.ignoreCase ? 'i' : ''
  if (spec.regex !== undefined) return `regex|${spec.regex}|${fold}`
  const normalize = spec.normalize ?? true
  const needle = normalize ? (spec.pattern ?? '').trim().replace(/\s+/g, ' ') : (spec.pattern ?? '')
  return `pattern|${normalize ? 'n' : 'x'}|${needle}|${fold}`
}

/**
 * The stable finding id for one text-constraint entry: `text/<kind>/<scopeKey>/<patternHash>`,
 * where `patternHash` is a short hash of the spec's normalized pattern. It is stable across entry
 * REORDERING (not index-based) and unique across scopes; it changes only when the section is
 * renamed (`scopeKey`) or the pattern is edited. An entry that sets an explicit `id` gets exactly
 * that id back (pinning identity across pattern edits).
 */
export function synthesizeTextId(
  kind: TextFindingKind,
  scopeKey: string,
  spec: TextMatchSpec,
): string {
  if (spec.id !== undefined) return spec.id
  return `text/${kind}/${scopeKey}/${shortHash(patternKey(spec))}`
}

// ── The finding-builder ──────────────────────────────────────────────────────────────

/** The needle as it reads in a finding message — `"literal"` for a pattern, `/source/` for a regex. */
function specRepr(spec: TextMatchSpec): string {
  if (spec.regex !== undefined) return `/${spec.regex}/`
  return `"${spec.pattern ?? ''}"`
}

/** A human label for the scope a finding fires in — `doc` renders as `document`. */
function scopeLabel(scopeKey: string, scope: string | undefined): string {
  if (scope !== undefined) return scope
  return scopeKey === 'doc' ? 'document' : scopeKey
}

/** The count bound the builder evaluates against, with the kind's defaults applied. */
function boundsFor(kind: TextKind, spec: TextMatchSpec): { min: number; max: number | undefined } {
  if (kind === 'requires') return { min: spec.min ?? 1, max: spec.max }
  return { min: spec.min ?? 0, max: spec.max ?? 0 }
}

/** The inputs to {@link buildTextFindings} — one entry's match result plus its scope. */
export interface TextFindingInput {
  /** the entry kind — presence (`requires`) or absence (`forbids`) */
  kind: TextKind
  /** the spec the entry matched */
  spec: TextMatchSpec
  /** the result of {@link matchText} for this entry over the bound scope's text */
  match: TextMatchResult
  /** the scope's stable key, for id synthesis (`doc` for the whole document) */
  scopeKey: string
  /** a human label for the scope in messages; defaults from `scopeKey` (`doc` → `document`) */
  scope?: string
  /** the scope's heading position — a `requires` miss / `count` violation pins here; omit ⇒ document-level */
  scopePos?: SourcePos
  /** the registry-backed finding factory (stamps `path`, fills the default `level`) */
  ctx: Ctx
}

/**
 * Turn one entry's match result into its findings:
 *
 *   - `requires` with no hit (`min: 1`) → one `text/requires` "required phrase … not found in …",
 *     positioned at `scopePos` (the section heading) or document-level when `scopePos` is omitted.
 *   - `forbids` with hits (`max: 0`) → one `text/forbids` "forbidden phrase … present" PER hit,
 *     each positioned at the offending match's line.
 *   - a `min` / `max` bound violation (a `requires` shortfall, or any `max` overflow) → one
 *     `text/count` "… found N times, expected …", positioned at `scopePos`.
 *
 * Each message gets the spec's `note` appended. `level` rides from the spec when set, else the
 * registry default (`error`) via `ctx.finding`. A satisfied entry yields no findings.
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

/** {@link TextFindingInput} plus the bound / message pieces both branches share. */
interface DerivedTextFinding extends TextFindingInput {
  min: number
  max: number | undefined
  repr: string
  note: string
}

/** The spec's `level`, as a key to spread; absent when the spec leaves the default. */
function levelOf(spec: TextMatchSpec): { level?: 'error' | 'warn' } {
  return spec.level === undefined ? {} : { level: spec.level }
}

/** A position, as a key to spread; absent when there is none. */
function posOf(pos: SourcePos | undefined): { pos?: SourcePos } {
  return pos === undefined ? {} : { pos }
}

/** A `text/count` finding (`… found N times, expected …`), pinned at the scope heading. */
function countFinding(d: DerivedTextFinding, expected: string): Finding {
  return d.ctx.finding({
    id: synthesizeTextId('count', d.scopeKey, d.spec),
    ...levelOf(d.spec),
    message: `${d.repr} found ${d.match.count} times, expected ${expected}${d.note}`,
    ...posOf(d.scopePos),
  })
}

/** The `requires` findings: a `text/requires` miss (`min: 1`), else a `text/count` bound violation. */
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

/** The `forbids` findings: a `text/forbids` per hit (`max: 0`), else a `text/count` overflow. */
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
