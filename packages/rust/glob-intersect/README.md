# glob-intersect

Path-pattern overlap engine: do two globs share a common matching path?
A pure core (segment automaton + synchronized product) that produces a
witness path for every overlap, plus an optional filesystem layer.

This is the Rust peer of [`@osdlc/intersect`](../../ts/intersect). Both run
the same conformance corpus, `packages/ts/intersect/fixtures/*.cases.json`,
which this crate's tests read in place. A change to the corpus runs against
both. `packages/ts/intersect/fixtures/README.md` describes its layout.

Every function that reads a pattern returns `Result<_, Error>`. A pattern with
unsupported syntax (number ranges, a `{...}` or `[...]` that holds a `/`,
extglobs) or with `{` groups nested more than 64 deep is refused, and
`Error::code()` gives the same code string as the TypeScript package. The path
given to `matches` and `which_match` is read as a literal name, not a glob.

## Install

Not on crates.io yet. When it is:

```sh
cargo add glob-intersect
```

## Quick start

```rust
use glob_intersect::{Options, intersects, witness};

let o = Options::default();
assert!(intersects(&["src/**/*.ts"], &["src/api/handler.ts"], o)?);
assert!(!intersects(&["src/api/**"], &["src/web/**"], o)?);
assert_eq!(
    witness(&["src/api/**"], &["src/**/handler.ts"], o)?.as_deref(),
    Some("src/api/handler.ts"),
);
# Ok::<(), glob_intersect::Error>(())
```

## License

Licensed under either of MIT ([LICENSE-MIT](LICENSE-MIT)) or Apache-2.0
([LICENSE-APACHE](LICENSE-APACHE)), at your option.
