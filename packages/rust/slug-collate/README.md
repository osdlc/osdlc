# slug-collate

Slugify, and a deterministic order for strings and paths, for Rust.

Two jobs come up together when software turns human text into files and lists.
First, a title becomes a filename or an id: `slugify` lowercases it, folds
accents and replaces the rest with a separator. Second, those files and titles
get sorted, and the sort has to be the same on every machine. `compare` gives a
fixed order that does not depend on the host locale.

`slugify` folds accents. It normalises with NFKC, splits the combining marks
off their letters and drops only the ones that are optional decoration, so
`café` becomes `cafe`, not `caf`. A naive `[^a-z0-9]` filter would drop the
whole accented letter and collapse `Ärzte` and `Rzte` to one slug, a filename
collision in a folder a person reads. The dropped marks are the Latin, Greek
and Cyrillic diacritics, Hebrew niqqud and cantillation, and Arabic harakat.
Every other mark stays in the word with its letter, because it tells words
apart: kana voicing marks (`ガイド` is not `カイト`), Indic viramas and vowel
signs (`नमस्ते` stays one word), Thai tone and vowel marks. A mark never
splits a word or becomes a separator, a length cap never cuts a letter off its
marks, and each word comes out in NFC, so Hangul stays in precomposed
syllables.

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

// Slugify a title. Accents fold off the letter rather than dropping it, and
// marks that tell words apart stay.
assert_eq!(slugify("Café au Lait"), "cafe-au-lait");
assert_eq!(slugify("ガイド"), "ガイド");
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

## Migrating from 0.1

0.2 changes the slug of most titles that carry combining marks outside Latin,
Greek and Cyrillic. (0.1.2, now yanked, already had this change by mistake.
Coming from 0.1.2, nothing changes.) In 0.1.1 a mark such as the kana voicing
mark, the Devanagari virama, a Thai tone mark or Hebrew cantillation became a
separator, so `ガイド` slugged to `カ-イト` and `नमस्ते` to `नमस-ते`. Hangul came
out as decomposed jamo. Hebrew niqqud and Arabic harakat were kept, where 0.2
drops them. Latin and ASCII titles slug as before, and `compare`,
`compare_paths` and `path_sort_key` order exactly as before.

If you store slugs (as filenames, ids or URLs), keep the stored ones as they
are rather than regenerating them from titles, or a non-Latin title's file,
link or URL moves. Use the new rules only for slugs you create from now on.
If you look a stored entry up by slugging its title, match on the stored slug
instead, or fall back to it when the new slug finds nothing.

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
