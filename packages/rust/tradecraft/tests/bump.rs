//! `tradecraft bump` — the CLI spec's `bump` section, driven in-process the
//! way `tests/cli.rs` drives every other verb: [`run_with`] over a temp copy
//! of a vault, never a checked-in fixture mutated in place.

mod common;

use std::fs;
use std::path::{Path, PathBuf};

use common::with_machine_env;
use tradecraft::cli::run_with;
use tradecraft::ctx::CommandContext;

struct Run {
    code: i32,
    stdout: String,
    stderr: String,
}

/// One invocation, with the machine config relocated into `cwd` so the
/// developer's real one never leaks into a run — the same helper
/// `tests/cli.rs` uses.
fn run(argv: &[&str], cwd: &Path) -> Run {
    let owned: Vec<String> = argv.iter().map(|s| (*s).to_string()).collect();
    let mut out: Vec<u8> = Vec::new();
    let mut err: Vec<u8> = Vec::new();
    let code = with_machine_env(Some(&cwd.join("no-machine-config.yaml")), || {
        let mut ctx = CommandContext::new(cwd, &mut out, &mut err);
        run_with(&owned, &mut ctx)
    });
    Run {
        code,
        stdout: String::from_utf8(out).unwrap(),
        stderr: String::from_utf8(err).unwrap(),
    }
}

fn vault_str(vault: &Path) -> String {
    vault.display().to_string()
}

/// One plugin note, discoverable by structure alone —
/// `marketplaces/<mkt>/plugins/<plugin>/<plugin>.md` — the shape
/// the shared `freeform-vault` fixture's `core.md`
/// uses, with no `tc-kind` needed. `version_line` is spliced in as a whole
/// frontmatter line, or omitted for a note with no `tc-version` at all.
fn fixture(version_line: Option<&str>) -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join("vault");
    let plugin_dir = vault
        .join("marketplaces")
        .join("acme")
        .join("plugins")
        .join("widget");
    fs::create_dir_all(&plugin_dir).unwrap();
    let version = version_line.map(|v| format!("{v}\n")).unwrap_or_default();
    let note = format!(
        "---\nname: widget\ndescription: A plugin for bump tests.\n{version}---\n\nBody text, untouched by a bump.\n"
    );
    fs::write(plugin_dir.join("widget.md"), &note).unwrap();
    (dir, vault)
}

fn note_path(vault: &Path) -> PathBuf {
    vault
        .join("marketplaces")
        .join("acme")
        .join("plugins")
        .join("widget")
        .join("widget.md")
}

const REL: &str = "marketplaces/acme/plugins/widget/widget.md";

#[test]
fn dry_run_prints_old_arrow_new_and_leaves_the_note_untouched() {
    let (dir, vault) = fixture(Some("tc-version: 0.2.1"));
    let path = note_path(&vault);
    let before = fs::read(&path).unwrap();

    let result = run(
        &[
            "bump",
            "widget",
            "--minor",
            "--dry-run",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(result.stdout, format!("{REL}  0.2.1 \u{2192} 0.3.0\n"));
    let after = fs::read(&path).unwrap();
    assert_eq!(before, after, "dry-run must not touch the note's bytes");
}

#[test]
fn a_real_bump_rewrites_only_the_tc_version_line() {
    let (dir, vault) = fixture(Some("tc-version: 0.2.1"));
    let path = note_path(&vault);
    let before = fs::read_to_string(&path).unwrap();

    let result = run(
        &[
            "bump",
            "widget",
            "--minor",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        result.stdout,
        format!("{REL}  written · tc-version 0.2.1 -> 0.3.0\n")
    );

    let after = fs::read_to_string(&path).unwrap();
    let before_lines: Vec<&str> = before.lines().collect();
    let after_lines: Vec<&str> = after.lines().collect();
    assert_eq!(
        before_lines.len(),
        after_lines.len(),
        "a bump must not add or remove a line"
    );
    let mut changed = 0;
    for (b, a) in before_lines.iter().zip(after_lines.iter()) {
        if b != a {
            changed += 1;
            assert_eq!(*b, "tc-version: 0.2.1");
            assert_eq!(*a, "tc-version: 0.3.0");
        }
    }
    assert_eq!(changed, 1, "exactly one line may change");
}

#[test]
fn no_tc_version_at_all_bumps_from_the_core_default() {
    let (dir, vault) = fixture(None);
    let path = note_path(&vault);
    let before = fs::read_to_string(&path).unwrap();
    assert!(!before.contains("tc-version"));

    let result = run(
        &[
            "bump",
            "widget",
            "--patch",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        result.stdout,
        format!("{REL}  written · tc-version 0.1.0 -> 0.1.1\n")
    );

    let after = fs::read_to_string(&path).unwrap();
    let before_lines: Vec<&str> = before.lines().collect();
    let after_lines: Vec<&str> = after.lines().collect();
    assert_eq!(
        after_lines.len(),
        before_lines.len() + 1,
        "gaining a missing tc-version must add exactly one line, no stray \
         blank line alongside it\nbefore: {before_lines:?}\nafter: {after_lines:?}"
    );

    // The lines up to the insertion point are untouched, and every line
    // after it reappears unchanged, shifted by one.
    let insert_at = before_lines
        .iter()
        .zip(after_lines.iter())
        .position(|(b, a)| b != a)
        .unwrap_or(before_lines.len());
    assert_eq!(before_lines[..insert_at], after_lines[..insert_at]);
    assert_eq!(after_lines[insert_at], "tc-version: 0.1.1");
    assert_eq!(before_lines[insert_at..], after_lines[insert_at + 1..]);
}

#[test]
fn a_non_semver_tc_version_is_refused_and_the_note_is_untouched() {
    // Quoted: unquoted `0.3` is a YAML float, and `tc-version` must be a
    // string at discovery time (`frontmatter::take_string` on
    // `ContainerIdentity.version`) — a float there fails the whole note's
    // discovery, not just this field, so `bump` would never even find the
    // plugin to refuse. A quoted string is the shape that reaches `bump`'s
    // own non-semver refusal, which is what the CLI spec's transcript shows.
    let (dir, vault) = fixture(Some("tc-version: \"0.3\""));
    let path = note_path(&vault);
    let before = fs::read(&path).unwrap();

    let result = run(
        &[
            "bump",
            "widget",
            "--patch",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 1, "{}", result.stderr);
    assert_eq!(
        result.stdout,
        format!("{REL}  refused · non-semver: `tc-version` reads `0.3`\n")
    );
    let after = fs::read(&path).unwrap();
    assert_eq!(before, after, "a refusal must not touch the note's bytes");
}

#[test]
fn no_yes_off_a_tty_is_a_usage_error_and_writes_nothing() {
    let (dir, vault) = fixture(Some("tc-version: 0.2.1"));
    let path = note_path(&vault);
    let before = fs::read(&path).unwrap();

    let result = run(
        &["bump", "widget", "--minor", "--vault", &vault_str(&vault)],
        dir.path(),
    );

    assert_eq!(result.code, 3, "{}", result.stderr);
    assert_eq!(result.stdout, "");
    let after = fs::read(&path).unwrap();
    assert_eq!(before, after, "a declined/unconfirmable run must not write");
}
