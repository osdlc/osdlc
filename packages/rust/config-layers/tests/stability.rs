//! Every public item declares its stability, and the README's Stability
//! section names every one.

const MODULES: [(&str, &str); 6] = [
    ("lib", include_str!("../src/lib.rs")),
    ("file", include_str!("../src/file.rs")),
    ("machine", include_str!("../src/machine.rs")),
    ("needs", include_str!("../src/needs.rs")),
    ("paths", include_str!("../src/paths.rs")),
    ("value", include_str!("../src/value.rs")),
];
const README: &str = include_str!("../README.md");

/// Top-level public items (`pub fn`, `pub struct`, `pub enum`, `pub type`,
/// `pub use`) by name, each with its doc block.
fn public_items() -> Vec<(String, String)> {
    let mut items = Vec::new();
    for (_, source) in MODULES {
        let lines: Vec<&str> = source.lines().collect();
        for (i, line) in lines.iter().enumerate() {
            let Some(rest) = [
                "pub fn ",
                "pub struct ",
                "pub enum ",
                "pub type ",
                "pub use ",
            ]
            .iter()
            .find_map(|prefix| line.strip_prefix(prefix)) else {
                continue;
            };
            let end = rest
                .find(|c: char| !(c.is_alphanumeric() || c == '_'))
                .unwrap_or(rest.len());
            let docs: Vec<&str> = lines[..i]
                .iter()
                .rev()
                .take_while(|l| l.starts_with("///") || l.starts_with("#["))
                .copied()
                .collect();
            items.push((rest[..end].to_string(), docs.join("\n")));
        }
    }
    items
}

#[test]
fn every_public_item_declares_its_stability() {
    let items = public_items();
    assert!(!items.is_empty(), "the scan found no public items");
    for (name, docs) in &items {
        assert!(
            docs.contains("**Stability:**"),
            "{name} has no **Stability:** line in its docs"
        );
    }
}

#[test]
fn the_readme_lists_every_public_item() {
    let section = README
        .split("## Stability")
        .nth(1)
        .expect("README has a Stability section")
        .split("\n## ")
        .next()
        .unwrap();
    for (name, _) in public_items() {
        assert!(
            section.contains(&format!("`{name}`")),
            "README Stability section does not name `{name}`"
        );
    }
}
