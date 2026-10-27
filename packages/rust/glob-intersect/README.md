# glob-intersect

Do two globs share a common matching path?

Most glob crates test one path against one pattern. This crate compares two
patterns with each other. It tells you whether some path could match both,
and returns an example of such a path (a witness).

It is for tools that need to find overlap between sets of paths: detecting that
two tasks claim the same files, finding which rules apply to a folder, or
checking that two ignore lists do not collide. The patterns do not need to
match files that exist. It is not a full glob dialect, and not a tool for
filtering a list of files; use [`globset`](https://crates.io/crates/globset)
for that.

This is the Rust twin of the npm package
[`@osdlc/intersect`](https://www.npmjs.com/package/@osdlc/intersect). The
crate is named `glob-intersect` because `intersect` is taken on crates.io; the
library is `glob_intersect`.

## Install

```sh
cargo add glob-intersect
```

The `fs` feature (on by default) adds the filesystem layer and its one
dependency, `walkdir`. For the pure core alone:

```sh
cargo add glob-intersect --no-default-features
```

## Quick start

```rust
use glob_intersect::{Error, Options, intersects, witness};

fn main() -> Result<(), Error> {
    let o = Options::default();
    // No wildcards: an exact path. A subtree is written `/**`.
    assert!(!intersects(&["src/components"], &["src/components/Button.vue"], o)?);
    assert!(intersects(&["src/components/**"], &["src/components/Button.vue"], o)?);

    assert!(!intersects(&["src/api/**"], &["src/web/**"], o)?);
    assert_eq!(
        witness(&["src/api/**"], &["src/**/handler.ts"], o)?.as_deref(),
        Some("src/api/handler.ts"),
    );
    Ok(())
}
```

`cargo run -p glob-intersect --example overlap` runs a longer example.

## Modules

| Module | What it is |
|---|---|
| the crate root | Overlap checks on glob strings: `intersects`, `matches`, `which_match`, `overlapping`, `witness`, `compile` / `Matcher`, `parse`. |
| `registry` | `index` builds a `Registry` of labeled pattern sets; `applicable_to` and `matching` ask which apply. |
| `segments` | The engine, on patterns already split into segments. |
| `fs` | `files_in_scope` and `resolve_intersection` against a real folder (the `fs` feature). |

Every function that reads a pattern returns `Result<_, Error>`. A pattern with
unsupported syntax (number ranges, a `{...}` or `[...]` that holds a `/`,
extglobs) or with `{` groups nested more than 64 deep is refused, and
`Error::code()` gives the same code string as the TypeScript package. The path
given to `matches` and `which_match` is read as a literal name, not a glob.
`@osdlc/intersect`'s README documents the supported syntax; it is the same
here.

## Twin with `@osdlc/intersect`

Both twins run the same conformance corpus, `@osdlc/intersect`'s
`fixtures/*.cases.json`. This crate's `tests/conformance.rs` reads it in place
from `packages/ts/intersect/fixtures/`, so a behaviour change in either twin
fails the other's tests.

The differences follow each language's idiom:

- Options are always passed: every function takes `Options` (it is `Copy`),
  and the `fs` functions take `FsOptions`. Patterns are always a slice; the
  TypeScript package also takes a single string.
- The `fs` functions are synchronous.
- Errors are `Result<_, Error>`. TypeScript's `INVALID_ARGUMENT` code has no
  Rust variant, since the types rule out a non-string argument.

One-sided exports, in Rust only:

- `SEPARATOR` and `parse_with(path, separator)` (TypeScript passes the
  separator as an option to `parse`).
- `Matcher::new` (the same as `compile`), and `Matcher::patterns` and
  `Matcher::options` to read a compiled matcher back.
- `Labeled::new` to build a registry entry.

## License

Licensed under either of [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE),
at your option.
