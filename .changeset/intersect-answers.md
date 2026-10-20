---
"@osdlc/intersect": minor
---

Closes the gaps between the TypeScript package and its Rust peer, and fixes wrong answers found in an API review. Several results change, so this is a minor release while the version is below 1.0.

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
