---
title: The algorithm
sidebar:
  order: 4
description: How the engine decides overlap by searching the product of two pattern automata.
---

Intersect treats each pattern as the set of concrete paths it matches. That set is usually
infinite. Two patterns overlap when their sets share a path. The engine answers that one question,
and on the way it finds one shared path.

Everything comes down to one function, `search(a, b, opts)` in `segments/product.ts`. It returns
a common `SegmentPattern` when one exists, or `null`. The three core functions are built on it:

| Function | Definition | What it takes from `search` |
|---|---|---|
| `intersects(a, b)` | `search(a, b) !== null` | Whether a common path exists. |
| `matches(path, pat)` | `search(path, pat) !== null` | A concrete path is a literal pattern. |
| `witness(a, b)` | `search(a, b)` | The common path itself, or `null`. |

So `intersects` and `witness` run the same search. `intersects` checks the result is not null.
`witness` returns it. The witness costs nothing extra: it is the path the search already found.

One difference appears when the path API turns a witness into a string. `search` works on segment
arrays. A path string cannot end in an empty segment, because `parse` drops one trailing separator
(`"src/"` → `["src"]`). So an array like `["src", ""]` cannot be written as a path, and the path
API's `witness` does not return it. It keeps searching for a longer common path whose last segment
is not empty. It returns `null` only when no such path exists, while `intersects`, which works on
arrays, still says `true`. That last case needs the empty segment to be the only common path, which
takes an empty brace branch (`a/{,x}` against `a/{,y}`).

## Two automata, two products

The engine has two levels. A pattern is a sequence of segments. A segment is a sequence of
characters. Each level is a nondeterministic finite automaton (NFA). Each overlap question builds
the product of two such automata and searches it breadth-first.

| Level | File | Automaton | Consumes | Search function |
|---|---|---|---|---|
| Sequence | `segments/product.ts` | `SeqNFA` | one whole path segment per edge | `search` |
| Character | `segments/automaton.ts` | `SegmentMatcher` | one character per edge | `commonSegment` |

For each pair of segment edges it considers, the sequence search calls the character search. That
decides whether the two segment matchers share a concrete string.

## The sequence automaton

`buildSeqNFA` compiles a `SegmentPattern` (e.g. `["src", "**", "*.vue"]`) into a `SeqNFA`:

- `eps: number[][]` — free moves between states.
- `consume: ConsumeEdge[][]` — each edge carries a `SegmentMatcher` and consumes one input segment.
- `accept: boolean[]` — accepting states.
- `start` — the entry state.

A pattern of `n` segments gets `n + 1` position states. Each ordinary segment becomes one `consume`
edge from `pos[i]` to `pos[i+1]`, carrying `compileSegment(seg, opts)`. A `**` becomes an
epsilon move plus a self-loop, which lets it match zero or more whole segments.

### How `**` is encoded

`**` is the only token that crosses `/`. Its wiring depends on `globstarMatchesZero` (default
`true`):

| `globstarMatchesZero` | Construction at the `**` node | Segments spanned |
|---|---|---|
| `true` | `eps` `from → to`, plus a `consume` self-loop `from → from` | zero or more |
| `false` | `consume` `from → mid`, `consume` self-loop `mid → mid`, `eps` `mid → to` | one or more |

Each pass around the self-loop consumes exactly one segment through the star matcher,
`compileSegment("*", opts)`, which matches any one whole segment. The epsilon edge skips the `**`,
so `a/**/b` reaches `a/b` with the `**` matching nothing. Because each step uses a `*` matcher, a
`**` step follows the same leading-dot rule as `*`: it does not match a `.hidden` segment unless
`dot` is set.

## The product search

`search` never builds the whole product. It builds product states only as a breadth-first search
reaches them. A product state is a state in `A`, a state in `B`, and a flag that says whether the
last segment taken was empty. The three are packed into one integer:

```ts
const key = (sa, sb, emptyLast) => (sa * B.eps.length + sb) * 2 + emptyLast;
```

The flag matters only for the path API's `witness`, which skips a path whose last segment is
empty (see above). For `intersects` it is always 0.

The search keeps three structures: a `visited: Set<number>` so each product state is expanded
once, a FIFO `queue` (breadth-first, so the first path found has the fewest segments), and a
`pred: Map<number, { prev, seg }>` that records, for each product state, the state before it and
the segment taken to reach it.

Each step:

1. Take the next product state from the queue, and take the `eps` closure (`seqClosure`) on both
   sides.
2. **Accept test.** If both closures contain an accepting state (`anyAccept`), the two patterns
   have both matched a common path. Follow `pred` back to `start`, collect the segments, reverse
   them, and return them as the witness. (For the path API's `witness`, a path of more than one
   segment whose last segment is empty is skipped, and the search goes on.)
3. **Expand.** For every pair of `consume` edges leaving the two closures, call
   `commonSegment(ea.matcher, eb.matcher, opts)`. When it returns a concrete segment, both sides
   can advance on it together. Add the target product state to the queue and record the segment in
   `pred`.

If the queue empties without both sides accepting, the patterns are disjoint and `search` returns
`null`.

## The character automaton

`compileSegment` turns one glob segment into a `SegmentMatcher` — a character-level NFA with the
same shape as the sequence layer, but over characters:

- `epsOut: number[][]`, `charOut: CharEdge[][]` — per-state adjacency.
- single `start` and `accept` states (concatenation and alternation lead into one accept state).
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

`*` is built as three states: an epsilon edge (zero characters), a first-character edge, and a
self-loop for the rest. Alternations and classes stay as NFA structure. They are never expanded
into lists of strings.

### commonSegment

`commonSegment(m1, m2, opts)` does for characters what `search` does for segments. It runs a
breadth-first search over the product of the two character NFAs, with the same kind of packed key
(`a * stride + b`), `visited` set, FIFO queue and `pred` map (here recording the character taken).
When both sides accept, it rebuilds the shortest non-empty common string and returns it. When the
queue empties, it returns `null`.

The empty string is the one exception to "shortest wins". Two matchers that can match nothing
(`*` and `*`, which every `**` step compiles to) both accept `""`. But a path segment is normally
not empty, and an empty last segment in a witness is dropped by `parse`. So `""` is kept back and
returned only when the two share nothing else. A segment that can only be empty still needs it:
the middle segment of `a//b`, or an empty brace branch such as `{,x}`.

To take a pair of character edges together, the search needs one character both predicates
accept. `commonChar(p1, p2, ci, disallowDot)` finds one by testing candidates against both
predicates with `testChar`. It tries every literal and class-range endpoint either side names,
then a fixed `FALLBACK` alphabet (ASCII letters, digits, and `._-`). If none passes, it tries the
characters just below and above each class range (`boundaryChars`). A set of ranges that shares a
point shares one at such a boundary or at an endpoint, so this also finds a common character for
two negated classes that between them exclude the whole fallback alphabet. `caseInsensitive` is
applied here, per character, through `charEq` and `inRange` (ASCII case swap).

Because a `lit` edge fixes its exact character, the rebuilt common string is exact. That is what
makes the witness a real path that matches both sides.

## Dotfiles: the leading-dot rule

By default a `*` or `**` wildcard does not match a segment that begins with `.`. Both parts of the
rule are stored on the edges. A simple "the first edge excludes a dot" rule is not enough, because
a `*` can match nothing and leave the first character to the next token.

- **`excludeDot`.** A wildcard edge at the segment start carries it when `dot` is off, so the
  wildcard's own first character cannot be `.`.
- **`dotAtStart`.** `dot || (the token is a literal and it begins its branch)`. It answers, for one
  edge: if this edge consumes the first character, may it be a `.`? The leading `.` of `.env` and
  `.*` passes. The literal `.` inside `*.env` does not, because that branch begins with `*`.

`commonSegment` reads `dotAtStart` at the start product state only. For the pair of edges about to
be taken, it computes `disallowDot = atSegmentStart && !(e1.dotAtStart && e2.dotAtStart)`. The first
character of the shared segment may be a dot only when both edges allow it. This handles a `*` that
matches nothing. Without it, `*.env` could match `.env`: the star would match nothing, and the
literal `.` would supply the first character. Reading the rule per edge, not per segment, also
keeps `{*.env,.x}` correct: the `.x` branch does not allow a dotfile for the `*.env` branch.

| A | B | `dot` | Result | Why |
|---|---|---|---|---|
| `*` | `.env` | off | `false` | wildcard excludes a leading-dot segment |
| `*` | `.env` | on | `true` | `dot` allows the dotfile |
| `*.env` | `.env` | off | `false` | the rule holds when `*` matches nothing |
| `*.env` | `a.env` | off | `true` | the dot is not the first character |
| `**/*.env` | `.env` | off | `false` | the rule holds after a `**` prefix |
| `.*` | `.env` | off | `true` | branch begins with a literal dot |
| `{*.env,.x}` | `.env` | off | `false` | a sibling branch's dot does not apply to this one |
| `src/**/*.ts` | `src/.hidden/x.ts` | off | `false` | `**` does not match a dot segment |

## Exact match, no guessed subtree

A pattern with no wildcards compiles to a chain of edges that each consume one literal segment.
Two such chains both accept only when they are equal. So `src/siteA/components` intersects
`src/siteA/components` but not `src/siteA/components/Button.vue`: a child is a longer path, not the
same one. The engine does not guess whether a path is a directory or a file. A subtree is written
with a trailing `**`. This holds in every entry point, including `intersect/fs`, which only lists
the tree and leaves each include and exclude to this same matching.

## Options

Three options change the search. All are off by default except `globstarMatchesZero`.

| Option | Where it acts | Effect |
|---|---|---|
| `caseInsensitive` | `commonChar` / `testChar` | Compares characters ignoring ASCII case. |
| `dot` | edge `dotAtStart` / `excludeDot` | Lets `*`/`**` match a leading-dot segment. |
| `globstarMatchesZero` | `buildSeqNFA` `**` edges | Lets `**` match zero segments. |

## Why comparing two patterns is polynomial

The product construction keeps the two-pattern question fast. Each side's automaton grows with its
pattern's size, and the breadth-first search visits each product state at most once:

| Level | Product states (bound) | Per-state cost |
|---|---|---|
| Sequence | `states(A) · states(B)`, each `O(segments)` | pairs of `consume` edges, each `commonSegment` |
| Character | `states(m1) · states(m2)`, each `O(seg length)` | pairs of char edges, each `commonChar` |

The state count at each level is the product of two sizes, not exponential in one. The `visited`
set means no product state is expanded twice, so `**` never causes exponential backtracking. A
simple matcher that expands `**` and tries every alignment does. The search over the segment
product is polynomial in the sizes of the two patterns. The character product inside it adds
another polynomial factor for each segment comparison. The total is polynomial.

A set of patterns is a union, so comparing two sets is an OR over the pairwise checks. That is
still polynomial. The package does not try to intersect or complement many patterns at once. That
is much more expensive, and it is why negating a whole pattern (`!pat`, gitignore-style
re-includes) is not supported: it needs the complement of a pattern's set of paths, not a product
of two. Every question the API answers is built on the one polynomial two-pattern search.
