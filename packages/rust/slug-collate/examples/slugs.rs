//! Slugify titles and sort them with the deterministic collation.
//!
//! Run with `cargo run --example slugs`. It slugifies a few titles with the
//! default rules and with a configured `SlugOptions`, then shows the portable
//! string and path order.

use std::cmp::Ordering;

use slug_collate::{SlugOptions, compare, compare_paths, slugify, slugify_with};

fn main() {
    // Default rules: lowercase, fold accents through NFKD, drop apostrophes.
    for title in ["Café au Lait", "Sam's Note", "Привет мир"] {
        println!("{title:>14} -> {}", slugify(title));
    }

    // A configured SlugOptions. It is #[non_exhaustive], so build it with a
    // constructor and set fields, never a struct literal.
    let mut opts = SlugOptions::new();
    opts.separator = '_';
    opts.max_len = Some(11);
    opts.drop_apostrophes = false;
    println!(
        "configured    -> {}",
        slugify_with("Hello World Again", &opts),
    );

    // Deterministic string order: folds case and accents, but total.
    let mut titles = vec!["Zebra", "apple", "Apple", "éclair", "eclair", "banana"];
    titles.sort_by(|a, b| compare(a, b));
    println!("sorted: {titles:?}");
    assert_eq!(compare("Zebra", "apple"), Ordering::Greater);

    // Paths compare segment by segment, so `a/b` sorts before `a-b/c`.
    let mut paths = vec!["a-b/c", "a/b", "Notes/b.md", "Notes/a.md", "Notes"];
    paths.sort_by(|a, b| compare_paths(a, b));
    println!("paths:  {paths:?}");
    assert_eq!(compare_paths("a/b", "a-b/c"), Ordering::Less);
}
