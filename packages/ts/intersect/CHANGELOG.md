# Changelog

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
