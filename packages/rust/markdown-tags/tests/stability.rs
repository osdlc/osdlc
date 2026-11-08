//! The public surface is pinned, and the README names every item and states
//! its code block holds. Changing the surface is a decision in a diff, not a
//! side effect.

use std::str::FromStr;

use markdown_tags::{ParseTagDialectError, TagDialect, extract_both, inline_tags, tag_at};

const README: &str = include_str!("../README.md");

/// Every public item, by the name the README uses for it.
const ITEMS: [&str; 7] = [
    "TagDialect",
    "ParseTagDialectError",
    "inline_tags",
    "extract_both",
    "tag_at",
    "ALL",
    "as_str",
];

#[test]
fn the_public_items_are_the_pinned_ones() {
    // A compile-time check that each item is public and has this shape.
    let _: fn(&str, TagDialect) -> Vec<String> = inline_tags;
    let _: fn(&str) -> (Vec<String>, Vec<String>) = extract_both;
    let _: fn(&str, usize, TagDialect) -> Option<String> = tag_at;
    let _: fn(&str) -> Result<TagDialect, ParseTagDialectError> = TagDialect::from_str;
    let _: [TagDialect; 3] = TagDialect::ALL;
    let _: fn(TagDialect) -> &'static str = TagDialect::as_str;
}

#[test]
fn the_readme_names_every_item() {
    let missing: Vec<&str> = ITEMS
        .into_iter()
        .filter(|item| !README.contains(&format!("`{item}`")))
        .collect();
    assert!(missing.is_empty(), "the README does not name {missing:?}");
}

#[test]
fn the_readme_states_the_stability_tier() {
    let stability = README
        .split("## Stability")
        .nth(1)
        .expect("the README has a Stability section");
    assert!(stability.contains("0.x"));
    assert!(stability.contains("#[non_exhaustive]"));
}
