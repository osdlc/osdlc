# @osdlc/intersect

## 0.3.1

### Patch Changes

- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.

## 0.3.0

### Minor Changes

- 07dffd8: Closes the gaps between the TypeScript package and its Rust peer, and fixes wrong answers found in an API review. Several results change, so this is a minor release while the version is below 1.0.
  
  ### Changed
  
  - `matches`, `whichMatch`, `Matcher.matches` and `Registry.matching` now read the path argument as the literal name it is. Before, `matches("pages/[id].vue", "pages/d.vue")` was `true` because `[id]` was read as a character class. Now it is `false`, and `matches("pages/[id].vue", "pages/\\[id\\].vue")` is `true`. The patterns are still globs. `./segments` `matches` is unchanged.
  - `caseInsensitive` folds ASCII letters only, as documented. `ß` no longer matches `[S]`, `Ä` no longer matches `ä`, and the Kelvin sign no longer matches `k`.
  - `witness` keeps searching when the first common path ends in an empty segment, so it no longer returns `null` for pairs that share a path. `witness("a//**", "**")` now returns `a//a` and `witness("a/**/{,x}", "a/{,y}/**")` returns `a/y/x`. It still returns `null` when the only common path cannot be written as a path string, such as `a/{,x}` against `a/{,y}`.
  - `parse` with `separator: ""` now splits on `/`, instead of splitting into single characters.
  - `overlapping(query, candidates)` and `Matcher.overlapping(candidates)` accept a single string or a list for the candidates. The two functions still return members of different arguments, and the docs now say so.
  - `./fs` no longer follows symbolic links, and does not list them. `absolute: true` with a relative `cwd` now returns absolute paths. Results sort by code point, not UTF-16 unit. The docs now state that the whole tree is listed before filtering, and how `ignore` matches.
  
  ### Added
  
  - `IntersectError`, exported from `@osdlc/intersect` and `@osdlc/intersect/segments`, with a `code`: `DUPLICATE_REGISTRY_ID`, `PATTERN_TOO_DEEP`, `UNSUPPORTED_SYNTAX`, `INVALID_ARGUMENT` and `IO_ERROR`.
  - `index()` throws `IntersectError` with code `DUPLICATE_REGISTRY_ID` for a repeated `id`, where it threw a plain `Error`.
  - A pattern with `{` groups nested more than 64 deep throws `PATTERN_TOO_DEEP`, where it could throw a raw `RangeError`.
  - A wrong argument type throws `IntersectError` with code `INVALID_ARGUMENT`, where it threw a raw `TypeError`.
  - `./fs` throws `IntersectError` with code `IO_ERROR` for a missing or non-directory `cwd` and for an unreadable directory. Before, it returned an empty list or skipped the directory.
  - A "Supported syntax" table in the README.
  
  ### Docs
  
  - A `Matcher` passed as an argument uses the receiver's options; its own options are ignored. This was already the behaviour, and the docs now say so.
  
  ### Breaking
  
  - Syntax that was read as plain text now throws `IntersectError` with code `UNSUPPORTED_SYNTAX`: number ranges such as `{1..3}`, a `{...}` group or `[...]` class that holds a `/`, and extglobs such as `+(a|b)` and `!(b)`. The error is thrown when the pattern is compiled. Escape a `(` to match it as text. An unclosed `{` or `[` is still plain text.
  
  A Rust peer crate, `intersect`, lives in sksizer/dev and follows the same conformance cases.

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
