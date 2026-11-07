//! The README's list of experimental items and the `**Experimental.**` markers
//! in the source name the same items.

use std::collections::BTreeSet;
use std::path::Path;

const MARKER: &str = "**Experimental.**";

/// The names in the README's Stability list (`- \`Type::item\``), last segment only.
fn readme_items() -> BTreeSet<String> {
    let readme = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("README.md"))
        .expect("README.md");
    let section = readme
        .split("\n## Stability\n")
        .nth(1)
        .expect("a Stability section")
        .split("\n## ")
        .next()
        .unwrap_or_default();
    section
        .lines()
        .filter_map(|l| l.strip_prefix("- `")?.split('`').next())
        .map(|item| item.rsplit("::").next().unwrap_or(item).to_owned())
        .collect()
}

/// The item each marker documents: the next `fn`, `struct`, `enum` or `const`.
fn marked_items() -> BTreeSet<String> {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut found = BTreeSet::new();
    for entry in std::fs::read_dir(src).expect("src") {
        let text = std::fs::read_to_string(entry.expect("entry").path()).expect("source");
        let mut rest = text.as_str();
        while let Some(at) = rest.find(MARKER) {
            rest = &rest[at + MARKER.len()..];
            // Skip the rest of the marker's own line.
            let name = rest
                .lines()
                .skip(1)
                .map(str::trim_start)
                .find(|l| !l.starts_with("///") && !l.starts_with("#["))
                .and_then(|l| {
                    let l = l.trim_start_matches("pub ").trim_start_matches("async ");
                    let l = ["fn ", "struct ", "enum ", "const "]
                        .iter()
                        .find_map(|k| l.strip_prefix(k))?;
                    Some(
                        l.split(|c: char| !c.is_alphanumeric() && c != '_')
                            .next()?
                            .to_owned(),
                    )
                })
                .expect("an item after the marker");
            found.insert(name);
        }
    }
    found
}

#[test]
fn the_readme_lists_exactly_the_experimental_items() {
    assert_eq!(readme_items(), marked_items());
}
