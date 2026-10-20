# Changelog

## 0.2.1

### Patch Changes

- e6b5c4a: First public release. A path-pattern overlap engine. It answers one question: do two globs share a
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

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.1.5] - 2026-09-05 (unpublished)

#### Fixed

- `filesInScope` and `resolveIntersection` no longer read file names from disk as glob patterns, so
  names that contain `[ ] * ? { }` stop matching patterns they should not. To select such a file,
  escape those characters in the pattern.
- With `onlyFiles: false`, directory results have no trailing slash.
- `witness` returns `null`, not a string that matches neither side, when the common path ends in an
  empty segment and cannot be written as a path string.
- A brace branch that starts with a literal dot no longer lets the other branches of the segment
  match dotfiles.
- The tokenizer walks code points, so `?` and character classes work on characters outside the
  Basic Multilingual Plane.

### [0.1.4] - 2026-07-17 (unpublished)

#### Added

- Compiled ES modules and `.d.ts` files in `dist/`, so Node and bundlers can load the package.

### [0.1.3] - 2026-07-02 (unpublished)

#### Added

- The three entry points `.`, `./segments` and `./fs`, with types.

### [0.1.2] - 2026-07-02 (unpublished)

#### Added

- `./fs`: `filesInScope` and `resolveIntersection`, with the options `cwd`, `ignore`, `onlyFiles`
  and `absolute`.

### [0.1.1] - 2026-07-02 (unpublished)

#### Added

- `index` and `Registry`: labelled pattern sets with `applicableTo(scope)` and `matching(path)`. A
  duplicate id throws.

### [0.1.0] - 2026-07-02 (unpublished)

#### Added

- `intersects`, `matches`, `whichMatch`, `overlapping`, `witness`, `compile` and `parse`, and the
  segment engine with `intersects`, `matches` and `witness` over segment arrays. `Options`:
  `caseInsensitive`, `dot` and `globstarMatchesZero`.
