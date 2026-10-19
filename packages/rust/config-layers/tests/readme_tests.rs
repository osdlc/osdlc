//! Every test name in the README's "Which test shows what" table exists in
//! the crate's tests or unit tests.

use std::fs;
use std::path::{Path, PathBuf};

const README: &str = include_str!("../README.md");

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).expect("readable directory") {
        let path = entry.expect("directory entry").path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

/// The backticked names in the last cell of each row of the table.
fn table_test_names() -> Vec<String> {
    let section = README
        .split("## Which test shows what")
        .nth(1)
        .expect("the README has a 'Which test shows what' section");
    let section = section.split("\n## ").next().unwrap_or(section);
    let mut names = Vec::new();
    for row in section.lines().filter(|l| l.starts_with('|')).skip(2) {
        let cell = row.trim_end_matches('|').rsplit('|').next().unwrap_or("");
        // Text outside backticks (such as a note in parentheses) is not a name.
        names.extend(
            cell.split('`')
                .skip(1)
                .step_by(2)
                .map(|n| n.trim().to_string()),
        );
    }
    names
}

#[test]
fn every_test_name_in_the_readme_table_exists() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut files = Vec::new();
    rust_files(&root.join("tests"), &mut files);
    rust_files(&root.join("src"), &mut files);
    let source: String = files
        .iter()
        .map(|f| fs::read_to_string(f).expect("readable source"))
        .collect::<Vec<_>>()
        .join("\n");

    let names = table_test_names();
    assert!(!names.is_empty(), "the scan found no names in the table");
    for name in &names {
        let found = source.lines().any(|l| {
            l.trim_start()
                .strip_prefix("fn ")
                .is_some_and(|r| r.starts_with(name.as_str()) && r[name.len()..].starts_with('('))
        });
        assert!(
            found,
            "README names a test `{name}` that no `fn {name}` defines"
        );
    }
}
