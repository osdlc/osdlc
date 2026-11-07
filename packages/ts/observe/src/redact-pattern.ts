/**
 * The check for an extra redaction pattern. `createRedactor` runs it on each
 * `extraPatterns` entry. It has no dependencies, so a config loader can run it
 * to report a bad pattern at load without loading secretlint.
 */

/**
 * An inline modifier group's opening, such as `(?i:` or `(?-i:`. It also
 * matches an escaped `\(?i:`, which only makes the check stricter.
 */
const MODIFIER_GROUP = /\(\?(?:[a-zA-Z]+(?:-[a-zA-Z]*)?|-[a-zA-Z]+):/

/** A bounded repeat of at most this many times is cheap enough that its inner quantifiers are allowed. */
const SMALL_REPEAT_MAX = 3

interface Group {
  /** A quantifier with no upper bound (`+`, `*`, `{n,}`) sits in this group or one inside it. */
  unbounded: boolean
  /** A bounded quantifier whose width varies (`?`, `{1,3}`) sits in this group or one inside it. */
  variable: boolean
  /** An alternation whose branches can match the same text sits in this group or one inside it. */
  overlapping: boolean
  /** How each branch of this group starts: a literal character, or `*` when it could match many. */
  starts: string[]
  /** No atom has been read yet in the current branch. */
  atStart: boolean
  /** Index in the source where this group's body starts, after `(` and any `?:`-style prefix. */
  bodyStart: number
}

const newGroup = (): Group => ({
  unbounded: false,
  variable: false,
  overlapping: false,
  starts: [],
  atStart: true,
  bodyStart: 0,
})

/** Record `token` as the start of `group`'s current branch, if it has none yet. */
function startBranch(group: Group, token: string): void {
  if (!group.atStart) return
  group.starts.push(token)
  group.atStart = false
}

/**
 * Whether two branches of `group` can begin alike: a repeat of it can then
 * match one text many ways. `caseless` compares the starts ignoring case.
 */
function branchesOverlap(group: Group, caseless: boolean): boolean {
  if (group.atStart && group.starts.length > 0) group.starts.push('')
  if (group.starts.length < 2) return false
  const starts = caseless ? group.starts.map((s) => s.toLowerCase()) : group.starts
  return starts.includes('*') || starts.includes('') || new Set(starts).size < starts.length
}

interface Quantifier {
  end: number
  unbounded: boolean
  max: number
  /** Bounded, but can match more than one run length (`?`, `{1,3}`; not `{2}`). */
  variable: boolean
}

/** The quantifier at `i` (after a group or atom): its extent and whether it has an upper bound. */
function quantifierAt(source: string, i: number): Quantifier | null {
  const c = source[i]
  if (c === '+' || c === '*') return { end: i + 1, unbounded: true, max: Infinity, variable: false }
  if (c === '?') return { end: i + 1, unbounded: false, max: 1, variable: true }
  if (c !== '{') return null
  const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(source.slice(i))
  if (m === null) return null
  const min = Number(m[1])
  const unbounded = m[2] !== undefined && m[3] === ''
  const max = unbounded ? Infinity : m[2] === undefined ? min : Number(m[3])
  return { end: i + m[0].length, unbounded, max, variable: !unbounded && max > min }
}

/** Record an atom's quantifier `q` on `group`. */
function markQuantifier(group: Group, q: Quantifier | null): void {
  if (q?.unbounded) group.unbounded = true
  if (q?.variable) group.variable = true
}

/**
 * A set of characters as inclusive UTF-16 code-unit ranges; `null` when it is
 * unknown or could be anything. Code units, not code points: the pattern
 * compiles without `u`, so the engine matches `😀` as two units.
 */
type CharSet = [number, number][] | null

const DIGIT: [number, number][] = [[0x30, 0x39]]
const WORD: [number, number][] = [
  [0x30, 0x39],
  [0x41, 0x5a],
  [0x5f, 0x5f],
  [0x61, 0x7a],
]
const SPACE: [number, number][] = [
  [0x09, 0x0d],
  [0x20, 0x20],
  [0xa0, 0xa0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
]
const CONTROL_ESCAPES: Record<string, number> = { t: 9, n: 10, v: 11, f: 12, r: 13 }

/** The set an escape `\<e>` matches: a class escape, a control escape or an escaped punctuation mark. */
function escapeSet(e: string | undefined): CharSet {
  if (e === undefined) return null
  if (e === 'd') return DIGIT
  if (e === 'w') return WORD
  if (e === 's') return SPACE
  const control = CONTROL_ESCAPES[e]
  if (control !== undefined) return [[control, control]]
  if (/[A-Za-z0-9]/.test(e)) return null
  const code = e.charCodeAt(0)
  return [[code, code]]
}

/** The set the character class whose body is `body` (between `[` and `]`) matches; `null` for a negated class. */
function classSet(body: string): CharSet {
  if (body.startsWith('^')) return null
  const set: [number, number][] = []
  let i = 0
  const single = (): CharSet => {
    if (body[i] !== '\\') {
      const code = body.charCodeAt(i++)
      return [[code, code]]
    }
    const e = body[i + 1]
    i += 2
    return e === 'b' ? null : escapeSet(e)
  }
  while (i < body.length) {
    const from = single()
    if (from === null) return null
    const lo = from.length === 1 && from[0]![0] === from[0]![1] ? from[0]![0] : null
    if (lo !== null && body[i] === '-' && i + 1 < body.length) {
      i++
      const to = single()
      if (to === null || to.length !== 1 || to[0]![0] !== to[0]![1] || to[0]![0] < lo) return null
      set.push([lo, to[0]![0]])
    } else {
      set.push(...from)
    }
  }
  return set
}

/** The one character escape `\<e>` matches, or `*` when it is a class, an assertion or unknown. */
function escapeStart(e: string | undefined): string {
  const set = escapeSet(e)
  if (set?.length !== 1 || set[0]![0] !== set[0]![1]) return '*'
  return String.fromCharCode(set[0]![0])
}

function disjoint(a: CharSet, b: CharSet): boolean {
  if (a === null || b === null) return false
  return a.every(([lo, hi]) => b.every(([blo, bhi]) => hi < blo || bhi < lo))
}

/**
 * Whether a repeated group with this `body` ends in a separator: a single
 * unquantified literal character or class that no earlier atom of the body can
 * match, after a plain run of atoms with at most one variable-width quantifier
 * (`[0-9a-f]{1,4}:`, `[a-z]+-`). Each repeat then ends at the next separator
 * and matches it one way, so the repeat cannot backtrack through many splits.
 * Anything else (a group, an alternation, an anchor, `.`, a negated class, an
 * unknown escape, a second variable-width atom) answers `false`.
 */
function endsInSeparator(body: string): boolean {
  const atoms: { set: CharSet; quantifier: Quantifier | null }[] = []
  let i = 0
  while (i < body.length) {
    const c = body[i]!
    let set: CharSet
    if (c === '\\') {
      set = escapeSet(body[i + 1])
      i += 2
    } else if (c === '[') {
      let j = i + 1
      while (j < body.length && body[j] !== ']') j += body[j] === '\\' ? 2 : 1
      if (j >= body.length) return false
      set = classSet(body.slice(i + 1, j))
      i = j + 1
    } else if ('()|^$.*+?{}'.includes(c)) {
      return false
    } else {
      const code = body.charCodeAt(i++)
      set = [[code, code]]
    }
    if (set === null) return false
    const quantifier = quantifierAt(body, i)
    if (quantifier !== null) {
      i = quantifier.end
      if (body[i] === '?') i++
    }
    atoms.push({ set, quantifier })
  }
  const separator = atoms.pop()
  if (separator === undefined || separator.quantifier !== null || atoms.length === 0) return false
  const variableAtoms = atoms.filter((a) => a.quantifier?.unbounded || a.quantifier?.variable)
  if (variableAtoms.length > 1) return false
  return atoms.every((a) => disjoint(a.set, separator.set))
}

/**
 * Whether some group is repeated in a way that can blow up: an unbounded repeat
 * of a group that holds an unbounded quantifier (`(x+)+`), a variable-width
 * bounded quantifier (`(a{1,2})+`, `(a?a?)+`), or an alternation
 * whose branches can start alike (`(a|a)+`, `(a|aa)*`, `(\w|\d)+`; `(a|b)+` is
 * fine), or a repeat of more than {@link SMALL_REPEAT_MAX} of a group that holds
 * an unbounded or variable-width quantifier (`(.*a){10}`, `(a{1,2}){20}`).
 * A group that {@link endsInSeparator} is allowed any repeat
 * (`(?:[0-9a-f]{1,4}:){7}`), though its quantifiers still count against the
 * groups around it. Escapes and character classes count as one atom.
 *
 * An inline modifier group (`(?i:`, `(?-s:`) can make `[a-z]` match `Z`, so
 * when the pattern has one the separator rule is off and branch starts compare
 * ignoring case. The pattern is otherwise compiled with `g` alone, so no other
 * flag changes what an atom matches.
 */
function hasCatastrophicRepeat(source: string): boolean {
  const modifiers = MODIFIER_GROUP.test(source)
  const stack: Group[] = [newGroup()]
  const top = (): Group => stack[stack.length - 1]!
  let i = 0
  while (i < source.length) {
    const c = source[i]!
    if (c === '\\') {
      startBranch(top(), escapeStart(source[i + 1]))
      i += 2
      markQuantifier(top(), quantifierAt(source, i))
    } else if (c === '[') {
      startBranch(top(), '*')
      i++
      // Without `v`, `[]` matches nothing and `[^]` anything: a leading `]` closes the class.
      if (source[i] === '^') i++
      while (i < source.length && source[i] !== ']') i += source[i] === '\\' ? 2 : 1
      i++
      markQuantifier(top(), quantifierAt(source, i))
    } else if (c === '(') {
      startBranch(top(), '*')
      i++
      i +=
        /^\?(?:[a-zA-Z]*(?:-[a-zA-Z]+)?:|=|!|<=|<!|<[A-Za-z_]\w*>)/.exec(source.slice(i))?.[0]
          .length ?? 0
      stack.push({ ...newGroup(), bodyStart: i })
    } else if (c === '|') {
      const group = top()
      if (group.atStart) group.starts.push('')
      group.atStart = true
      i++
    } else if (c === ')') {
      const group = stack.length > 1 ? stack.pop()! : newGroup()
      group.overlapping ||= branchesOverlap(group, modifiers)
      const q = quantifierAt(source, i + 1)
      if (q !== null && (modifiers || !endsInSeparator(source.slice(group.bodyStart, i)))) {
        if (q.unbounded && (group.unbounded || group.variable || group.overlapping)) return true
        if (!q.unbounded && q.max > SMALL_REPEAT_MAX && (group.unbounded || group.variable)) {
          return true
        }
      }
      markQuantifier(group, q)
      top().unbounded ||= group.unbounded
      top().variable ||= group.variable
      top().overlapping ||= group.overlapping
      i = q === null ? i + 1 : q.end
    } else {
      startBranch(top(), c === '.' ? '*' : c)
      markQuantifier(top(), quantifierAt(source, i + 1))
      i++
    }
  }
  return false
}

/**
 * Why `regex` cannot be a redaction pattern, or `null` when it can: it does not
 * compile, or it has a shape known to backtrack catastrophically: an
 * unbounded repeat of a group that holds an unbounded quantifier (`(x+)+`), a
 * variable-width bounded quantifier (`(a{1,2})+`) or an alternation whose
 * branches can start alike (`(a|aa)*`), or a large bounded repeat of such a
 * group (`(.*a){10}`). A group that ends in a separator the rest of it cannot
 * match is allowed (`(?:[0-9a-f]{1,4}:){7}`). A static check, best effort
 * rather than a proof: it rejects the common shapes, not every pattern that
 * can be slow.
 *
 * @example
 * ```ts
 * redactPatternProblem('ghp_[A-Za-z0-9]{36}') // null
 * redactPatternProblem('(a+)+$') // a message naming the risk
 * ```
 */
export function redactPatternProblem(regex: string): string | null {
  if (hasCatastrophicRepeat(regex)) {
    return 'a repeated group holding a nested unbounded quantifier, a variable-width bounded quantifier or an overlapping alternation, and not ending in a separator the rest of the group cannot match, risks catastrophic backtracking'
  }
  try {
    new RegExp(regex, 'g')
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
  return null
}
