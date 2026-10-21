---
id: T-04
type: task
state: open
created: 2026-10-20
---

# T-04: Rust 0.3.0 API

## Goal

The Rust crate `path-guard` ships the 0.3.0 shape that
[D-06](../decisions/D-06-api-makes-the-filesystem-visible.md) sets: a
`lexical` module, a `Guard` bound to one `Resolver`, absolute input, and the
split error kinds. The 0.2 root functions are removed.

## Today

`packages/rust/path-guard/src/lib.rs` holds every item at the crate root.
`resolve`, `contains` and `canonical_existing_prefix` use the real disk.
`resolve_with` and `contains_with` take a `Resolver`. `lexical_absolute`
reads cwd. `PathError::Escapes` covers a proved escape, a link loop or spent
budget, an empty root and a `to_relative` miss. The crate has no `is_under`.

## Approach

1. Split `lib.rs` into `lexical.rs` and `guard.rs`. The walk keeps its logic
   and becomes the body of the `Guard` methods.
2. Add `lexical::validate_relative`, `lexical::is_under` (returns
   `Result<bool, PathError>`), `lexical::absolute(path, cwd)` and
   `lexical::to_relative`.
3. Add `Guard<R: Resolver>` with `Guard::new(resolver)`, `Guard::std()`,
   `resolve`, `contains` (returns `Result<bool, PathError>`) and `real_path`
   (returns `Result<PathBuf, PathError>`).
4. Refuse relative input as D-06's Absolute input section lists: an empty
   root is `EmptyRoot`, any other relative argument is `NotAbsolute`.
5. Add the `PathError` variants `Unresolvable`, `EmptyRoot`, `NotUnderRoot`
   and `NotAbsolute`. Return each where D-06 says.
6. Remove `validate_relative`, `to_relative`, `lexical_absolute`,
   `canonical_existing_prefix`, `resolve`, `contains`, `resolve_with` and
   `contains_with` from the crate root. Add no `#[deprecated]` wrapper, alias
   or re-export for them, as the
   [no-legacy-APIs principle](../../../../../README.md#breaking-changes)
   requires.
7. Refuse Windows names as D-06's Windows names section says. Add the
   `PathError` variants `ReservedName` and `AlternateStream`, the
   `PathWarning` and `PathWarningKind` types, `Guard::with_warning_handler`,
   `lexical::validate_relative_warn` and `lexical::validate_relative_for`. The
   default platform is `cfg!(windows)`. The crate writes nothing to the
   console.

## Acceptance criteria

- [ ] The crate version is 0.3.0.
- [ ] The `lexical` module and `Guard` exist as D-06's target table shows.
- [ ] `PathError` has the four new variants and stays `#[non_exhaustive]`.
- [ ] Every 0.2 root function is removed, and no `#[deprecated]` item
      remains in the crate.
- [ ] On Windows, `validate_relative` refuses reserved device names (case
      insensitive, with or without an extension, with trailing dots or
      spaces) as `ReservedName` and `name:stream` segments as
      `AlternateStream`. On other platforms it accepts them and calls the
      warning handler. Tests cover both platforms through
      `validate_relative_for`.
- [ ] With no handler set, nothing is printed.
- [ ] The parity suite passes against the 0.3.0 fixture
      ([T-06](T-06-parity-fixture-0-3-0.md)).
- [ ] `cargo semver-checks` expects the 0.3.0 bump.
- [ ] The README and CHANGELOG describe the new shape, each moved item and
      its replacement, and name the TS twin version.
- [ ] The PR links the TS PR ([T-05](T-05-ts-0-3-0-api.md)), as the
      [twin rule](../../../../../README.md#twin-libraries) asks.
