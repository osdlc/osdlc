# intersect

Whether two path globs share a common matching path, and the operations built
on that question: matching a path, a witness path both globs match, the
patterns of a set that overlap another, a registry of labeled patterns, and a
filesystem layer that lists the files on disk a pattern set matches.

| Implementation | Language | Directory |
|---|---|---|
| `@osdlc/intersect` (reference) | TypeScript | `packages/ts/intersect` |
| `glob-intersect` | Rust | `packages/rust/glob-intersect` |

`suite.json` holds the cases, one section per operation: `parse`, the segment
core (`segments_*`, inputs already split into segment arrays), the path API
(`intersects`, `matches`, `which_match`, `overlapping`, `witness`), the
registry (`registry_*`) and the filesystem layer (`fs_*`). Each section's
`description` says what a case gives and takes. An error's `kind` is the
implementations' error code in lower case: `unsupported_syntax`,
`pattern_too_deep`, `duplicate_registry_id`, `io_error`.

An `fs_*` case builds its `tree`, `symlinks` and `unreadable` directories
under a new temp directory and runs there. A case with `symlinks` or
`unreadable` runs on `unix` only. A case with `unreadable` cannot run as root,
where mode 000 does not stop a read, and both runners report it as not run.

A witness is an exact string. It comes from a breadth-first search whose
queue order is part of the result: segments are tried in pattern order, and
among equal-length paths the first one found wins. An implementation copies
that order, or its witnesses differ from the suite's even when they are valid.

Write a new case's `input` by hand, then run

```sh
pnpm --filter @osdlc/intersect conformance:write
```

on Linux or macOS, not as root, to write its `expect` or `error`. Never write
those by hand.

Each implementation's README lists what it does that the other does not. The
suite does not compare error messages.
