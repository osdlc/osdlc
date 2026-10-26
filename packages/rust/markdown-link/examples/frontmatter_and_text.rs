//! Typed references, display text and link-target helpers.

use markdown_link::{
    display_text, normalize_target, parse_typed_ref, percent_decode, strip_md_ext,
};

fn main() {
    // A frontmatter value naming one note of a known type.
    let typed = parse_typed_ref("[[location/home|Home]]").expect("typed ref");
    println!(
        "kind={} slug={} alias={:?}",
        typed.kind, typed.slug, typed.alias
    );

    // What a reader sees for each link, for snippets and search.
    println!(
        "{}",
        display_text("Visit [[Home|my home]], see ![[map.png|300]] and [[Notes#Todo]].")
    );

    // Normalising a target to an index key.
    println!("{}", normalize_target("./Notes//My%20Note.MD"));
    println!("{} / {}", percent_decode("a%20b"), strip_md_ext("Note.MD"));
}
