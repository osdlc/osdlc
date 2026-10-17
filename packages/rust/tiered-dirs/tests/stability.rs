//! Every public item declares its stability, and the README's Stability
//! section names every one.

const LIB: &str = include_str!("../src/lib.rs");
const README: &str = include_str!("../README.md");

/// Top-level public items, by name: `pub fn`, `pub struct`, `pub enum` and
/// `macro_rules!` (written `env_vars!`), each with its doc block.
fn public_items() -> Vec<(String, String)> {
    let lines: Vec<&str> = LIB.lines().collect();
    let mut items = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        let name = ["pub fn ", "pub struct ", "pub enum ", "macro_rules! "]
            .iter()
            .find_map(|prefix| line.strip_prefix(prefix))
            .map(|rest| {
                let end = rest
                    .find(|c: char| !(c.is_alphanumeric() || c == '_'))
                    .unwrap_or(rest.len());
                let name = &rest[..end];
                if line.starts_with("macro_rules!") {
                    format!("{name}!")
                } else {
                    name.to_string()
                }
            });
        let Some(name) = name else { continue };
        let docs: Vec<&str> = lines[..i]
            .iter()
            .rev()
            .take_while(|l| l.starts_with("///") || l.starts_with("#["))
            .copied()
            .collect();
        items.push((name, docs.join("\n")));
    }
    items
}

#[test]
fn every_public_item_declares_its_stability() {
    let items = public_items();
    assert!(items.len() >= 13, "found only {items:?}");
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
