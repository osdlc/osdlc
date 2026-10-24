/**
 * The search over two patterns' segment sequences.
 *
 * Each `SegmentPattern` compiles to an NFA over path segments. A normal
 * segment consumes exactly one input segment that its matcher accepts. `**`
 * consumes zero or more segments (an epsilon move plus a self-loop), as
 * `globstarMatchesZero` allows. {@link search} walks the product of two such
 * NFAs breadth-first. Both advance together on one segment, only where their
 * matchers share a concrete string. The walk stops at a state where both
 * accept. Product states are built only as the walk reaches them. Each
 * state's predecessor is recorded, so the common path can be rebuilt.
 *
 * No runtime dependencies.
 */
import type { Options, SegmentPattern } from './index.ts'
import { compileSegment, commonSegment, SyntaxState, type SegmentMatcher } from './automaton.ts'

interface ConsumeEdge {
  readonly matcher: SegmentMatcher
  readonly to: number
}

/**
 * A pattern as an NFA over path segments. `eps` are free moves. Each `consume`
 * edge takes one input segment that its matcher accepts. `accept[s]` marks an
 * accepting state.
 */
interface SeqNFA {
  readonly eps: number[][]
  readonly consume: ConsumeEdge[][]
  readonly accept: boolean[]
  readonly start: number
}

/** The matcher for one segment a `**` step consumes: `*`, any one whole segment. */
function starMatcher(opts: Options | undefined): SegmentMatcher {
  return compileSegment('*', opts)
}

function buildSeqNFA(pattern: SegmentPattern, opts: Options | undefined): SeqNFA {
  const eps: number[][] = []
  const consume: ConsumeEdge[][] = []
  const accept: boolean[] = []
  const newState = (): number => {
    eps.push([])
    consume.push([])
    accept.push(false)
    return eps.length - 1
  }

  const n = pattern.length
  const pos: number[] = []
  for (let i = 0; i <= n; i++) pos.push(newState())
  accept[pos[n]!] = true

  const gsZero = opts?.globstarMatchesZero ?? true
  const star = starMatcher(opts)
  const syntax = new SyntaxState(pattern.join('/'))

  for (let i = 0; i < n; i++) {
    const seg = pattern[i]!
    const from = pos[i]!
    const to = pos[i + 1]!
    if (seg === '**') {
      if (gsZero) {
        eps[from]!.push(to) // span zero segments
        consume[from]!.push({ matcher: star, to: from }) // one-or-more via self-loop
      } else {
        // Must span at least one segment: consume one, then zero-or-more, then leave.
        const mid = newState()
        consume[from]!.push({ matcher: star, to: mid })
        consume[mid]!.push({ matcher: star, to: mid })
        eps[mid]!.push(to)
      }
    } else {
      consume[from]!.push({ matcher: compileSegment(seg, opts, syntax), to })
    }
  }

  return { eps, consume, accept, start: pos[0]! }
}

function seqClosure(nfa: SeqNFA, from: number): Set<number> {
  const set = new Set<number>()
  const stack = [from]
  while (stack.length) {
    const s = stack.pop()!
    if (set.has(s)) continue
    set.add(s)
    for (const t of nfa.eps[s]!) stack.push(t)
  }
  return set
}

function anyAccept(nfa: SeqNFA, states: Set<number>): boolean {
  for (const s of states) {
    if (nfa.accept[s]) return true
  }
  return false
}

/**
 * One concrete segment path that matches both patterns, or `null` when they are
 * disjoint. `intersects` checks that it is not null. `witness` returns it. The
 * breadth-first walk finds the common path with the fewest segments.
 *
 * With `spellable`, a path of more than one segment whose last segment is empty
 * does not count, since no path string can write it. The search goes on past
 * such a path, so the result is the shortest path that a string can write. The
 * product state then carries a flag for "the last segment was empty", because
 * whether a pair of NFA states counts as accepting depends on it.
 */
export function search(
  a: SegmentPattern,
  b: SegmentPattern,
  opts: Options | undefined,
  spellable = false,
): SegmentPattern | null {
  const A = buildSeqNFA(a, opts)
  const B = buildSeqNFA(b, opts)
  const stride = B.eps.length * 2
  // A product state packs (state of A, state of B, last segment empty).
  const key = (sa: number, sb: number, emptyLast: number): number =>
    (sa * B.eps.length + sb) * 2 + emptyLast
  const start = key(A.start, B.start, 0)
  const visited = new Set<number>([start])
  const queue: number[] = [start]
  const pred = new Map<number, { prev: number; seg: string }>()

  while (queue.length) {
    const st = queue.shift()!
    const emptyLast = st % 2
    const sa = Math.floor(st / stride)
    const sb = Math.floor(st / 2) % B.eps.length
    const ca = seqClosure(A, sa)
    const cb = seqClosure(B, sb)

    if (anyAccept(A, ca) && anyAccept(B, cb)) {
      const segs: string[] = []
      let cur = st
      while (cur !== start) {
        const p = pred.get(cur)!
        segs.push(p.seg)
        cur = p.prev
      }
      // Skip a path that ends in an empty segment (only when it has others).
      if (!(spellable && emptyLast === 1 && segs.length > 1)) return segs.reverse()
    }

    for (const ua of ca) {
      for (const ea of A.consume[ua]!) {
        for (const ub of cb) {
          for (const eb of B.consume[ub]!) {
            const seg = commonSegment(ea.matcher, eb.matcher, opts)
            if (seg === null) continue
            const nk = key(ea.to, eb.to, spellable && seg === '' ? 1 : 0)
            if (!visited.has(nk)) {
              visited.add(nk)
              pred.set(nk, { prev: st, seg })
              queue.push(nk)
            }
          }
        }
      }
    }
  }
  return null
}
