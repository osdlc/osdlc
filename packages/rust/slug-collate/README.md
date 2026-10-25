# slug-collate

Slugify, and a deterministic order for strings and paths, for Rust.

Two jobs come up together when software turns human text into files and lists.
First, a title becomes a filename or an id: `slugify` lowercases it, folds
accents and replaces the rest with a separator. Second, those files and titles
get sorted, and the sort has to be the same on every machine. `compare` gives a
fixed order that does not depend on the host locale.

`slugify` folds accents. It normalises with NFKD and drops the combining
marks, so `café` becomes `cafe`, not `caf`. A naive
`[^a-z0-9]` filter would drop the whole accented letter and collapse `Ärzte`
and `Rzte` to one slug, a filename collision in a folder a person reads.
Only the combining-diacritic blocks are dropped (`U+0300`-`U+036F`,
`U+1AB0`-`U+1AFF`, `U+1DC0`-`U+1DFF`, `U+20D0`-`U+20FF`, `U+FE20`-`U+FE2F`).
Other scripts' marks that are not alphabetic, such as the Devanagari virama,
Hebrew cantillation or Thai tone marks, become separators.

`compare` is a substitute for JavaScript's `localeCompare`.
`localeCompare` depends on ICU data and the host locale, so two machines can
disagree about order, and that order sometimes ends up hashed or rendered.
`compare` is case-insensitive and accent-folded, with ties broken by the raw
bytes, so the order is total and the same everywhere.

It is for programs that generate filenames and ids from titles and need the
resulting order to be stable across machines: static-site generators, note and
file tools, anything that commits a sorted list to disk.

## Install

```sh
cargo add slug-collate
```

## Quick start

```rust
use slug_collate::{compare, compare_paths, slugify, slugify_with, SlugOptions};
use std::cmp::Ordering;

// Slugify a title. Accents fold through NFKD, not by dropping the letter.
assert_eq!(slugify("Café au Lait"), "cafe-au-lait");
assert_eq!(slugify("Sam's Note"), "sams-note");

// Configure the options with a constructor, then set fields. SlugOptions is
// #[non_exhaustive], so a struct literal will not compile outside the crate.
let mut opts = SlugOptions::new();
opts.separator = '_';
opts.max_len = Some(11);
assert_eq!(slugify_with("Hello World Again", &opts), "hello_world");

// A total order that folds case and accents but still orders everything.
assert_eq!(compare("café", "cafe"), Ordering::Greater);
assert_eq!(compare("Zebra", "apple"), Ordering::Greater);

// Paths compare segment by segment, so `a/b` sorts before `a-b/c`.
assert_eq!(compare_paths("a/b", "a-b/c"), Ordering::Less);
```

For caching the collation key across a sort, use `path_sort_key` with
`slice::sort_by_cached_key`: it builds each path's key once and sorts to
exactly `compare_paths`' order.

## When not to use it

- You need real locale-aware ordering, such as German phone-book order,
  Swedish `å ä ö` after `z`, or other locale-specific rules. Use
  `icu_collator` or `feruca`. `compare` is not locale-aware, by design.
- You need the Unicode Collation Algorithm. `compare` is a simpler fold, not
  the UCA.
- You want a slug library with transliteration tables (`Ж` to `zh`, emoji to
  words). This crate keeps non-Latin letters as they are. It does not romanise
  them.

## Compared with other crates

Slugify:

| Crate | Note |
|---|---|
| `slug` | Transliterates to ASCII. Non-Latin scripts are romanised, not kept. |
| `slugify` | A macro with similar options. |
| `slugify-rs` | Transliteration and a max-length option. |

Collation:

| Crate | Note |
|---|---|
| `icu_collator` | Real ICU collation, locale-aware, Unicode data. |
| `feruca` | The Unicode Collation Algorithm. |

`slug-collate` exists for the narrow case those crates do not aim at: a
deterministic, portable, non-locale order, paired with a filename-safe slug
that keeps non-Latin letters instead of transliterating them. It depends only
on `unicode-normalization`.

## Platforms

Any target the Rust standard library supports. The crate has no
platform-specific code.

## Stability

The crate stays on 0.x for now. Every public item
(`slugify`, `slugify_with`, `SlugOptions`, `compare`, `compare_paths`,
`path_sort_key`) is stable in 0.x. `SlugOptions` is `#[non_exhaustive]`, so a
later release can add a field without a breaking change. Build it with
`SlugOptions::new()` or `SlugOptions::with_max_len(n)` and set fields, never a
struct literal.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT License](LICENSE-MIT), at your option.
