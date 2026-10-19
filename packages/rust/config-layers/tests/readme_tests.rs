//! Every test name in the README's "Which test shows what" table exists in
//! the crate's integration or unit tests as a `#[test]` function. The table
//! lists no doctests or helpers.

use std::collections::HashSet;
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

/// Splits a table row into cells; a `|` inside backticks does not split.
fn cells(row: &str) -> Vec<String> {
    let mut cells = vec![String::new()];
    let mut in_code = false;
    for c in row
        .trim()
        .trim_start_matches('|')
        .trim_end_matches('|')
        .chars()
    {
        match c {
            '`' => {
                in_code = !in_code;
                cells.last_mut().unwrap().push(c);
            }
            '|' if !in_code => cells.push(String::new()),
            _ => cells.last_mut().unwrap().push(c),
        }
    }
    cells
}

/// The backticked names in the last cell of each row of the table.
fn table_test_names() -> Vec<String> {
    let section = README
        .split("## Which test shows what")
        .nth(1)
        .expect("the README has a 'Which test shows what' section");
    let section = section.split("\n## ").next().unwrap_or(section);
    let mut rows = section.lines().filter(|l| l.starts_with('|'));
    let separator = rows.position(|l| l.starts_with("|---"));
    assert!(separator.is_some(), "the table has no `|---` separator row");
    let mut names = Vec::new();
    for row in rows {
        let cells = cells(row);
        assert_eq!(cells.len(), 2, "row does not have two cells: {row}");
        // Text outside backticks (such as a note in parentheses) is not a name.
        names.extend(
            cells[1]
                .split('`')
                .skip(1)
                .step_by(2)
                .map(|n| n.trim().to_string()),
        );
    }
    names
}

/// Names of functions whose preceding line is `#[test]`.
fn defined_tests(source: &str) -> HashSet<String> {
    let lines: Vec<&str> = source.lines().map(str::trim).collect();
    let mut tests = HashSet::new();
    for pair in lines.windows(2) {
        if pair[0] != "#[test]" {
            continue;
        }
        if let Some(rest) = pair[1].strip_prefix("fn ") {
            let end = rest.find('(').unwrap_or(rest.len());
            tests.insert(rest[..end].to_string());
        }
    }
    tests
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
    let tests = defined_tests(&source);

    let names = table_test_names();
    assert!(!names.is_empty(), "the scan found no names in the table");
    for name in &names {
        assert!(
            tests.contains(name),
            "README names a test `{name}` that no `#[test] fn {name}` defines"
        );
    }
}
