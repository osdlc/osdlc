//! Read the inline tags of a note body under each dialect.

use markdown_tags::{TagDialect, extract_both, inline_tags, tag_at};

fn main() {
    let body = "#santé and (#draft) #2024\n\n```\n#nottag\n```\n";

    for dialect in TagDialect::ALL {
        println!("{dialect:9} {:?}", inline_tags(body, dialect));
    }

    // The pair a search index and a link graph read.
    let (unicode, ascii) = extract_both(body);
    println!("unicode {unicode:?}\nascii   {ascii:?}");

    // One tag at a byte offset, with no code or link blanking.
    assert_eq!(
        tag_at(body, 0, TagDialect::Obsidian).as_deref(),
        Some("santé")
    );

    // A setting value names a dialect, by `as_str`, and a wrong name fails
    // with a `ParseTagDialectError` that lists the accepted ones.
    let dialect: TagDialect = "ascii".parse().expect("a known dialect");
    assert_eq!(dialect, TagDialect::Ascii);
    assert_eq!(dialect.as_str(), "ascii");
    let error = "Ascii".parse::<TagDialect>().expect_err("names are exact");
    println!("{error}");
}
