---
id: T-07
type: task
state: open
created: 2026-10-20
---

# T-07: Terms for 0.3.0

## Goal

The terms in [`terms/`](../terms/) describe the 0.3.0 API that
[D-06](../decisions/D-06-api-makes-the-filesystem-visible.md) sets.

## Today

The terms name 0.2 exports and the 0.2 meaning of `escapes`:

- [TM-02](../terms/TM-02-lexical.md) (Lexical) names `isInside` as a lexical
  check and says it depends on the platform.
- [TM-03](../terms/TM-03-path-containment.md) (Path containment) names
  `contains`, `resolveInside` and the Rust `_with` functions.
- [TM-04](../terms/TM-04-escape.md) (Escape) says `escapes` also covers an
  empty root, more than `MAX_LINK_HOPS` links and a spent call budget, and
  that `toRelative` throws it.
- [TM-07](../terms/TM-07-real-path.md) (Real path) names
  `canonicalExistingPrefix`.
- [TM-08](../terms/TM-08-path-resolver.md) (Path resolver) says
  `nodeResolver` is the default for `resolveInside` and `contains`.

## Approach

1. Rewrite TM-02, TM-03, TM-04, TM-07 and TM-08 to the 0.3.0 names and kinds.
2. Add a term for an unresolvable path: containment cannot be proved, kind
   `unresolvable`.
3. Add a term for a guard: a `PathGuard` (Rust: `Guard`) bound to one path
   resolver.
4. Add a term for a partial real path, or fold it into TM-07: what
   `guard.realPath` returns, with `..` folded as text when the walk gives up.
5. Add a term for a reserved name: a Windows device name such as `NUL`,
   refused on Windows as `reserved_name`. Add a term for a path warning: the
   kind and segment sent to `onWarning` when a path is fine here and means
   something else on Windows. Add a term for an alternate data stream: a
   `name:stream` suffix that names a stream of a file on Windows,
   `alternate_stream`.
6. Land the terms in the same release as [T-05](T-05-ts-0-3-0-api.md).

## Acceptance criteria

- [ ] No term names a removed 0.2 export except as history.
- [ ] TM-04 covers only a proved escape and points to the new kinds.
- [ ] Terms exist for an unresolvable path, a guard, a reserved name, an
      alternate data stream and a path warning.
- [ ] The planning README lists the new terms.
