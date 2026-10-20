---
"@osdlc/intersect": patch
---

First public release. A path-pattern overlap engine. It answers one question: do two globs share a
common matching path? It does pure pattern algebra, returns the shared path as proof, and reads the
disk only through the optional `./fs` entry point.

### Added

- `intersects(a, b)`, `matches(path, patterns)`, `whichMatch(path, patterns)`,
  `overlapping(query, candidates)` and `witness(a, b)`. Each pattern argument is one glob or a list.
  A pattern with no wildcard matches exactly that path; `**` selects a subtree. `witness` returns a
  path that both sides match, or `null`.
- `compile(patterns, opts)`, which returns a `Matcher` with `matches`, `intersects`, `overlapping`
  and `witness`, so a pattern set is parsed once. `parse(path, { separator })` splits a pattern into
  segments.
- `index(entries, opts)`, which builds a `Registry` of labelled pattern sets. `applicableTo(scope)`
  returns the ids whose patterns overlap a scope, and `matching(path)` returns the ids whose
  patterns match a path, both in registration order. A duplicate id throws.
- `@osdlc/intersect/segments`: `intersects`, `matches` and `witness` over pre-split segment arrays,
  with no runtime dependency.
- `@osdlc/intersect/fs`: `filesInScope(patterns, opts)` lists the existing files under a scope, and
  `resolveIntersection(a, b, opts)` lists the files that both pattern sets match. Options are `cwd`,
  `ignore`, `onlyFiles` and `absolute`. This is the only entry point that uses `tinyglobby`.
- `Options`: `caseInsensitive`, `dot` and `globstarMatchesZero`, accepted by every function.
- Compiled ES modules with type declarations.

A Rust peer crate, `intersect`, lives in sksizer/dev. Both run the same conformance cases.
