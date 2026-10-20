---
title: The algorithm
description: How the engine decides overlap by walking a synchronized product of two pattern automata.
---

Intersect treats each pattern as a **language** — the (usually infinite) set of concrete paths it
matches. Two patterns overlap when the intersection of their languages is non-empty. The whole
engine answers that one question and, as a side effect, hands back one member of the intersection.

Everything reduces to a single function, `search(a, b, opts)` in `segments/product.ts`. It returns
a common `SegmentPattern` when one exists, or `null`. The three core primitives are shapes over it:

| Primitive | Definition | What it reads off `search` |
|---|---|---|
| `intersects(a, b)` | `search(a, b) !== null` | Whether a common path exists. |
| `matches(path, pat)` | `search(path, pat) !== null` | A concrete path is a literal pattern. |
| `witness(a, b)` | `search(a, b)` | The common path itself, or `null`. |

So `intersects` and `witness` run the **same walk**. `intersects` throws the path away and checks
for non-null; `witness` returns it. The witness is free — it is the path the walk already built to
prove the overlap.

One asymmetry appears when the path API stringifies a witness. `search` answers in **segment
vectors**; a path *string* cannot end in an empty segment, because `parse` normalizes one trailing
separator back off (`"src/"` → `["src"]`). A vector like `["src", ""]` therefore spells no path, and
the path-level `witness` does not return it. It keeps searching for a longer common path whose last
segment is not empty, and returns `null` only when no such path exists — while `intersects`, which
answers over vectors, still says `true`. That last case needs the empty segment to be the *only*
common path, which takes an empty brace branch (`a/{,x}` against `a/{,y}`).

## Two automata, two products

The engine is layered. A pattern is a sequence of segments; a segment is a sequence of characters.
Each level is a nondeterministic finite automaton, and each overlap question is a **synchronized
product** of two such automata explored by breadth-first reachability.

| Level | File | Automaton | Consumes | Overlap driver |
|---|---|---|---|---|
| Sequence | `segments/product.ts` | `SeqNFA` | one whole path segment per edge | `search` |
| Character | `segments/automaton.ts` | `SegmentMatcher` | one character per edge | `commonSegment` |

The sequence product calls the character product to decide, for each candidate pair of segment
edges, whether the two segment-matchers share a concrete string. It is a product of products.

## The sequence automaton

`buildSeqNFA` compiles a `SegmentPattern` (e.g. `["src", "**", "*.vue"]`) into a `SeqNFA`:

- `eps: number[][]` — free moves between states.
- `consume: ConsumeEdge[][]` — each edge carries a `SegmentMatcher` and eats one input segment.
- `accept: boolean[]` — accepting states.
- `start` — the entry state.

A pattern of `n` segments gets `n + 1` position states. Each ordinary segment becomes one `consume`
edge from `pos[i]` to `pos[i+1]`, carrying `compileSegment(seg, opts)`. A `**` becomes an
epsilon/self-loop construction that lets it span **zero or more whole segments**.

### How `**` is encoded

`**` is the only token that crosses `/`. Its wiring depends on `globstarMatchesZero` (default
`true`):

| `globstarMatchesZero` | Construction at the `**` node | Segments spanned |
|---|---|---|
| `true` | `eps` `from → to`, plus a `consume` self-loop `from → from` | zero or more |
| `false` | `consume` `from → mid`, `consume` self-loop `mid → mid`, `eps` `mid → to` | one or more |

Each traversal of the self-loop eats exactly one segment via the star matcher —
`compileSegment("*", opts)`, which matches any single whole segment. The epsilon edge is the
zero-span shortcut, so `a/**/b` reaches `a/b` with the globstar spanning nothing. Because the span
is driven by a `*` matcher, a `**` step obeys the same leading-dot rule as `*`: it will not cross a
`.hidden` segment unless `dot` is set.

## The synchronized product walk

`search` never materializes either automaton's product fully. It explores the product **lazily** by
BFS. A product state is the pair `(sa, sb)` — a state in `A` and a state in `B` — flattened to one
integer:

```ts
const stride = B.eps.length;
const key = (sa, sb) => sa * stride + sb;
```

The walk holds three structures: a `visited: Set<number>` that guards each product state once, a
FIFO `queue` (BFS, so the first path found has the fewest segments), and a
`pred: Map<number, { prev, seg }>` recording, per product state, the predecessor and the concrete
segment taken to reach it.

Each iteration:

1. Dequeue a product state and take the `eps` closure (`seqClosure`) on both sides.
2. **Accept test.** If both closures contain an accepting state (`anyAccept`), the two patterns have
   jointly consumed a common path. Walk `pred` back to `start`, collect the segments, reverse, and
   return the `SegmentPattern` witness.
3. **Expand.** For every pair of `consume` edges leaving the two closures, call
   `commonSegment(ea.matcher, eb.matcher, opts)`. When it returns a concrete segment, both sides can
   advance on it together; enqueue the product target and record the segment in `pred`.

If the queue drains without a joint accept, the languages are disjoint and `search` returns `null`.

## The character automaton

`compileSegment` turns one glob segment into a `SegmentMatcher` — a character-level NFA with the
same shape as the sequence layer, but over characters:

- `epsOut: number[][]`, `charOut: CharEdge[][]` — per-state adjacency.
- single `start` and `accept` states (concatenation and alternation funnel into one accept).
- each `CharEdge` also carries `dotAtStart: boolean` — the leading-dot rule, covered below.

Each `CharEdge` carries a `CharPred`, the predicate over one input character:

| Token | `CharPred` | Consumes |
|---|---|---|
| literal text | `lit` — exactly this character | one char; a literal `.` is always allowed |
| `?` | `any` | exactly one character |
| `*` | `any` skip-edge + self-loop | zero or more characters |
| `[a-z]`, `[abc]` | `class` with `ranges` | one character in the set |
| `[!abc]`, `[^abc]` | `class` with `negated` | one character not in the set |
| `{a,b}` | epsilon alternation over branch fragments | whichever branch matches |

`*` is built as three states: an epsilon skip (zero characters), a first-character edge, and a
self-loop for the rest. It is a run of characters, never eager string expansion, so alternations and
classes stay as NFA structure rather than being enumerated.

### commonSegment

`commonSegment(m1, m2, opts)` is the character analogue of `search`: a BFS over the synchronized
product of the two character NFAs, with the identical `key = a * stride + b` flattening, `visited`
set, FIFO queue, and `pred` map (here recording the character taken). On a joint accept it
reconstructs the **shortest non-empty** common string and returns it; when the product drains it
returns `null`.

The empty string is the one exception to "shortest wins". Two zero-width-capable matchers (`*` ∩
`*`, which every `**` step compiles to) both accept `""`, but no real path segment is empty and an
empty *final* witness segment does not survive `parse` — so `""` is held back and returned only when
the two share nothing else. A segment that can ONLY be empty still needs it: the middle segment of
`a//b`, or an empty brace branch such as `{,x}`.

The one new ingredient is per-edge: to cross a pair of character edges the walk needs a single
character both predicates accept. `commonChar(p1, p2, ci, disallowDot)` finds one by testing a
candidate pool — every literal and class-range endpoint mentioned by either side, plus a fixed
`FALLBACK` alphabet (ASCII letters, digits, and `._-`) — against both predicates via `testChar`.
`caseInsensitive` is applied here, per character, through `charEq` and `inRange` (ASCII case swap).

Because a `lit` edge pins its exact character, any common substring driven by a literal is exact —
which is what makes the reconstructed witness a real, matchable path.

**Known limitation (by design).** The `FALLBACK` alphabet is finite. Two negated classes that
between them exclude every fallback character can report a false `null`, even though some other
character would satisfy both. Real path-glob segments never negate the whole alphabet, so this is
left as-is rather than reworked into a full complement scan.

## Dotfiles: the leading-dot guard

By default a `*`/`**` wildcard must not match a segment that begins with `.`. Both parts of the rule
live on the edges, because a zero-width `*` complicates the naive "first edge excludes dot" rule.

- **`excludeDot`.** A wildcard edge at the segment start carries it when `dot` is off, so a directly
  consumed first character is kept off `.`.
- **`dotAtStart`.** `dot || (the token is a literal AND it begins its branch)`. It answers, for one
  edge: if this edge fires first, may it emit a `.`? The leading `.` of `.env` and `.*` qualifies,
  but the literal `.` inside `*.env` does not — that branch begins with `*`.

`commonSegment` reads `dotAtStart` at the **start product state only**, computing
`disallowDot = atSegmentStart && !(e1.dotAtStart && e2.dotAtStart)` for the pair of edges about to
fire. Position 0 of the shared segment may be a dot only when **both** edges allow it. This is what
survives a zero-width `*`: without it, `*.env` could match `.env` by having the star consume nothing
and the literal `.` emit position 0. Reading it per edge rather than per segment is also what keeps
`{*.env,.x}` honest — the `.x` branch does not license a dotfile for the `*.env` branch.

| A | B | `dot` | Result | Why |
|---|---|---|---|---|
| `*` | `.env` | off | `false` | wildcard excludes a leading-dot segment |
| `*` | `.env` | on | `true` | `dot` opts the dotfile in |
| `*.env` | `.env` | off | `false` | guard survives the zero-width `*` |
| `*.env` | `a.env` | off | `true` | the dot is not at position 0 |
| `**/*.env` | `.env` | off | `false` | guard survives a globstar prefix |
| `.*` | `.env` | off | `true` | branch begins with a literal dot |
| `{*.env,.x}` | `.env` | off | `false` | a sibling branch's dot does not license this one |
| `src/**/*.ts` | `src/.hidden/x.ts` | off | `false` | `**` will not span a dot segment |

## Exact match, no subtree inference

A pattern with no wildcards compiles to a chain of single-consume `lit`-matcher edges. Two such
chains reach a joint accept only when they are equal, so `src/siteA/components` intersects
`src/siteA/components` but not `src/siteA/components/Button.vue` — a child is a longer path, not the
same one. There is no directory/file heuristic and no ambiguity error. A subtree is opted into
explicitly with a trailing `**`. This holds unchanged through every layer, including `intersect/fs`,
which only enumerates the tree and defers each include/exclude to this same matching.

## Options

Three options steer the walk. All default off except `globstarMatchesZero`.

| Option | Where it acts | Effect |
|---|---|---|
| `caseInsensitive` | `commonChar` / `testChar` | Compares characters ignoring ASCII case. |
| `dot` | edge `dotAtStart` / `excludeDot` | Lets `*`/`**` match a leading-dot segment. |
| `globstarMatchesZero` | `buildSeqNFA` `**` wiring | Lets a globstar span zero segments. |

## Why pairwise is polynomial

The product construction is the reason the pairwise question is tractable. Each side's automaton is
bounded by its pattern size, and BFS visits each **product** state at most once:

| Level | Product states (bound) | Per-state cost |
|---|---|---|
| Sequence | `states(A) · states(B)`, each `O(segments)` | pairs of `consume` edges, each `commonSegment` |
| Character | `states(m1) · states(m2)`, each `O(seg length)` | pairs of char edges, each `commonChar` |

The state count at each level is the **product** of two sizes, not an exponential of one. The
`visited` set means no product state is expanded twice, so there is no globstar backtracking
blowup — the trap a naive "expand `**` and try to align" matcher falls into. Reachability over the
product is polynomial in the combined sizes of the two patterns; the nested character product adds
another polynomial factor per segment comparison. The total is polynomial.

A **set** of patterns is just a union: set-vs-set overlap is an OR over the pairwise checks, still
polynomial. What the library deliberately does not attempt is the general many-pattern question —
simultaneously intersecting or complementing an arbitrary number of pattern-languages. That is the
expensive direction, and it is why pattern-level negation (`!pat`, gitignore-style re-includes) is
out of v1: it needs language complement rather than a pairwise product. Every question the API does
answer stays a shape over the one polynomial pairwise walk.
