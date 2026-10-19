/**
 * Intersect L0 — per-segment glob automaton.
 *
 * Compiles a single glob segment (`*`, `?`, `[...]` classes incl. negated
 * `[!...]`, `{a,b}` alternation) into a character-level NFA, and answers the
 * primitive question the sequence product needs: do two segment matchers share
 * a common concrete string, and if so what is one such string
 * ({@link commonSegment})?
 *
 * `*` is a run of characters (zero or more); `?` is exactly one; `{a,b}` is NFA
 * alternation — never eager string expansion. `Options` (`caseInsensitive`,
 * `dot`) apply at this character level: a leading-dot input is matchable only by
 * a branch that BEGINS WITH A LITERAL DOT TOKEN (or has `dot` set) — carried per
 * edge ({@link CharEdge.dotAtStart}) and enforced at position 0 of the product,
 * so it survives a zero-width `*` without letting one `{...}` branch decide the
 * question for its siblings.
 *
 * Zero runtime dependencies — standard library only.
 */
import type { Options } from './index.ts'

/** One inclusive character range, e.g. `a-z` → `{ lo: "a", hi: "z" }`. */
interface ClassRange {
  readonly lo: string
  readonly hi: string
}

/**
 * A predicate over a single input character on an NFA edge.
 * - `any`: any character (`*`/`?`), optionally excluding a leading `.`.
 * - `lit`: exactly the character `ch` (a leading `.` is always allowed here).
 * - `class`: a `[...]` set, possibly `negated`, optionally excluding `.`.
 */
type CharPred =
  | { readonly kind: 'any'; readonly excludeDot: boolean }
  | { readonly kind: 'lit'; readonly ch: string }
  | {
      readonly kind: 'class'
      readonly negated: boolean
      readonly ranges: readonly ClassRange[]
      readonly excludeDot: boolean
    }

/**
 * A character NFA edge that consumes one input character satisfying `pred`.
 *
 * `dotAtStart` answers, for THIS edge: if it fires as the segment's first
 * character, may that character be a `.`? True only for a literal token that
 * begins its branch (or under `dot`) — the standard glob leading-dot rule. It is
 * per-edge, not per-segment, so a `{.x,*.env}` branch that begins with a literal
 * dot does not unlock dotfiles for the sibling branch that begins with `*`.
 */
interface CharEdge {
  readonly pred: CharPred
  readonly to: number
  readonly dotAtStart: boolean
}

/**
 * A compiled single-segment glob as a character NFA. States are indices;
 * `epsOut`/`charOut` are per-state adjacency; `start`/`accept` are single
 * states (concatenation and alternation funnel into one accept).
 *
 * The leading-dot rule rides on the edges ({@link CharEdge.dotAtStart}), because
 * it must survive a zero-width `*` — the rule is about the first *emitted*
 * character (position 0), which a zero-width `*` can hand off to a following
 * literal — while still being decided branch by branch. {@link commonSegment}
 * enforces it at the segment-start position.
 */
export interface SegmentMatcher {
  readonly epsOut: number[][]
  readonly charOut: CharEdge[][]
  readonly start: number
  readonly accept: number
}

// --- Tokenizer -------------------------------------------------------------

type Token =
  | { readonly t: 'lit'; readonly ch: string }
  | { readonly t: 'star' }
  | { readonly t: 'any' }
  | { readonly t: 'class'; readonly negated: boolean; readonly ranges: ClassRange[] }
  | { readonly t: 'alt'; readonly alts: Token[][] }

/** Parse a glob segment into tokens. Unterminated `[`/`{` degrade to literals. */
function tokenize(glob: string): Token[] {
  const [tokens] = parseSeq(glob, 0, false)
  return tokens
}

/**
 * The whole character at index `i` — one code point, so an astral character
 * (two UTF-16 code units) stays a single token. `?` and `[...]` are specified in
 * characters, not code units.
 */
function charAt(s: string, i: number): string {
  return String.fromCodePoint(s.codePointAt(i)!)
}

/**
 * Parse a token sequence from `start`. When `insideBrace`, stop at a top-level
 * `,` or `}` (the delimiter is left for the caller). Returns the tokens and the
 * index of the stop character (or the string length).
 */
function parseSeq(s: string, start: number, insideBrace: boolean): [Token[], number] {
  const tokens: Token[] = []
  let i = start
  while (i < s.length) {
    const ch = charAt(s, i)
    if (insideBrace && (ch === ',' || ch === '}')) break
    if (ch === '*') {
      tokens.push({ t: 'star' })
      i++
    } else if (ch === '?') {
      tokens.push({ t: 'any' })
      i++
    } else if (ch === '\\') {
      // Escape: the next character is a literal.
      if (i + 1 < s.length) {
        const escaped = charAt(s, i + 1)
        tokens.push({ t: 'lit', ch: escaped })
        i += 1 + escaped.length
      } else {
        tokens.push({ t: 'lit', ch: '\\' })
        i++
      }
    } else if (ch === '[') {
      const parsed = parseClass(s, i)
      if (parsed) {
        tokens.push(parsed.token)
        i = parsed.next
      } else {
        tokens.push({ t: 'lit', ch: '[' })
        i++
      }
    } else if (ch === '{') {
      const parsed = parseAlt(s, i)
      if (parsed) {
        tokens.push(parsed.token)
        i = parsed.next
      } else {
        tokens.push({ t: 'lit', ch: '{' })
        i++
      }
    } else {
      tokens.push({ t: 'lit', ch })
      i += ch.length
    }
  }
  return [tokens, i]
}

/** Parse a `[...]` class starting at `i` (`s[i] === "["`), or `null` if unterminated. */
function parseClass(s: string, i: number): { token: Token; next: number } | null {
  let j = i + 1
  let negated = false
  if (s[j] === '!' || s[j] === '^') {
    negated = true
    j++
  }
  const ranges: ClassRange[] = []
  let first = true
  while (j < s.length) {
    const c = charAt(s, j)
    if (c === ']' && !first) {
      return { token: { t: 'class', negated, ranges }, next: j + 1 }
    }
    first = false
    const afterLo = j + c.length
    const hiAt = afterLo + 1
    if (s[afterLo] === '-' && hiAt < s.length && s[hiAt] !== ']') {
      const hi = charAt(s, hiAt)
      ranges.push({ lo: c, hi })
      j = hiAt + hi.length
    } else {
      ranges.push({ lo: c, hi: c })
      j = afterLo
    }
  }
  return null // no closing "]"
}

/** Parse a `{a,b,...}` alternation starting at `i` (`s[i] === "{"`), or `null` if unterminated. */
function parseAlt(s: string, i: number): { token: Token; next: number } | null {
  let j = i + 1
  const alts: Token[][] = []
  for (;;) {
    const [toks, next] = parseSeq(s, j, true)
    alts.push(toks)
    if (next >= s.length) return null // unterminated
    if (s[next] === ',') {
      j = next + 1
      continue
    }
    // s[next] === "}"
    return { token: { t: 'alt', alts }, next: next + 1 }
  }
}

// --- NFA construction ------------------------------------------------------

interface Frag {
  readonly start: number
  readonly accept: number
}

class NfaBuilder {
  readonly epsOut: number[][] = []
  readonly charOut: CharEdge[][] = []

  newState(): number {
    this.epsOut.push([])
    this.charOut.push([])
    return this.epsOut.length - 1
  }

  addEps(from: number, to: number): void {
    this.epsOut[from]!.push(to)
  }

  addChar(from: number, to: number, pred: CharPred, dotAtStart: boolean): void {
    this.charOut[from]!.push({ pred, to, dotAtStart })
  }
}

/**
 * Build the NFA fragment for a token sequence. `atStart` marks that the first
 * token sits at the segment start, where wildcards exclude a leading `.` when
 * `dot` is off.
 */
function buildFragment(b: NfaBuilder, tokens: Token[], atStart: boolean, dot: boolean): Frag {
  if (tokens.length === 0) {
    const s = b.newState()
    return { start: s, accept: s }
  }
  let cur: Frag | null = null
  tokens.forEach((tok, idx) => {
    const f = buildToken(b, tok, atStart && idx === 0, dot)
    if (cur === null) {
      cur = f
    } else {
      b.addEps(cur.accept, f.start)
      cur = { start: cur.start, accept: f.accept }
    }
  })
  return cur!
}

function buildToken(b: NfaBuilder, tok: Token, atStart: boolean, dot: boolean): Frag {
  const excludeDot = atStart && !dot
  // Position 0 of the segment accepts a `.` only from a literal token that
  // begins this branch (or with `dot` on). Recorded per edge so a sibling
  // `{...}` branch cannot answer for this one.
  const dotAtStart = dot || (tok.t === 'lit' && atStart)
  switch (tok.t) {
    case 'lit': {
      // A literal (including a literal `.`) always matches its character — this
      // is how `.env` matches a dotfile while `*` does not.
      const s = b.newState()
      const e = b.newState()
      b.addChar(s, e, { kind: 'lit', ch: tok.ch }, dotAtStart)
      return { start: s, accept: e }
    }
    case 'any': {
      const s = b.newState()
      const e = b.newState()
      b.addChar(s, e, { kind: 'any', excludeDot }, dotAtStart)
      return { start: s, accept: e }
    }
    case 'class': {
      const s = b.newState()
      const e = b.newState()
      const pred: CharPred = { kind: 'class', negated: tok.negated, ranges: tok.ranges, excludeDot }
      b.addChar(s, e, pred, dotAtStart)
      return { start: s, accept: e }
    }
    case 'star': {
      // Zero-or-more characters. `excludeDot` keeps a *directly* consumed first
      // character off a dot; the zero-width case — where the star consumes
      // nothing and a following literal would otherwise emit position 0 — is
      // covered by that literal's own `dotAtStart` being false.
      const s = b.newState()
      const e = b.newState()
      const p = b.newState()
      b.addEps(s, e) // zero characters
      b.addChar(s, p, { kind: 'any', excludeDot }, dotAtStart) // first character
      b.addChar(p, p, { kind: 'any', excludeDot: false }, dotAtStart) // subsequent characters
      b.addEps(p, e)
      return { start: s, accept: e }
    }
    case 'alt': {
      const s = b.newState()
      const e = b.newState()
      for (const altTokens of tok.alts) {
        // Each branch's first token is itself at the segment start.
        const f = buildFragment(b, altTokens, atStart, dot)
        b.addEps(s, f.start)
        b.addEps(f.accept, e)
      }
      return { start: s, accept: e }
    }
  }
}

/** Compile one glob segment (e.g. `"*.vue"`, `"handler.ts"`, `"[!a-z]"`) into a matcher. */
export function compileSegment(glob: string, opts: Options | undefined): SegmentMatcher {
  const b = new NfaBuilder()
  const dot = opts?.dot ?? false
  const tokens = tokenize(glob)
  const frag = buildFragment(b, tokens, true, dot)
  return {
    epsOut: b.epsOut,
    charOut: b.charOut,
    start: frag.start,
    accept: frag.accept,
  }
}

// --- Character-set intersection -------------------------------------------

const FALLBACK = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-'

function charEq(a: string, b: string, ci: boolean): boolean {
  return a === b || (ci && a.toLowerCase() === b.toLowerCase())
}

function swapCase(ch: string): string {
  const lower = ch.toLowerCase()
  return ch === lower ? ch.toUpperCase() : lower
}

function inRange(ch: string, lo: string, hi: string, ci: boolean): boolean {
  const cc = ch.codePointAt(0)!
  const l = lo.codePointAt(0)!
  const h = hi.codePointAt(0)!
  if (cc >= l && cc <= h) return true
  if (ci) {
    const alt = swapCase(ch)
    if (alt !== ch) {
      const ac = alt.codePointAt(0)!
      if (ac >= l && ac <= h) return true
    }
  }
  return false
}

function testChar(pred: CharPred, ch: string, ci: boolean): boolean {
  switch (pred.kind) {
    case 'any':
      return !(pred.excludeDot && ch === '.')
    case 'lit':
      return charEq(ch, pred.ch, ci)
    case 'class': {
      if (pred.excludeDot && ch === '.') return false
      let inSet = false
      for (const r of pred.ranges) {
        if (inRange(ch, r.lo, r.hi, ci)) {
          inSet = true
          break
        }
      }
      return pred.negated ? !inSet : inSet
    }
  }
}

/**
 * Try this predicate's own characters — a literal's, or a class's range
 * endpoints — against `ok`, in order, returning the first that passes.
 */
function firstOwnChar(pred: CharPred, ok: (c: string) => boolean): string | null {
  if (pred.kind === 'lit') return ok(pred.ch) ? pred.ch : null
  if (pred.kind === 'class') {
    for (const r of pred.ranges) {
      if (ok(r.lo)) return r.lo
      if (ok(r.hi)) return r.hi
    }
  }
  return null
}

/**
 * A single character both predicates accept, or `null`. Tests every literal /
 * range endpoint mentioned by either side plus a fixed fallback alphabet — that
 * pool covers literals, classes, negated classes, and the any∩any case. When
 * `disallowDot` is set (the segment-start position where a leading `.` is not
 * permitted), `.` is skipped as a candidate so a non-dot common character is
 * still found when one exists.
 *
 * The pool is walked LAZILY, in the order the two tiers agree on (this side's
 * own characters, then the other side's, then the fallback alphabet). Since the
 * first accepted candidate wins, a repeat can never change the answer, so the
 * de-duplicating `Set` the eager version built — 65 fallback insertions on every
 * edge pair, on the engine's hottest path — buys nothing.
 *
 * KNOWN LIMITATION (pathological, does not occur for real path globs): the
 * fallback alphabet is finite, so two negated classes that between them exclude
 * every fallback character (e.g. `[!` + all fallback chars + `]` intersected
 * with `*`) can report a false `null` even though some other character would
 * satisfy both. Real path-glob segments never negate the entire alphabet.
 */
function commonChar(p1: CharPred, p2: CharPred, ci: boolean, disallowDot: boolean): string | null {
  const ok = (c: string): boolean =>
    !(disallowDot && c === '.') && testChar(p1, c, ci) && testChar(p2, c, ci)
  const own1 = firstOwnChar(p1, ok)
  if (own1 !== null) return own1
  const own2 = firstOwnChar(p2, ok)
  if (own2 !== null) return own2
  for (const c of FALLBACK) {
    if (ok(c)) return c
  }
  return null
}

// --- Segment-matcher intersection -----------------------------------------

function epsClosure(m: SegmentMatcher, from: number): Set<number> {
  const set = new Set<number>()
  const stack = [from]
  while (stack.length) {
    const s = stack.pop()!
    if (set.has(s)) continue
    set.add(s)
    for (const t of m.epsOut[s]!) stack.push(t)
  }
  return set
}

/**
 * One concrete string accepted by BOTH segment matchers, or `null` when they
 * share none. Runs a BFS over the synchronized product of the two character
 * NFAs, recording predecessors so the shortest common string is reconstructed.
 * A literal on either side pins the character, so common substrings driven by a
 * literal are exact (which is what witness reconstruction relies on).
 *
 * The shortest common string is preferred EXCEPT for the empty one: two
 * zero-width-capable matchers (`*` ∩ `*`) both accept `""`, but no real path
 * segment is empty, and an empty FINAL witness segment round-trips through
 * `parse` and vanishes — yielding a path that matches neither side. So `""` is
 * held back as a fallback and returned only when the two share nothing else
 * (which a pattern segment that can only be empty, such as `{,x}` or the empty
 * segment of `a//b`, still needs).
 */
export function commonSegment(
  m1: SegmentMatcher,
  m2: SegmentMatcher,
  opts: Options | undefined,
): string | null {
  const ci = opts?.caseInsensitive ?? false
  const stride = m2.epsOut.length
  const key = (a: number, b: number): number => a * stride + b
  const start = key(m1.start, m2.start)
  const visited = new Set<number>([start])
  const queue: number[] = [start]
  const pred = new Map<number, { prev: number; ch: string }>()
  let emptyAccepted = false

  while (queue.length) {
    const st = queue.shift()!
    const a = Math.floor(st / stride)
    const b = st % stride
    const ca = epsClosure(m1, a)
    const cb = epsClosure(m2, b)

    if (ca.has(m1.accept) && cb.has(m2.accept)) {
      if (st === start) {
        // Both sides accept the empty string. Note it and keep searching for a
        // non-empty common string, which every real path segment is.
        emptyAccepted = true
      } else {
        const chars: string[] = []
        let cur = st
        while (cur !== start) {
          const p = pred.get(cur)!
          chars.push(p.ch)
          cur = p.prev
        }
        return chars.reverse().join('')
      }
    }

    // At the segment-start product state nothing has been consumed yet, so the
    // next character emitted is position 0 of the shared segment. A leading `.`
    // is permitted there only when BOTH edges about to fire allow one —
    // otherwise a zero-width `*` on either side could let a following literal
    // `.` slip a dotfile through (`*.env` must not match `.env` under
    // `dot:false`, and must not start doing so because a sibling brace branch
    // begins with a dot).
    const atSegmentStart = st === start

    for (const ua of ca) {
      for (const e1 of m1.charOut[ua]!) {
        for (const ub of cb) {
          for (const e2 of m2.charOut[ub]!) {
            const disallowDot = atSegmentStart && !(e1.dotAtStart && e2.dotAtStart)
            const c = commonChar(e1.pred, e2.pred, ci, disallowDot)
            if (c === null) continue
            const nk = key(e1.to, e2.to)
            if (!visited.has(nk)) {
              visited.add(nk)
              pred.set(nk, { prev: st, ch: c })
              queue.push(nk)
            }
          }
        }
      }
    }
  }
  return emptyAccepted ? '' : null
}
