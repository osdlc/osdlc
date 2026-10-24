//! Split a note, edit its frontmatter, compose it again byte for byte, and
//! build a note from scratch.
//!
//! Run with `cargo run --example roundtrip`.

use frontmatter_lossless::{NewShapeOptions, OpenEol, compose, new_shape, split};

fn main() {
    // A note with CRLF fences and a title to change.
    let note = "---\r\ntitle: Old\r\n---\r\n# Heading\r\n";

    let s = split(note);
    println!("yaml: {:?}", s.yaml); // Some("title: Old\r")
    println!("body: {:?}", s.body); // "# Heading\r\n"
    println!("shape: {:?}", s.shape);

    // Pass split's parts straight back and the original comes out byte for byte.
    assert_eq!(compose(s.yaml, s.body, s.shape), note);
    println!(
        "round trip is byte-exact: {}",
        compose(s.yaml, s.body, s.shape) == note
    );

    // Change the YAML text. The CRLF fences survive the edit.
    let new_yaml = s.yaml.unwrap().replace("Old", "New");
    let edited = compose(Some(&new_yaml), s.body, s.shape);
    println!("edited: {edited:?}"); // "---\r\ntitle: New\r\n---\r\n# Heading\r\n"
    assert_eq!(edited, "---\r\ntitle: New\r\n---\r\n# Heading\r\n");

    // Build a note from scratch, with no source to split. Trim the trailing
    // newline a YAML serializer adds, so the block does not end in a blank line.
    let yaml = "title: Fresh\ntags: [a, b]\n";
    let fresh = compose(
        Some(yaml.trim_end_matches('\n')),
        "# Fresh\n",
        new_shape(NewShapeOptions {
            eol: OpenEol::Lf,
            bom: false,
        }),
    );
    println!("fresh: {fresh:?}");
    assert_eq!(fresh, "---\ntitle: Fresh\ntags: [a, b]\n---\n# Fresh\n");
}
