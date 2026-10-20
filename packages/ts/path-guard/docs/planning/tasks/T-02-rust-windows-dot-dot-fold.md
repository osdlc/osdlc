---
id: T-02
type: task
state: open
created: 2026-10-19
---

# T-02: The Rust crate folds `..` as text on Windows

## Goal

On Windows the Rust crate `path-guard` judges the path Windows opens, as the
TypeScript package does ([D-03](../decisions/D-03-platforms.md)). The twins
then give the same answer there, as the
[twin rule](../../../../../README.md#twin-libraries) asks.

## Today

The crate's `walk` (`packages/rust/path-guard/src/lib.rs`) folds a `..` behind
a missing name against the real path of the part before it, on every platform.
That is the POSIX rule. Windows folds `..` as text before it follows a link, so
there the crate can judge a different path from the one Windows opens, and
accept a path that leaves the root.

An example. The root is `C:\v\r`, and `C:\v\r\link` is a link to
`C:\v\r\a\b\c`. The path `C:\v\r\link\m\..\..\..\x` does not exist yet. The
crate folds it against the link's target and gets `C:\v\r\a\x`, which is
inside. Windows folds it as text and creates `C:\v\x`, which is outside.

The parity suite in `tests/parity.rs` is `#[cfg(unix)]`, as are 12 of the
crate's 33 unit tests, so CI does not see this on `windows-latest`.

## Approach

1. Under `#[cfg(windows)]`, fold the path as text before `walk` and after each
   link it follows: drop `.`, and remove each `..` with the name before it. A
   `..` at a root stays there, and a leading `..` stays in a relative path and
   after a bare drive (`C:`). `foldText` in `packages/ts/path-guard/resolve.ts`
   is the TypeScript version.
2. Run the parity suite on Windows. For an on-disk case with a `..`, check the
   crate's answer against where the file system puts the path, as
   `tests/parity.test.ts` does, instead of the fixture's POSIX answer.
3. Add the example above as a Windows test.

## Acceptance criteria

- [ ] On Windows the crate folds `..` as text before it follows a link.
- [ ] The parity suite runs on `windows-latest` in `rust-ci.yml`.
- [ ] The example above is refused on Windows.
- [ ] D-03 and the crate's README no longer list the gap.
- [ ] A crate CHANGELOG entry names the fix.
