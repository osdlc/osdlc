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
`lexical` module, a `Guard` bound to one `Resolver`, and the split error
kinds. The 0.2 root functions stay as deprecated wrappers.

## Today

`packages/rust/path-guard/src/lib.rs` holds every item at the crate root.
`resolve` and `contains` use the real disk. `resolve_with` and
`contains_with` take a `Resolver`. `lexical_absolute` reads cwd.
`PathError::Escapes` covers a proved escape, a link loop or spent budget, an
empty root and a `to_relative` miss.

## Approach

1. Split `lib.rs` into `lexical.rs` and `guard.rs`. Keep the walk as the body
   of the `Guard` methods.
2. Add `lexical::validate_relative`, `lexical::is_under`,
   `lexical::absolute(path, cwd)` and `lexical::to_relative`. A relative path
   where an absolute one is required returns `PathError::NotAbsolute`.
3. Add `Guard<R: Resolver>` with `Guard::new(resolver)`, `Guard::std()`,
   `resolve`, `contains` and `real_path`.
4. Add the `PathError` variants `Unresolvable`, `EmptyRoot`, `NotUnderRoot`
   and `NotAbsolute`. Return each where D-06 says.
5. Keep `validate_relative`, `to_relative`, `lexical_absolute`,
   `canonical_existing_prefix`, `resolve`, `contains`, `resolve_with` and
   `contains_with` at the root as `#[deprecated]` wrappers over the new items.
6. Apply the owner's answers to D-06's open questions.

## Acceptance criteria

- [ ] The crate version is 0.3.0.
- [ ] The `lexical` module and `Guard` exist as D-06's target table shows.
- [ ] `PathError` has the four new variants and stays `#[non_exhaustive]`.
- [ ] Every 0.2 root function is a `#[deprecated]` wrapper whose note names
      its replacement.
- [ ] The parity suite passes against the 0.3.0 fixture
      ([T-06](T-06-parity-fixture-0-3-0.md)).
- [ ] `cargo semver-checks` expects the 0.3.0 bump.
- [ ] The README and CHANGELOG describe the new shape, each moved item and
      its replacement, and name the TS twin version.
- [ ] The PR links the TS PR ([T-05](T-05-ts-0-3-0-api.md)), as the
      [twin rule](../../../../../README.md#twin-libraries) asks.
