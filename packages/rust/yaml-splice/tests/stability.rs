//! The README's stability lists agree with the `**Stability:**` markers in the
//! item docs.
//!
//! A stable item carries `/// **Stability:** stable in 0.x` and is listed on
//! the README's "Stable in 0.x:" line. An unstable module carries
//! `//! **Stability:** unstable` and an unstable item `/// **Stability:**
//! unstable`; both are listed under the README's "Unstable" bullets, an item
//! as `module::name`.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

fn ticked(line: &str) -> Vec<String> {
    line.split('`')
        .skip(1)
        .step_by(2)
        .map(str::to_string)
        .collect()
}

fn readme_lists() -> (BTreeSet<String>, BTreeSet<String>) {
    let readme = fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("README.md"))
        .expect("README.md is readable")
        // A Windows checkout may convert the README to CRLF.
        .replace("\r\n", "\n");
    let section = readme
        .split("\n## Stability\n")
        .nth(1)
        .expect("the README has a Stability section");
    let section = section.split("\n## ").next().unwrap_or(section);

    let mut stable = BTreeSet::new();
    let mut unstable = BTreeSet::new();
    let mut in_unstable = false;
    let mut in_stable = false;
    for line in section.lines() {
        // The "Stable in 0.x:" paragraph may wrap over several lines.
        if let Some(rest) = line.strip_prefix("Stable in 0.x:") {
            in_stable = true;
            stable.extend(ticked(rest));
        } else if in_stable && !line.trim().is_empty() {
            stable.extend(ticked(line));
        } else if line.starts_with("Unstable") {
            in_unstable = true;
        } else if in_unstable && line.starts_with("- ") {
            unstable.extend(ticked(line).into_iter().take(1));
        }
        if line.trim().is_empty() {
            in_stable = false;
        }
    }
    (stable, unstable)
}

fn source_markers() -> (BTreeSet<String>, BTreeSet<String>) {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut stable = BTreeSet::new();
    let mut unstable = BTreeSet::new();
    for entry in fs::read_dir(&src).expect("src is readable") {
        let path = entry.expect("a directory entry").path();
        let module = path.file_stem().unwrap().to_string_lossy().to_string();
        let text = fs::read_to_string(&path).expect("a source file is readable");
        let lines: Vec<&str> = text.lines().collect();
        for (i, line) in lines.iter().enumerate() {
            let line = line.trim();
            if line.starts_with("//! **Stability:** unstable") {
                unstable.insert(module.clone());
                continue;
            }
            let is_stable = if line.starts_with("/// **Stability:** stable in 0.x") {
                true
            } else if line.starts_with("/// **Stability:** unstable") {
                false
            } else {
                continue;
            };
            let name = lines[i + 1..]
                .iter()
                .find_map(|l| item_name(l.trim()))
                .unwrap_or_else(|| panic!("no item after the marker at {module}.rs:{}", i + 1));
            if is_stable {
                stable.insert(name);
            } else {
                unstable.insert(format!("{module}::{name}"));
            }
        }
    }
    (stable, unstable)
}

fn item_name(line: &str) -> Option<String> {
    for prefix in ["pub fn ", "pub const fn ", "pub struct ", "pub enum "] {
        if let Some(rest) = line.strip_prefix(prefix) {
            let name: String = rest
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '_')
                .collect();
            return Some(name);
        }
    }
    None
}

#[test]
fn the_readme_lists_match_the_markers() {
    let (readme_stable, readme_unstable) = readme_lists();
    let (src_stable, src_unstable) = source_markers();
    assert!(
        !readme_stable.is_empty(),
        "the README lists no stable items"
    );
    assert_eq!(readme_stable, src_stable, "stable items: README vs markers");
    assert_eq!(
        readme_unstable, src_unstable,
        "unstable items: README vs markers"
    );
}
