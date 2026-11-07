//! The README's list of experimental items and the `**Experimental.**` markers
//! in the source name the same items.

use std::collections::BTreeSet;
use std::path::Path;

const MARKER: &str = "**Experimental.**";

/// The names in the README's Stability list (`- \`Type::item\``), last segment only.
fn readme_items() -> BTreeSet<String> {
    let readme = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("README.md"))
        .expect("README.md");
    // `lines()` also strips the `\r` of a CRLF checkout.
    readme
        .lines()
        .skip_while(|l| *l != "## Stability")
        .skip(1)
        .take_while(|l| !l.starts_with("## "))
        .filter_map(|l| l.strip_prefix("- `")?.split('`').next())
        .map(|item| item.rsplit("::").next().unwrap_or(item).to_owned())
        .collect()
}

/// The item each marker documents: the name in the next line that is not a doc
/// comment or an attribute (`pub fn with_label(` gives `with_label`).
fn marked_items() -> BTreeSet<String> {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut found = BTreeSet::new();
    for entry in std::fs::read_dir(src).expect("src") {
        let text = std::fs::read_to_string(entry.expect("entry").path()).expect("source");
        let lines: Vec<&str> = text.lines().map(str::trim_start).collect();
        for (i, line) in lines.iter().enumerate() {
            if !line.contains(MARKER) {
                continue;
            }
            let item = lines[i + 1..]
                .iter()
                .find(|l| !l.starts_with("///") && !l.starts_with("#["))
                .expect("an item after the marker");
            let name = item
                .split_whitespace()
                .find(|w| !matches!(*w, "pub" | "async" | "fn" | "struct" | "enum" | "const"))
                .expect("an item name");
            let name = name
                .split(|c: char| !c.is_alphanumeric() && c != '_')
                .next();
            found.insert(name.expect("a name").to_owned());
        }
    }
    found
}

#[test]
fn the_readme_lists_exactly_the_experimental_items() {
    assert_eq!(readme_items(), marked_items());
}
