//! `tradecraft new|rename|move|delete|convert` — the seven authoring verbs,
//! driven in-process over a temp copy of the fixture vault
//! (`tests/fixtures/vault`), the way `tests/bump.rs` drives `bump`.
//!
//! Every assertion checks both the exit code and the report rows the run
//! printed to stdout; the tally line ([`crate::commands::authoring`]'s
//! `report_success`/`refuse_row`) goes to stderr and is not part of a row.

mod common;

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
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
/// `tests/bump.rs` uses.
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

fn write(dir: &Path, rel: &str, body: &str) {
    let abs = dir.join(rel);
    fs::create_dir_all(abs.parent().unwrap()).unwrap();
    fs::write(abs, body).unwrap();
}

fn copy_dir_recursive(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        let dest = to.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &dest);
        } else {
            fs::copy(&path, &dest).unwrap();
        }
    }
}

/// A temp copy of the fixture vault `tests/fixtures/vault` — a frozen snapshot, so
/// skill edits elsewhere cannot change a result; never mutated in place.
fn fixture() -> (tempfile::TempDir, PathBuf) {
    let source = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/vault")
        .canonicalize()
        .unwrap();
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join("vault");
    copy_dir_recursive(&source, &vault);
    (dir, vault)
}

/// Every file under `dir`, folded into one hash — what a `--dry-run` must
/// leave unchanged.
fn hash_tree(dir: &Path) -> u64 {
    let mut entries: Vec<(String, Vec<u8>)> = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(next) = stack.pop() {
        for entry in fs::read_dir(&next).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                stack.push(path);
            } else {
                let key = path
                    .strip_prefix(dir)
                    .unwrap()
                    .to_string_lossy()
                    .to_string();
                entries.push((key, fs::read(&path).unwrap()));
            }
        }
    }
    entries.sort();
    let mut hasher = DefaultHasher::new();
    entries.hash(&mut hasher);
    hasher.finish()
}

const DEV_AGENT_SKILLS: &str = "marketplaces/studio/plugins/dev-agent/skills";

#[test]
fn new_skill_writes_the_note_at_its_derived_path() {
    let (dir, vault) = fixture();

    let result = run(
        &[
            "new",
            "skill",
            "foo",
            "--plugin",
            "dev-agent",
            "--description",
            "First skill.",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 0, "{}", result.stderr);
    let path = format!("{DEV_AGENT_SKILLS}/foo/foo.md");
    assert_eq!(
        result.stdout,
        format!("{path}  written \u{b7} first-write\n")
    );

    // Divergence from the spec transcript: `--plugin dev-agent` places the
    // note under the plugin's own folder, but the core does not mirror an
    // `ap-plugin` key into the frontmatter on create — a skill's plugin is
    // read off its folder alone, and `run_new_skill` never adds the key.
    // Only `name` (slugged) and the typed `description` land.
    let note = fs::read_to_string(vault.join(&path)).unwrap();
    assert_eq!(note, "---\nname: foo\ndescription: First skill.\n---\n");
    assert!(!note.contains("ap-plugin"));
}

#[test]
fn rename_rewrites_an_inbound_link_and_reports_the_rewrite_count() {
    let (dir, vault) = fixture();
    run(
        &[
            "new",
            "skill",
            "foo",
            "--plugin",
            "dev-agent",
            "--description",
            "First skill.",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );
    write(&vault, "notes/linker.md", "See [[foo]] for details.\n");

    let result = run(
        &[
            "rename",
            "foo",
            "bar",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        result.stdout,
        format!(
            "{DEV_AGENT_SKILLS}/bar/bar.md  written \u{b7} renamed\n\
             notes/linker.md  written \u{b7} 1 link rewritten\n"
        )
    );
    assert_eq!(
        fs::read_to_string(vault.join("notes/linker.md")).unwrap(),
        "See [[bar]] for details.\n"
    );
    assert!(!vault.join(format!("{DEV_AGENT_SKILLS}/foo")).exists());
}

#[test]
fn move_leaves_an_unrelated_link_byte_identical() {
    let (dir, vault) = fixture();
    write(&vault, "notes/other.md", "unrelated [[Alpha]] link\n");
    let unrelated = vault.join("notes/other.md");
    let before = fs::read(&unrelated).unwrap();

    let result = run(
        &[
            "move",
            "dev-update-docs",
            "--to-plugin",
            "tools",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        result.stdout,
        "marketplaces/studio/plugins/tools/skills/dev-update-docs/dev-update-docs.md  \
         written \u{b7} moved, ap-plugin removed\n"
    );
    let after = fs::read(&unrelated).unwrap();
    assert_eq!(before, after, "an unrelated note's bytes must not change");
}

#[test]
fn delete_refuses_a_nonempty_container_without_force_and_trashes_it_with_force() {
    let (dir, vault) = fixture();
    let plugin_dir = vault.join("marketplaces/studio/plugins/dev-agent");

    let refused = run(
        &[
            "delete",
            "dev-agent",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );
    assert_eq!(refused.code, 1, "{}", refused.stderr);
    // The prefix is pinned; the roster is not. This fixture is a checked-in
    // vault, so a skill added to `dev-agent` would otherwise break a test that
    // is about the refusal's shape.
    let prefix = "marketplaces/studio/plugins/dev-agent  refused \u{b7} \
                  `marketplaces/studio/plugins/dev-agent/dev-agent.md` still holds components: ";
    let listed = refused
        .stdout
        .strip_prefix(prefix)
        .unwrap_or_else(|| panic!("{}", refused.stdout));
    let members: Vec<&str> = listed.trim_end().split(", ").collect();
    assert!(
        members.contains(
            &"marketplaces/studio/plugins/dev-agent/skills/pr-mermaid-comment/pr-mermaid-comment.md"
        ),
        "{members:?}"
    );
    for member in &members {
        assert!(
            member.starts_with("marketplaces/studio/plugins/dev-agent/"),
            "a refusal names this plugin's members and nothing else: {member}"
        );
    }
    assert!(plugin_dir.is_dir(), "a refusal must move nothing");
    assert!(!vault.join(".trash").exists());

    let forced = run(
        &[
            "delete",
            "dev-agent",
            "--force",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );
    assert_eq!(forced.code, 0, "{}", forced.stderr);
    let trashed = ".trash/marketplaces/studio/plugins/dev-agent";
    assert_eq!(
        forced.stdout,
        format!("{trashed}  written \u{b7} moved to trash\n")
    );
    assert!(forced.stdout.starts_with(".trash/"));
    assert!(!plugin_dir.exists());
    assert!(vault.join(trashed).join("dev-agent.md").is_file());
    assert!(
        vault
            .join(trashed)
            .join("skills/dev-update-docs/dev-update-docs.md")
            .is_file()
    );
}

/// `hook` parses as a real `EntityKind` (`convert`'s `--kind` accepts it),
/// so this is refused by the core's own plan, exit 1 — not a clap usage
/// error and not exit 3, as the spec's `hook`-is-unparseable phrasing might
/// suggest.
#[test]
fn convert_to_hook_is_refused() {
    let (dir, vault) = fixture();

    let result = run(
        &[
            "convert",
            "dev-update-docs",
            "--kind",
            "hook",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 1, "{}", result.stderr);
    assert_eq!(
        result.stdout,
        format!(
            "{DEV_AGENT_SKILLS}/dev-update-docs/dev-update-docs.md  refused \u{b7} \
             converting to or from `hook` is not offered here\n"
        )
    );
}

#[test]
fn dry_run_writes_nothing_but_still_prints_the_preview() {
    let (dir, vault) = fixture();
    let before = hash_tree(&vault);

    let result = run(
        &[
            "rename",
            "dev-update-docs",
            "reviewer",
            "--dry-run",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        result.stdout,
        format!(
            "{DEV_AGENT_SKILLS}/reviewer/reviewer.md  written \u{b7} renamed\n\
             {DEV_AGENT_SKILLS}/dev-update-docs/dev-update-docs.md  written \u{b7} 2 links rewritten\n"
        )
    );
    let after = hash_tree(&vault);
    assert_eq!(before, after, "a dry run must not touch the vault's bytes");
}

#[test]
fn delete_dry_run_writes_nothing_but_still_prints_the_preview() {
    let (dir, vault) = fixture();
    let before = hash_tree(&vault);

    let result = run(
        &[
            "delete",
            "dev-update-docs",
            "--dry-run",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        result.stdout,
        format!(".trash/{DEV_AGENT_SKILLS}/dev-update-docs  written \u{b7} moved to trash\n")
    );
    let after = hash_tree(&vault);
    assert_eq!(before, after, "a dry run must not touch the vault's bytes");
}

#[test]
fn a_writing_verb_off_a_tty_without_yes_is_a_usage_error_and_touches_nothing() {
    let (dir, vault) = fixture();
    let before = hash_tree(&vault);

    let result = run(
        &[
            "rename",
            "dev-update-docs",
            "reviewer",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 3, "{}", result.stdout);
    assert_eq!(result.stdout, "");
    assert_eq!(
        result.stderr,
        "usage error: rename writes files; pass --yes when not running interactively\n"
    );
    let after = hash_tree(&vault);
    assert_eq!(before, after, "a usage error must not touch the vault");
}

#[test]
fn new_marketplace_writes_the_note_and_its_plugins_scaffold() {
    let (dir, vault) = fixture();

    let result = run(
        &[
            "new",
            "marketplace",
            "acme",
            "--description",
            "Acme's own marketplace.",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        result.stdout,
        "marketplaces/acme/acme.md  written \u{b7} first-write\n\
         marketplaces/acme/plugins  written \u{b7} scaffold\n"
    );
    let note = fs::read_to_string(vault.join("marketplaces/acme/acme.md")).unwrap();
    assert_eq!(
        note,
        "---\nname: acme\ndescription: Acme's own marketplace.\n---\n"
    );
}

#[test]
fn new_marketplace_without_description_is_a_clap_usage_error() {
    let (dir, vault) = fixture();

    let result = run(
        &[
            "new",
            "marketplace",
            "beta",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 3, "{}", result.stdout);
    assert!(!vault.join("marketplaces/beta").exists());
}

#[test]
fn new_plugin_writes_the_note_and_its_kind_scaffolds() {
    let (dir, vault) = fixture();

    let result = run(
        &[
            "new",
            "plugin",
            "gizmos",
            "--marketplace",
            "studio",
            "--description",
            "Gizmo plugin.",
            "--yes",
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );

    assert_eq!(result.code, 0, "{}", result.stderr);
    let path = "marketplaces/studio/plugins/gizmos/gizmos.md";
    let note = fs::read_to_string(vault.join(path)).unwrap();
    assert_eq!(note, "---\nname: gizmos\ndescription: Gizmo plugin.\n---\n");
    for kind_dir in ["skills", "commands", "agents", "hooks"] {
        assert!(
            vault
                .join(format!("marketplaces/studio/plugins/gizmos/{kind_dir}"))
                .is_dir(),
            "missing {kind_dir}"
        );
    }
}

/// `.trash` holds what `delete` moved out of the tree. Neither `list` nor
/// `check` must walk into it: before the fix, a forced delete made `list`
/// report the trashed note `skipped · unreadable-note` and made `check` fail
/// outright instead of scanning the vault it was asked to check.
#[test]
fn list_and_check_stay_clean_after_a_forced_delete() {
    let (dir, vault) = fixture();
    let vault_s = vault_str(&vault);
    let out = dir.path().join("market").display().to_string();
    let build = |cwd: &Path| {
        run(
            &[
                "build",
                "--vault",
                &vault_s,
                "--out",
                &out,
                "--default-plugin",
                "tools",
                "--yes",
            ],
            cwd,
        )
    };

    // `README.md` is never touched by this test's own ops. A byte check on
    // it after every step pins that this test's own build/delete/build
    // pipeline never writes to a file it was not asked to touch.
    let canary = fs::read(vault.join("README.md")).unwrap();

    let built = build(dir.path());
    assert_eq!(built.code, 0, "{}", built.stderr);
    assert_eq!(fs::read(vault.join("README.md")).unwrap(), canary);

    let deleted = run(
        &[
            "delete",
            "pr-mermaid-comment",
            "--force",
            "--yes",
            "--vault",
            &vault_s,
        ],
        dir.path(),
    );
    assert_eq!(deleted.code, 0, "{}", deleted.stderr);
    assert_eq!(fs::read(vault.join("README.md")).unwrap(), canary);

    // Re-publish so `check` compares against the vault's new shape rather
    // than reporting the now-stale market's legitimate drift.
    let rebuilt = build(dir.path());
    assert_eq!(rebuilt.code, 0, "{}", rebuilt.stderr);
    assert_eq!(fs::read(vault.join("README.md")).unwrap(), canary);

    let listed = run(&["list", "--vault", &vault_s, "--quiet"], dir.path());
    assert_eq!(listed.code, 0, "{}", listed.stderr);
    assert!(!listed.stdout.contains("skipped"), "{}", listed.stdout);
    assert!(!listed.stdout.contains(".trash"), "{}", listed.stdout);

    let checked = run(
        &[
            "check",
            "--vault",
            &vault_s,
            "--out",
            &out,
            "--default-plugin",
            "tools",
        ],
        dir.path(),
    );
    assert_eq!(checked.code, 0, "{}", checked.stdout);
    assert!(!checked.stdout.contains("skipped"), "{}", checked.stdout);
}
