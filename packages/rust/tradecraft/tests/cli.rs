//! argv → exit-code mapping.
//!
//! Every case drives [`tradecraft::cli::run_with`] in-process, with the
//! working directory on the context rather than the process — so these run in
//! parallel without changing the process's directory.
//!
//! `AGENT_PANTS_MACHINE_CONFIG` is still process-wide, so every run
//! relocates it under [`common::with_machine_env`].

mod common;

use std::fs;
use std::path::{Path, PathBuf};

use common::with_machine_env;
use tradecraft::cli::run_with;
use tradecraft::ctx::CommandContext;
use tradecraft_core::{
    Namespace, NativeVfs, PublishMode, PublishRequest, PublishStatus, publish_skill,
};

struct Run {
    code: i32,
    stdout: String,
    stderr: String,
}

/// One invocation, with the machine config relocated into `cwd` so the
/// developer's real one never leaks into a run.
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

/// [`run`] over a fixed argv plus whatever a case adds — the shape every
/// per-verb closure below shares.
fn run_argv(mut base: Vec<String>, extra: &[&str], cwd: &Path) -> Run {
    base.extend(extra.iter().map(|s| (*s).to_string()));
    let borrowed: Vec<&str> = base.iter().map(String::as_str).collect();
    run(&borrowed, cwd)
}

/// The base fixture: one skill note in
/// the canonical shape, inside the folder named for it.
fn fixture() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join("vault");
    let skill = vault.join("skills").join("code-review");
    fs::create_dir_all(skill.join("references")).unwrap();
    fs::write(
        skill.join("code-review.md"),
        "---\nname: code-review\ndescription: reviews code\nlicense: MIT\n---\nReview the diff.\n",
    )
    .unwrap();
    fs::write(skill.join("references").join("style.md"), "# Style\n").unwrap();
    (dir, vault)
}

fn vault_str(vault: &Path) -> String {
    vault.display().to_string()
}

/// The core's own fixture vault, read read-only: it holds a marketplace
/// note, which a build needs and the temp fixture above does not have.
fn donor_vault() -> String {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/agent-skills-vault")
        .canonicalize()
        .unwrap()
        .display()
        .to_string()
}

// --- the usage line ----------------------------------------------------------

#[test]
fn no_argv_is_the_usage_line_and_exit_3() {
    let dir = tempfile::tempdir().unwrap();
    let run = run(&[], dir.path());
    assert_eq!(run.code, 3);
    assert_eq!(run.stdout, "");
    assert_eq!(
        run.stderr,
        "usage: tradecraft <publish|build|check|list|init|adopt|status|unpublish|harness> [options]\n"
    );
}

#[test]
fn version_prints_the_crate_version() {
    let dir = tempfile::tempdir().unwrap();
    for flag in ["--version", "-V"] {
        let run = run(&[flag], dir.path());
        assert_eq!(run.code, 0);
        assert_eq!(
            run.stdout.trim(),
            format!("tradecraft {}", env!("CARGO_PKG_VERSION"))
        );
    }
}

#[test]
fn the_root_help_names_every_verb_this_binary_declares() {
    let dir = tempfile::tempdir().unwrap();
    let run = run(&["--help"], dir.path());
    assert_eq!(run.code, 0);
    for verb in [
        "publish",
        "build",
        "check",
        "list",
        "init",
        "adopt",
        "status",
        "unpublish",
        "harness",
    ] {
        assert!(
            run.stdout.contains(verb),
            "{verb} missing from {}",
            run.stdout
        );
    }
}

#[test]
fn the_root_help_names_every_global_flag_and_the_three_nouns() {
    let dir = tempfile::tempdir().unwrap();
    let run = run(&["--help"], dir.path());
    assert_eq!(run.code, 0);
    for flag in [
        "--vault",
        "--config",
        "--namespace",
        "--json",
        "--dry-run",
        "--yes",
        "--quiet",
    ] {
        assert!(run.stdout.contains(flag), "{flag} missing");
    }
    // The same sentence the verb prints for it, not a second wording.
    assert!(
        run.stdout
            .contains("Vault root. Overrides the configuration for this run.")
    );
    // The two a read-only verb does not declare are marked as such.
    assert!(run.stdout.contains("Only on a verb that writes."));
    for noun in ["vault", "destination", "target"] {
        assert!(run.stdout.contains(noun));
    }
}

// --- the per-verb global sets ------------------------------------------------

#[test]
fn a_write_only_global_is_not_a_flag_on_a_verb_that_writes_nothing() {
    let (dir, vault) = fixture();
    for argv in [
        vec!["list", "--vault", &vault_str(&vault), "--yes"],
        vec!["list", "--vault", &vault_str(&vault), "--dry-run"],
        vec!["status", "--yes"],
        vec!["status", "--dry-run"],
    ] {
        let run = run(&argv, dir.path());
        assert_eq!(run.code, 3, "{argv:?} exited {}", run.code);
    }
}

#[test]
fn a_verb_that_writes_declares_all_seven() {
    let (dir, vault) = fixture();
    // Not a real build: `--dry-run` and `--yes` parse, and the run stops at
    // the needs check for `marketplace.out`, which is exit 3 with a message
    // naming the setting — not clap's "unexpected argument".
    let run = run(
        &[
            "build",
            "--vault",
            &vault_str(&vault),
            "--default-plugin",
            "tools",
            "--dry-run",
            "--yes",
            "--quiet",
            "--json",
        ],
        dir.path(),
    );
    assert_eq!(run.code, 3);
    assert!(run.stderr.contains("marketplace.out"), "{}", run.stderr);
    assert!(
        !run.stderr.contains("unexpected argument"),
        "{}",
        run.stderr
    );
}

// --- retired spellings -------------------------------------------------------

#[test]
fn a_retired_flag_is_exit_3_and_stderr_names_its_replacement() {
    let dir = tempfile::tempdir().unwrap();
    for verb in ["build", "check"] {
        let run = run(&[verb, "--skills", "/tmp/x"], dir.path());
        assert_eq!(run.code, 3);
        assert_eq!(run.stdout, "");
        assert_eq!(
            run.stderr,
            format!(
                "usage error: --skills is no longer a flag on `{verb}`; it is now --skills-root\n"
            )
        );
    }
}

#[test]
fn a_retired_flag_on_adopt_is_exit_3_and_stderr_names_its_replacement() {
    let dir = tempfile::tempdir().unwrap();
    let cases: [(&[&str], &str); 3] = [
        (&["adopt", "src", "--skills", "/tmp/x"], "--into"),
        (&["adopt", "src", "--skill", "code-review"], "--only"),
        (&["adopt", "src", "--target", "claude"], "--set-targets"),
    ];
    for (argv, replacement) in cases {
        let run = run(argv, dir.path());
        assert_eq!(run.code, 3, "{argv:?}");
        assert_eq!(run.stdout, "");
        assert!(run.stderr.contains(replacement), "{}", run.stderr);
    }
}

#[test]
fn a_retired_flag_spelled_with_an_equals_sign_is_caught_too() {
    let dir = tempfile::tempdir().unwrap();
    let run = run(&["build", "--skills=/tmp/x"], dir.path());
    assert_eq!(run.code, 3);
    assert!(run.stderr.contains("--skills-root"), "{}", run.stderr);
}

#[test]
fn the_current_spelling_of_the_same_idea_is_untouched() {
    let (dir, vault) = fixture();
    // `--skills-root` parses; the run stops later, at the needs check.
    let run = run(
        &[
            "build",
            "--vault",
            &vault_str(&vault),
            "--skills-root",
            &vault_str(&vault),
        ],
        dir.path(),
    );
    assert!(!run.stderr.contains("no longer a flag"), "{}", run.stderr);
}

// --- the not-implemented verbs -----------------------------------------------

#[test]
fn init_has_a_real_argv_surface_and_exits_2() {
    let dir = tempfile::tempdir().unwrap();
    let run = run(&["init"], dir.path());
    assert_eq!(run.code, 2);
    assert_eq!(run.stdout, "");
    assert!(
        run.stderr.starts_with("not implemented: init\n"),
        "{}",
        run.stderr
    );
    assert!(run.stderr.contains("tradecraft-core has neither"));
}

#[test]
fn unpublish_with_its_note_exits_2() {
    let dir = tempfile::tempdir().unwrap();
    let run = run(
        &["unpublish", "skills/code-review/code-review.md"],
        dir.path(),
    );
    assert_eq!(run.code, 2);
    assert!(
        run.stderr.starts_with("not implemented: unpublish\n"),
        "{}",
        run.stderr
    );
}

#[test]
fn unpublish_without_its_required_note_is_a_usage_error() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(run(&["unpublish"], dir.path()).code, 3);
}

#[test]
fn a_stub_verbs_help_says_it_is_not_implemented_and_names_the_exit() {
    let dir = tempfile::tempdir().unwrap();
    for verb in ["init", "unpublish"] {
        let helped = run(&[verb, "--help"], dir.path());
        assert_eq!(helped.code, 0);
        assert!(helped.stdout.contains(&format!("not implemented: {verb}")));
        assert!(helped.stdout.contains("exits 2"));
        // The marker is the same sentence the exit prints. `init` takes no
        // positional, so running it with one is a clap error and never
        // reaches the exit.
        let argv: Vec<&str> = if verb == "init" {
            vec![verb]
        } else {
            vec![verb, "note.md"]
        };
        let ran = run(&argv, dir.path());
        assert_eq!(ran.code, 2, "{}", ran.stderr);
        let sentence = ran.stderr.lines().nth(1).unwrap();
        assert!(!sentence.is_empty());
        assert!(helped.stdout.contains(sentence), "{}", helped.stdout);
    }
}

#[test]
fn an_unknown_option_is_a_usage_error() {
    let dir = tempfile::tempdir().unwrap();
    let run = run(&["publish", "--nope"], dir.path());
    assert_eq!(run.code, 3);
    assert!(run.stderr.contains("--nope"), "{}", run.stderr);
}

#[test]
fn an_unknown_verb_is_a_usage_error() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(run(&["frobnicate"], dir.path()).code, 3);
}

// --- harness -------------------------------------------------------------

#[test]
fn harness_install_claude_help_exits_cleanly() {
    let dir = tempfile::tempdir().unwrap();
    let run = run(&["harness", "install", "claude", "--help"], dir.path());
    assert_eq!(run.code, 0, "{}", run.stderr);
    for flag in [
        "--plugin",
        "--scope",
        "--path",
        "--git-url",
        "--git-ref",
        "--vault",
        "--dry-run",
        "--yes",
    ] {
        assert!(
            run.stdout.contains(flag),
            "{flag} missing from {}",
            run.stdout
        );
    }
}

#[test]
fn an_unknown_flag_under_harness_install_claude_is_a_usage_error() {
    let dir = tempfile::tempdir().unwrap();
    let run = run(&["harness", "install", "claude", "--nope"], dir.path());
    assert_eq!(run.code, 3);
    assert!(run.stderr.contains("--nope"), "{}", run.stderr);
}

// --- list --------------------------------------------------------------------

#[test]
fn list_over_a_vault_prints_the_roster_and_the_tally() {
    let (dir, vault) = fixture();
    let run = run(&["list", "--vault", &vault_str(&vault)], dir.path());
    assert_eq!(run.code, 0);
    assert!(run.stdout.contains("skills/code-review/code-review.md"));
    assert!(run.stdout.contains("reviews code"));
    assert_eq!(run.stderr, "1 skill\n");
}

#[test]
fn list_json_carries_the_same_rows_the_table_does() {
    let (dir, vault) = fixture();
    let run = run(
        &["list", "--vault", &vault_str(&vault), "--json", "--quiet"],
        dir.path(),
    );
    assert_eq!(run.code, 0);
    assert_eq!(run.stderr, "");
    let rows: Vec<serde_json::Value> = serde_json::from_str(&run.stdout).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["path"], "skills/code-review/code-review.md");
    assert_eq!(rows[0]["name"], "code-review");
    assert_eq!(rows[0]["kind"], "skill");
    // Absent is `null`, which is not the same instruction as `[]`.
    assert!(rows[0]["targets"].is_null());
    assert!(rows[0].get("folder_kind").is_some());
}

#[test]
fn list_with_no_configuration_and_no_vault_is_exit_4_naming_both_files() {
    let dir = tempfile::tempdir().unwrap();
    let run = run(&["list"], dir.path());
    assert_eq!(run.code, 4);
    assert!(run.stderr.contains("agent-pants.yaml"), "{}", run.stderr);
    assert!(
        run.stderr.contains("no-machine-config.yaml"),
        "{}",
        run.stderr
    );
}

#[test]
fn list_with_a_config_that_names_no_file_is_exit_4() {
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("nothing-here.yaml");
    let run = run(
        &["list", "--config", &missing.display().to_string()],
        dir.path(),
    );
    assert_eq!(run.code, 4);
    assert!(run.stderr.contains("not there"), "{}", run.stderr);
}

#[test]
fn list_over_a_vault_that_is_not_there_is_exit_2() {
    let dir = tempfile::tempdir().unwrap();
    let absent = dir.path().join("no-vault");
    let run = run(
        &["list", "--vault", &absent.display().to_string()],
        dir.path(),
    );
    assert_eq!(run.code, 2);
    assert_eq!(run.stdout, "");
    assert!(run.stderr.contains("vault not found"), "{}", run.stderr);
}

#[test]
fn a_project_file_above_the_working_directory_supplies_the_vault() {
    let (dir, _vault) = fixture();
    fs::write(dir.path().join("agent-pants.yaml"), "vault: ./vault\n").unwrap();
    let run = run(&["list"], dir.path());
    assert_eq!(run.code, 0);
    assert!(run.stdout.contains("code-review"));
}

// --- build and check ---------------------------------------------------------

#[test]
fn a_missing_default_plugin_is_a_usage_error_that_says_where_to_set_it() {
    let (dir, _vault) = fixture();
    fs::write(dir.path().join("agent-pants.yaml"), "vault: ./vault\n").unwrap();
    let out = dir.path().join("market").display().to_string();
    let run = run(&["check", "--out", &out], dir.path());
    assert_eq!(run.code, 3);
    assert!(
        run.stderr.contains("marketplace.default_plugin"),
        "{}",
        run.stderr
    );
    assert!(run.stderr.contains("--default-plugin"), "{}", run.stderr);
    assert!(
        run.stderr
            .contains(&dir.path().join("agent-pants.yaml").display().to_string()),
        "{}",
        run.stderr
    );
}

#[test]
fn a_build_off_a_tty_without_yes_is_a_usage_error_not_a_silent_write() {
    let (dir, vault) = fixture();
    let market = dir.path().join("market");
    let run = run(
        &[
            "build",
            "--vault",
            &vault_str(&vault),
            "--out",
            &market.display().to_string(),
            "--default-plugin",
            "tools",
        ],
        dir.path(),
    );
    assert_eq!(run.code, 3);
    assert!(run.stderr.contains("pass --yes"), "{}", run.stderr);
    assert!(!market.exists());
}

#[test]
fn dry_run_on_check_says_it_is_redundant_rather_than_silently_doing_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let market = dir.path().join("market");
    let run = run(
        &[
            "check",
            "--vault",
            &donor_vault(),
            "--out",
            &market.display().to_string(),
            "--default-plugin",
            "tools",
            "--dry-run",
        ],
        dir.path(),
    );
    assert!(
        run.stderr
            .contains("check writes nothing under any outcome"),
        "{}",
        run.stderr
    );
    // Nothing built yet, so: drift. The flag does not change the verdict.
    assert_eq!(run.code, 1);
    assert!(!market.exists());
}

#[test]
fn a_build_renders_the_roots_and_a_check_then_agrees_with_it() {
    let dir = tempfile::tempdir().unwrap();
    let market = dir.path().join("market");
    let args = |verb: &'static str| -> Vec<String> {
        vec![
            verb.to_string(),
            "--vault".to_string(),
            donor_vault(),
            "--out".to_string(),
            market.display().to_string(),
            "--default-plugin".to_string(),
            "tools".to_string(),
        ]
    };
    let mut build: Vec<String> = args("build");
    build.push("--yes".to_string());
    let build_argv: Vec<&str> = build.iter().map(String::as_str).collect();
    let built = run(&build_argv, dir.path());
    assert_eq!(built.code, 0, "{}", built.stderr);
    assert!(built.stdout.contains("claude/tools  written · 1 skill"));
    assert!(
        built
            .stdout
            .contains("claude  written · marketplace manifest")
    );
    assert!(
        built.stderr.contains("7 checked — 7 written"),
        "{}",
        built.stderr
    );

    let check = args("check");
    let check_argv: Vec<&str> = check.iter().map(String::as_str).collect();
    let checked = run(&check_argv, dir.path());
    assert_eq!(checked.code, 0, "{}", checked.stderr);
    assert!(checked.stdout.contains("claude/tools  ok · 1 skill"));
    assert!(checked.stderr.contains("7 ok"), "{}", checked.stderr);
}

/// The project file's marketplace-wide license reaches a pack manifest.
///
/// The parse into `MarketplaceSettings` and the core's resolution off
/// `MarketplaceConfig` are each covered on their own side; the one
/// assignment bridging them was not, so deleting it left every test green.
/// The donor vault declares no license anywhere, so the project file is the
/// only thing that can put one in the manifest.
#[test]
fn the_project_files_marketplace_license_reaches_the_pack_manifest() {
    let dir = tempfile::tempdir().unwrap();
    let market = dir.path().join("market");
    fs::write(
        dir.path().join("agent-pants.yaml"),
        format!(
            "vault: {}\nmarketplace:\n  default_plugin: tools\n  out: {}\n  license: MIT\n",
            donor_vault(),
            market.display()
        ),
    )
    .unwrap();

    let run = run(&["build", "--yes"], dir.path());
    assert_eq!(run.code, 0, "{}", run.stderr);

    let manifest =
        fs::read_to_string(market.join(".claude-plugin/packs/tools/.claude-plugin/plugin.json"))
            .unwrap();
    assert!(manifest.contains(r#""license": "MIT""#), "{manifest}");
    let package = fs::read_to_string(market.join(".pi/packs/tools/package.json")).unwrap();
    assert!(package.contains(r#""license": "MIT""#), "{package}");
}

// --- status ------------------------------------------------------------------

#[test]
fn status_with_no_destinations_configured_is_a_usage_error() {
    let (dir, vault) = fixture();
    let config = dir.path().join("status-config.yaml");
    fs::write(
        &config,
        format!("vault: {}\ndestinations: []\n", vault.display()),
    )
    .unwrap();
    let run = run(
        &["status", "--config", &config.display().to_string()],
        dir.path(),
    );
    assert_eq!(run.code, 3);
    assert_eq!(
        run.stderr,
        "usage error: no destinations configured; there is nothing to report a state against\n"
    );
}

/// A config naming the vault and one destination.
fn status_config(dir: &Path, vault: &Path) -> String {
    let dest = dir.join("dest");
    fs::create_dir_all(&dest).unwrap();
    let config = dir.join("status-config.yaml");
    fs::write(
        &config,
        format!(
            "vault: {}\ndestinations:\n  - root: {}\n    target: claude\n",
            vault.display(),
            dest.display()
        ),
    )
    .unwrap();
    config.display().to_string()
}

#[test]
fn a_destination_never_written_to_is_never_published_and_passes_check() {
    let (dir, vault) = fixture();
    let config = status_config(dir.path(), &vault);
    let run = run(&["status", "--config", &config, "--check"], dir.path());
    assert_eq!(run.code, 0, "{}", run.stderr);
    assert!(run.stdout.contains("never-published"), "{}", run.stdout);
    assert!(run.stderr.contains("1 never-published"), "{}", run.stderr);
}

#[test]
fn status_json_carries_the_same_tokens_the_table_prints() {
    let (dir, vault) = fixture();
    let config = status_config(dir.path(), &vault);
    let run = run(
        &["status", "--config", &config, "--json", "--quiet"],
        dir.path(),
    );
    assert_eq!(run.code, 0, "{}", run.stderr);
    let document: serde_json::Value = serde_json::from_str(&run.stdout).unwrap();
    let rows = document["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["state"], "never-published");
    assert_eq!(rows[0]["skill"], "skills/code-review/code-review.md");
    assert_eq!(rows[0]["target"], "claude");
    // No unreadable note, so the key is absent rather than empty.
    assert!(document.get("skipped").is_none());
}

#[test]
fn a_note_that_is_not_there_is_a_blocker_naming_it() {
    let (dir, vault) = fixture();
    let config = status_config(dir.path(), &vault);
    let run = run(
        &["status", "no/such/note.md", "--config", &config],
        dir.path(),
    );
    assert_eq!(run.code, 2);
    assert!(run.stderr.starts_with("note not found: "), "{}", run.stderr);
}

// --- helpers for the build/check, list and status cases ---------------

/// A recursive copy, for the cases that must not write into the committed
/// donor vault.
fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), &target).unwrap();
        }
    }
}

/// Every file under `root`, relative to it, sorted.
fn tree(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![PathBuf::new()];
    while let Some(rel) = stack.pop() {
        for entry in fs::read_dir(root.join(&rel)).unwrap() {
            let entry = entry.unwrap();
            let child = rel.join(entry.file_name());
            if entry.file_type().unwrap().is_dir() {
                stack.push(child);
            } else {
                out.push(child);
            }
        }
    }
    out.sort();
    out
}

/// The donor vault, one output root, and
/// the default plugin both verbs need. No `--marketplace` — that vault names
/// its own.
fn market_run(verb: &str, market: &Path, extra: &[&str], cwd: &Path) -> Run {
    run_argv(
        vec![
            verb.to_string(),
            "--vault".to_string(),
            donor_vault(),
            "--out".to_string(),
            market.display().to_string(),
            "--default-plugin".to_string(),
            "tools".to_string(),
        ],
        extra,
        cwd,
    )
}

fn build_market(market: &Path, extra: &[&str], cwd: &Path) -> Run {
    let mut with_yes = vec!["--yes"];
    with_yes.extend_from_slice(extra);
    market_run("build", market, &with_yes, cwd)
}

fn check_market(market: &Path, extra: &[&str], cwd: &Path) -> Run {
    market_run("check", market, extra, cwd)
}

/// The top-level tree one harness owns in the marketplace directory. The
/// whole of what a build of that harness reads, compares or replaces.
fn tree_of(harness: &str) -> &'static str {
    match harness {
        "claude" => ".claude-plugin",
        "codex" => ".agents",
        "cursor" => ".cursor-plugin",
        other => panic!("no such harness: {other}"),
    }
}

/// Where one harness's packs land, relative to the marketplace directory.
fn packs_of(harness: &str) -> PathBuf {
    PathBuf::from(tree_of(harness)).join("packs")
}

/// The one skill the donor vault publishes, in one harness's tree.
fn skill_md(market: &Path, harness: &str) -> PathBuf {
    market
        .join(packs_of(harness))
        .join("tools")
        .join("skills")
        .join("workflow-checklist")
        .join("SKILL.md")
}

// --- build and check ---------------------------------------

#[test]
fn a_drifted_root_is_check_exit_1_and_the_next_build_heals_it() {
    let dir = tempfile::tempdir().unwrap();
    let market = dir.path().join("market");
    assert_eq!(build_market(&market, &[], dir.path()).code, 0);

    let edited = format!(
        "{}\nhand-edited\n",
        fs::read_to_string(skill_md(&market, "claude")).unwrap()
    );
    fs::write(skill_md(&market, "claude"), &edited).unwrap();

    let drifted = check_market(&market, &[], dir.path());
    assert_eq!(drifted.code, 1, "{}", drifted.stderr);
    assert!(
        drifted.stdout.contains("claude/tools  drift · 1 skill"),
        "{}",
        drifted.stdout
    );
    // Only the root that moved.
    assert!(
        drifted.stdout.contains("codex/tools  ok · 1 skill"),
        "{}",
        drifted.stdout
    );
    // check writes nothing under any outcome — the edit is still there.
    assert!(
        fs::read_to_string(skill_md(&market, "claude"))
            .unwrap()
            .contains("hand-edited")
    );

    let healed = build_market(&market, &[], dir.path());
    assert_eq!(healed.code, 0, "{}", healed.stderr);
    assert!(
        healed.stdout.contains("claude/tools  written · 1 skill"),
        "{}",
        healed.stdout
    );
    assert!(
        !fs::read_to_string(skill_md(&market, "claude"))
            .unwrap()
            .contains("hand-edited")
    );
    assert_eq!(check_market(&market, &[], dir.path()).code, 0);
}

#[test]
fn a_plugin_the_vault_no_longer_produces_is_drift_for_check_and_gone_after_build() {
    let dir = tempfile::tempdir().unwrap();
    let market = dir.path().join("market");
    assert_eq!(build_market(&market, &[], dir.path()).code, 0);

    let ghost = market.join(packs_of("claude")).join("ghost");
    fs::create_dir_all(&ghost).unwrap();
    fs::write(ghost.join("leftover.md"), "from a previous vault\n").unwrap();

    let drifted = check_market(&market, &[], dir.path());
    assert_eq!(drifted.code, 1, "{}", drifted.stderr);
    assert!(drifted.stdout.contains("stale"), "{}", drifted.stdout);
    assert!(
        drifted.stdout.contains(".claude-plugin/packs/ghost"),
        "{}",
        drifted.stdout
    );
    assert!(ghost.exists(), "check wrote something");

    assert_eq!(build_market(&market, &[], dir.path()).code, 0);
    // The swap unit is the whole harness tree, so what the render did not
    // produce goes with it.
    assert!(!ghost.exists());
}

#[test]
fn build_dry_run_reports_what_a_build_would_do_writes_nothing_and_exits_0() {
    let dir = tempfile::tempdir().unwrap();
    let market = dir.path().join("market");
    let previewed = build_market(&market, &["--dry-run"], dir.path());

    // The CLI spec: a dry run exits what the real run would have. `check` over
    // the same drift is the one that exits 1.
    assert_eq!(previewed.code, 0, "{}", previewed.stderr);
    assert!(
        previewed.stdout.contains("claude/tools  drift · 1 skill"),
        "{}",
        previewed.stdout
    );
    assert!(previewed.stderr.contains("dry run"), "{}", previewed.stderr);
    assert!(
        previewed.stderr.contains("(dry run)"),
        "{}",
        previewed.stderr
    );
    assert!(!market.exists());

    assert_eq!(check_market(&market, &[], dir.path()).code, 1);
}

#[test]
fn json_emits_the_cores_own_report_mode_and_all() {
    let dir = tempfile::tempdir().unwrap();
    let market = dir.path().join("market");
    let built = build_market(&market, &["--json"], dir.path());
    assert_eq!(built.code, 0, "{}", built.stderr);

    let report: serde_json::Value = serde_json::from_str(&built.stdout).unwrap();
    assert_eq!(report["mode"], "build");
    assert_eq!(report["checked"], 1);
    assert_eq!(report["changed"], true);
    let units = report["units"].as_array().unwrap();
    // One plugin unit per harness tree, and one manifest unit per tree with
    // a marketplace (every one but Pi's).
    assert_eq!(units.iter().filter(|u| u["unit"] == "plugin").count(), 4);
    assert_eq!(units.iter().filter(|u| u["unit"] == "manifest").count(), 3);

    let checked = check_market(&market, &["--json"], dir.path());
    assert_eq!(checked.code, 0, "{}", checked.stderr);
    let report: serde_json::Value = serde_json::from_str(&checked.stdout).unwrap();
    assert_eq!(report["mode"], "check");
}

#[test]
fn an_output_root_inside_the_vault_is_refused_before_anything_is_staged() {
    let dir = tempfile::tempdir().unwrap();
    // Against a COPY of the fixture, so a regression in the rail cannot write
    // into the committed vault this suite reads.
    let copied = dir.path().join("vault-copy");
    copy_tree(Path::new(&donor_vault()), &copied);
    let before = tree(&copied);

    let inside = copied.join("market").display().to_string();
    let run = run(
        &[
            "build",
            "--vault",
            &copied.display().to_string(),
            "--out",
            &inside,
            "--default-plugin",
            "tools",
            "--yes",
        ],
        dir.path(),
    );

    // A run-level blocker, not a report of refusals: an export's rails fire
    // before anything is staged.
    assert_eq!(run.code, 2, "{}", run.stderr);
    assert_eq!(run.stdout, "");
    assert!(run.stderr.contains("build failed"), "{}", run.stderr);
    assert_eq!(tree(&copied), before);
}

#[test]
fn a_vault_with_nothing_publishable_is_a_blocker_not_an_empty_success() {
    let dir = tempfile::tempdir().unwrap();
    let market = dir.path().join("market");
    // Its own vault: a test about emptiness run against a vault with something
    // in it passes for the wrong reason.
    let empty = dir.path().join("empty-vault");
    fs::create_dir_all(empty.join("plugins")).unwrap();

    let run = run(
        &[
            "build",
            "--vault",
            &empty.display().to_string(),
            "--out",
            &market.display().to_string(),
            "--marketplace",
            "demo",
            "--default-plugin",
            "tools",
            "--yes",
        ],
        dir.path(),
    );
    assert_eq!(run.code, 2, "{}", run.stderr);
    assert!(run.stderr.contains("empty-marketplace"), "{}", run.stderr);
    assert!(!market.exists());
}

#[test]
fn a_marketplace_this_vault_does_not_hold_is_refused_naming_the_ones_it_does() {
    let dir = tempfile::tempdir().unwrap();
    let market = dir.path().join("market");
    // `--marketplace` selects. The fixture holds `house`, so `demo` is a typo
    // the build must not quietly honour by renaming its output.
    let run = market_run(
        "build",
        &market,
        &["--marketplace", "demo", "--yes"],
        dir.path(),
    );
    assert_eq!(run.code, 2, "{}", run.stderr);
    assert!(run.stderr.contains("unknown-marketplace"), "{}", run.stderr);
    assert!(run.stderr.contains("`house`"), "{}", run.stderr);
    assert!(!market.exists());
}

#[test]
fn check_never_asks_it_writes_nothing_so_there_is_nothing_to_confirm() {
    let dir = tempfile::tempdir().unwrap();
    let market = dir.path().join("market");
    // No --yes, off a TTY — the position that makes `build` a usage error.
    let run = check_market(&market, &[], dir.path());
    assert_eq!(run.code, 1, "{}", run.stderr); // nothing built yet, so: drift
}

#[test]
fn the_configurations_marketplace_block_supplies_all_three_with_no_flags() {
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("market-config.yaml");
    fs::write(
        &config,
        format!(
            "vault: {}\ndestinations: []\nmarketplace:\n  name: demo\n  default_plugin: tools\n  out: market\n",
            donor_vault()
        ),
    )
    .unwrap();

    let run = run(
        &["build", "--config", &config.display().to_string(), "--yes"],
        dir.path(),
    );
    assert_eq!(run.code, 0, "{}", run.stderr);
    assert!(
        run.stdout.contains("claude/tools  written · 1 skill"),
        "{}",
        run.stdout
    );
    // `out` is relative, so it resolved against the config file's own
    // directory rather than the process's working directory.
    assert!(
        dir.path()
            .join("market")
            .join(".claude-plugin")
            .join("marketplace.json")
            .exists()
    );
}

// --- adopt --------------------------------------------------

/// The bundle the adopt cases read: a published
/// SKILL.md, exactly as a harness directory holds one.
fn adopt_source(dir: &Path) -> PathBuf {
    let source = dir.join("source");
    fs::create_dir_all(source.join("code-review").join("references")).unwrap();
    fs::write(
        source.join("code-review").join("SKILL.md"),
        "---\nname: code-review\ndescription: reviews code\n---\nSee [the review checklist](references/checklist.md).\n",
    )
    .unwrap();
    fs::write(
        source
            .join("code-review")
            .join("references")
            .join("checklist.md"),
        "# Checklist\n",
    )
    .unwrap();
    source
}

/// `adopt <source> --vault <vault> --yes`, plus whatever `extra` adds.
fn adopt(source: &Path, vault: &Path, extra: &[&str], cwd: &Path) -> Run {
    run_argv(
        vec![
            "adopt".to_string(),
            source.display().to_string(),
            "--vault".to_string(),
            vault_str(vault),
            "--yes".to_string(),
        ],
        extra,
        cwd,
    )
}

fn adopted_note(vault: &Path, plugin: &str) -> PathBuf {
    vault
        .join("plugins")
        .join(plugin)
        .join("skills")
        .join("code-review")
        .join("code-review.md")
}

/// A repository with one commit on `main`, holding a `skills/code-review/`
/// bundle, used by the `--from-git` cases. Returns
/// the commit sha.
fn commit_git_fixture(repo: &Path) -> String {
    fs::create_dir_all(repo.join("skills").join("code-review")).unwrap();
    fs::write(
        repo.join("skills").join("code-review").join("SKILL.md"),
        "---\nname: code-review\ndescription: reviews code\n---\nReview the diff.\n",
    )
    .unwrap();
    let run_git = |args: &[&str]| {
        let mut cmd = typed_git::git();
        cmd.dir(repo)
            .args(args)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_AUTHOR_NAME", "T")
            .env("GIT_AUTHOR_EMAIL", "t@t.invalid")
            .env("GIT_COMMITTER_NAME", "T")
            .env("GIT_COMMITTER_EMAIL", "t@t.invalid");
        cmd.run().unwrap()
    };
    run_git(&["init", "--initial-branch", "main"]);
    run_git(&["add", "."]);
    run_git(&["commit", "-m", "one"]);
    typed_git::query::head_sha(repo).unwrap()
}

#[test]
fn adopt_imports_the_bundle_rewrites_links_and_stamps_provenance_exit_0() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    let result = adopt(&source, &vault, &[], dir.path());

    assert_eq!(result.code, 0, "{}", result.stderr);
    assert!(
        result.stdout.contains("code-review.md  adopted"),
        "{}",
        result.stdout
    );
    assert!(result.stderr.contains("1 adopted"), "{}", result.stderr);

    let note = fs::read_to_string(adopted_note(&vault, "adopted")).unwrap();
    assert!(note.contains("name: code-review"));
    assert!(note.contains("ap-plugin: adopted"));
    // The provenance the donor's adopt did not record. `ap-also-at` is the
    // sixth and is absent here on purpose: nothing was cross-referenced.
    assert!(note.contains("ap-source:"));
    assert!(note.contains("ap-format:"));
    assert!(note.contains("ap-source-hash:"));
    assert!(note.contains("ap-adopted-hash:"));
    assert!(note.contains("ap-adopted-at:"));
    // A relative markdown link became a wikilink.
    assert!(note.contains("[[checklist|the review checklist]]"));
    assert!(!note.contains("](references/checklist.md)"));
    assert!(
        vault
            .join("plugins")
            .join("adopted")
            .join("skills")
            .join("code-review")
            .join("references")
            .join("checklist.md")
            .exists()
    );
    // The source was never written to.
    let mut names: Vec<String> = fs::read_dir(source.join("code-review"))
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
        .collect();
    names.sort();
    assert_eq!(
        names,
        vec!["SKILL.md".to_string(), "references".to_string()]
    );
}

#[test]
fn what_it_adopted_it_can_build_the_round_trip_closes() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    assert_eq!(adopt(&source, &vault, &[], dir.path()).code, 0);

    let market = dir.path().join("market");
    let built = run(
        &[
            "build",
            "--vault",
            &vault_str(&vault),
            "--out",
            &market.display().to_string(),
            "--marketplace",
            "demo",
            "--default-plugin",
            "tools",
            "--yes",
        ],
        dir.path(),
    );
    assert_eq!(built.code, 0, "{}", built.stderr);
    // Grouped under the plugin adoption stamped, not the configured default.
    assert!(
        built.stdout.contains("claude/adopted  written · 1 skill"),
        "{}",
        built.stdout
    );
    assert!(
        market
            .join(packs_of("claude"))
            .join("adopted")
            .join("skills")
            .join("code-review")
            .join("SKILL.md")
            .exists()
    );
}

#[test]
fn re_adopting_an_untouched_tree_is_unchanged_and_exits_0() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    assert_eq!(adopt(&source, &vault, &[], dir.path()).code, 0);
    let before = fs::read_to_string(adopted_note(&vault, "adopted")).unwrap();

    let again = adopt(&source, &vault, &[], dir.path());
    assert_eq!(again.code, 0, "{}", again.stderr);
    assert!(
        again.stdout.contains("code-review.md  unchanged"),
        "{}",
        again.stdout
    );
    assert!(again.stderr.contains("1 unchanged"), "{}", again.stderr);
    assert_eq!(
        fs::read_to_string(adopted_note(&vault, "adopted")).unwrap(),
        before
    );
}

#[test]
fn a_diverged_re_adopt_is_refused_exits_1_and_overwrite_names_the_note() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    assert_eq!(adopt(&source, &vault, &[], dir.path()).code, 0);

    let note_path = adopted_note(&vault, "adopted");
    let mut note = fs::read_to_string(&note_path).unwrap();
    note.push_str("\nedited in the vault\n");
    fs::write(&note_path, &note).unwrap();
    let skill_path = source.join("code-review").join("SKILL.md");
    let mut skill = fs::read_to_string(&skill_path).unwrap();
    skill.push_str("\nA new paragraph.\n");
    fs::write(&skill_path, &skill).unwrap();

    let again = adopt(&source, &vault, &[], dir.path());
    assert_eq!(again.code, 1, "{}", again.stderr);
    assert!(
        again.stdout.contains("refused · diverged:"),
        "{}",
        again.stdout
    );
    // The refusal is the rail: the vault's copy is untouched.
    assert!(
        fs::read_to_string(&note_path)
            .unwrap()
            .contains("edited in the vault")
    );

    // Naming a different note does not lift this one's refusal.
    let other_note = vault
        .join("plugins")
        .join("adopted")
        .join("skills")
        .join("other")
        .join("other.md");
    let wrong = adopt(
        &source,
        &vault,
        &["--overwrite", &other_note.display().to_string()],
        dir.path(),
    );
    assert_eq!(wrong.code, 1);

    let forced = adopt(
        &source,
        &vault,
        &["--overwrite", &note_path.display().to_string()],
        dir.path(),
    );
    assert_eq!(forced.code, 0, "{}", forced.stderr);
    // It says what it discarded before it says it replaced it.
    assert!(
        forced.stdout.contains("updated · overwritten · diverged:"),
        "{}",
        forced.stdout
    );
    let final_note = fs::read_to_string(&note_path).unwrap();
    assert!(!final_note.contains("edited in the vault"));
    assert!(final_note.contains("A new paragraph."));
}

#[test]
fn dry_run_is_the_cores_mode_same_plan_and_nothing_written() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    let dry = run(
        &[
            "adopt",
            &source.display().to_string(),
            "--vault",
            &vault_str(&vault),
            "--dry-run",
            "--json",
        ],
        dir.path(),
    );
    assert_eq!(dry.code, 0, "{}", dry.stderr);
    assert!(!vault.join("plugins").exists());
    // Never prompts, even without --yes and off a TTY — a plan has nothing to
    // confirm.
    assert!(dry.stderr.contains("dry run"), "{}", dry.stderr);

    let real = run(
        &[
            "adopt",
            &source.display().to_string(),
            "--vault",
            &vault_str(&vault),
            "--yes",
            "--json",
        ],
        dir.path(),
    );
    assert_eq!(real.code, 0, "{}", real.stderr);

    let dry_json: serde_json::Value = serde_json::from_str(&dry.stdout).unwrap();
    let real_json: serde_json::Value = serde_json::from_str(&real.stdout).unwrap();
    assert_eq!(dry_json, real_json);
}

#[test]
fn plugin_groups_the_adoption_and_set_targets_narrows_what_it_will_publish_to() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    let result = adopt(
        &source,
        &vault,
        &["--plugin", "reviewing", "--set-targets", "claude"],
        dir.path(),
    );
    assert_eq!(result.code, 0, "{}", result.stderr);

    let note = fs::read_to_string(adopted_note(&vault, "reviewing")).unwrap();
    assert!(note.contains("ap-plugin: reviewing"));
    assert!(note.contains("ap-targets"));
    assert!(note.contains("claude"));
}

#[test]
fn an_unknown_set_targets_value_stops_that_source_before_anything_is_written_exit_1() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    let result = adopt(&source, &vault, &["--set-targets", "claud"], dir.path());

    // A source-level blocker rides the report and the run completes: exit 1,
    // the same shape a destination-level blocker gives a publish.
    assert_eq!(result.code, 1);
    assert_eq!(result.stdout, "");
    assert!(
        result.stderr.contains("adopt failed for"),
        "{}",
        result.stderr
    );
    assert!(
        result.stderr.contains("unknown-target"),
        "{}",
        result.stderr
    );
    assert!(!vault.join("plugins").exists());
}

#[test]
fn one_bad_source_does_not_abandon_the_good_ones() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    // A source the core refuses whole — it exists, and has no SKILL.md
    // anywhere under it — beside one that adopts cleanly.
    let empty = dir.path().join("not-a-skill-source");
    fs::create_dir_all(&empty).unwrap();
    fs::write(empty.join("notes.txt"), "nothing publishable here\n").unwrap();

    let result = run(
        &[
            "adopt",
            &empty.display().to_string(),
            "--from",
            &source.display().to_string(),
            "--vault",
            &vault_str(&vault),
            "--yes",
            "--json",
        ],
        dir.path(),
    );

    // The run completed: exit 1, not 2, and the good source still landed.
    assert_eq!(result.code, 1, "{}", result.stderr);
    assert!(
        result
            .stderr
            .contains(&format!("adopt failed for {}", empty.display())),
        "{}",
        result.stderr
    );
    let parsed: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    let skills = parsed["skills"].as_array().unwrap();
    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0]["name"], "code-review");
    assert_eq!(skills[0]["status"], "adopted");
    let failed = parsed["failed"].as_array().unwrap();
    assert_eq!(failed.len(), 1);
    assert_eq!(failed[0]["source"], empty.display().to_string());
    assert!(adopted_note(&vault, "adopted").exists());
}

#[test]
fn an_ordinary_runs_document_has_no_failed_key_at_all() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    let result = adopt(&source, &vault, &["--json"], dir.path());
    assert_eq!(result.code, 0, "{}", result.stderr);
    let parsed: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    assert!(parsed.as_object().unwrap().get("failed").is_none());
}

#[test]
fn namespace_decides_how_the_provenance_is_spelled() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    let result = adopt(&source, &vault, &["--namespace", "x"], dir.path());
    assert_eq!(result.code, 0, "{}", result.stderr);

    let note = fs::read_to_string(adopted_note(&vault, "adopted")).unwrap();
    assert!(note.contains("x-source:"));
    assert!(note.contains("x-plugin: adopted"));
    assert!(!note.contains("ap-source:"));
}

#[test]
fn as_and_promote_are_honestly_not_implemented_exit_2() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    let renamed = adopt(&source, &vault, &["--as", "reviewer"], dir.path());
    assert_eq!(renamed.code, 2);
    assert!(
        renamed.stderr.contains("not implemented: adopt --as"),
        "{}",
        renamed.stderr
    );

    let promoted = adopt(&source, &vault, &["--promote"], dir.path());
    assert_eq!(promoted.code, 2);
    assert!(
        promoted.stderr.contains("not implemented: adopt --promote"),
        "{}",
        promoted.stderr
    );
    assert!(!vault.join("plugins").exists());
}

#[test]
fn adopt_off_a_tty_without_yes_is_a_usage_error_not_a_silent_write() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    let result = run(
        &[
            "adopt",
            &source.display().to_string(),
            "--vault",
            &vault_str(&vault),
        ],
        dir.path(),
    );
    assert_eq!(result.code, 3);
    assert!(!vault.join("plugins").exists());
}

#[test]
fn a_source_that_is_not_there_is_the_cores_own_refusal_not_a_second_copy_of_it() {
    let (dir, vault) = fixture();
    let missing = dir.path().join("nowhere");
    let result = run(
        &[
            "adopt",
            &missing.display().to_string(),
            "--vault",
            &vault_str(&vault),
            "--yes",
        ],
        dir.path(),
    );

    // Exit 1 like any other source a rail stopped, and the message is the
    // core's `RootNotFound` — this CLI does not pre-check the path.
    assert_eq!(result.code, 1);
    assert!(
        result.stderr.contains("corpus root not found"),
        "{}",
        result.stderr
    );
    assert!(
        result.stderr.contains(&missing.display().to_string()),
        "{}",
        result.stderr
    );
}

#[test]
fn only_across_several_sources_is_a_usage_error_not_a_run_of_spurious_failures() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    // The core refuses a requested name that matched nothing PER SOURCE, so
    // broadcasting one list would fail every source not holding every name.
    let result = run(
        &[
            "adopt",
            &source.display().to_string(),
            "--from",
            &dir.path().display().to_string(),
            "--vault",
            &vault_str(&vault),
            "--only",
            "code-review",
            "--yes",
        ],
        dir.path(),
    );
    assert_eq!(result.code, 3);
    assert!(
        result.stderr.contains("--only selects within one source"),
        "{}",
        result.stderr
    );
}

#[test]
fn with_no_source_and_no_scan_locations_it_is_a_usage_error_exit_3() {
    let (dir, vault) = fixture();
    let result = run(
        &["adopt", "--vault", &vault_str(&vault), "--yes"],
        dir.path(),
    );
    assert_eq!(result.code, 3);
    assert!(
        result.stderr.contains("scan locations"),
        "{}",
        result.stderr
    );
}

#[test]
fn a_configured_skills_root_is_where_adopt_writes_and_where_build_looks() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    // The agreement `AdoptRequest.skills_root`'s doc requires: "what lands
    // here must be what that scan finds". Two resolvers with two answers
    // would put adopted notes somewhere `build` never looks, and nothing
    // would report it — so one run proves both ends.
    let config_path = dir.path().join("rooted.yaml");
    fs::write(
        &config_path,
        format!(
            "vault: {}\ndestinations: []\nmarketplace:\n  name: demo\n  default_plugin: tools\n  out: market\n  skills_root: vault/library\n",
            vault_str(&vault)
        ),
    )
    .unwrap();

    let adopted = run(
        &[
            "adopt",
            &source.display().to_string(),
            "--config",
            &config_path.display().to_string(),
            "--yes",
        ],
        dir.path(),
    );
    assert_eq!(adopted.code, 0, "{}", adopted.stderr);
    // `plugins/` under the configured root, not assumed of it.
    assert!(
        vault
            .join("library")
            .join("plugins")
            .join("adopted")
            .join("skills")
            .join("code-review")
            .join("code-review.md")
            .exists()
    );
    // Not the default root, which nothing configured here.
    assert!(!vault.join("plugins").exists());

    let built = run(
        &[
            "build",
            "--config",
            &config_path.display().to_string(),
            "--yes",
        ],
        dir.path(),
    );
    assert_eq!(built.code, 0, "{}", built.stderr);
    assert!(
        built.stdout.contains("claude/adopted  written · 1 skill"),
        "{}",
        built.stdout
    );
}

#[test]
fn the_configured_scan_locations_are_the_default_source() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    let config_path = dir.path().join("scan-config.yaml");
    fs::write(
        &config_path,
        format!(
            "vault: {}\ndestinations: []\nscan_locations:\n  - {}\n",
            vault_str(&vault),
            source.display()
        ),
    )
    .unwrap();

    let result = run(
        &[
            "adopt",
            "--config",
            &config_path.display().to_string(),
            "--yes",
        ],
        dir.path(),
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert!(
        result.stdout.contains("code-review.md  adopted"),
        "{}",
        result.stdout
    );
}

#[test]
fn from_git_stamps_the_repository_and_the_commit_never_the_checkout_path() {
    let (dir, vault) = fixture();
    // A repository reached over `file://`: the fetch is real, the network is
    // not.
    let repo = dir.path().join("repo");
    let sha = commit_git_fixture(&repo);

    common::with_git_cache(|| {
        let reference = format!("file://{}@main#skills", repo.display());
        let first = run(
            &[
                "adopt",
                "--from-git",
                &reference,
                "--vault",
                &vault_str(&vault),
                "--yes",
            ],
            dir.path(),
        );
        assert_eq!(first.code, 0, "{}", first.stderr);
        assert!(
            first.stdout.contains("code-review.md  adopted"),
            "{}",
            first.stdout
        );

        let note = fs::read_to_string(adopted_note(&vault, "adopted")).unwrap();
        assert!(note.contains("ap-source:"));
        // The repository and the commit, which still name the same bytes
        // after the cache is purged — not the checkout directory, which does
        // not.
        assert!(note.contains(&format!("file://{}/skills@{sha}", repo.display())));
        assert!(!note.contains("checkouts"));

        // Stamping the label rather than the path is what makes the second
        // import read as the same source instead of as somebody else's.
        let again = run(
            &[
                "adopt",
                "--from-git",
                &reference,
                "--vault",
                &vault_str(&vault),
                "--yes",
            ],
            dir.path(),
        );
        assert_eq!(again.code, 0, "{}", again.stderr);
        assert!(
            again.stdout.contains("code-review.md  unchanged"),
            "{}",
            again.stdout
        );
    });
}

#[test]
fn a_repository_that_will_not_fetch_fails_that_source_alone_not_the_run() {
    let (dir, vault) = fixture();
    let source = adopt_source(dir.path());
    // `file://` at a path that is not a repository: the fetch fails without a
    // network. The good source beside it is one the run would adopt cleanly.
    common::with_git_cache(|| {
        let no_such = dir.path().join("no-such-repo");
        let result = run(
            &[
                "adopt",
                &source.display().to_string(),
                "--from-git",
                &format!("file://{}", no_such.display()),
                "--vault",
                &vault_str(&vault),
                "--yes",
            ],
            dir.path(),
        );
        // One source refused, so the completed run exits 1 — the same code a
        // source a rail stopped produces.
        assert_eq!(result.code, 1, "{}", result.stderr);
        assert!(
            result.stdout.contains("code-review.md  adopted"),
            "{}",
            result.stdout
        );
        assert!(
            result.stderr.contains("adopt failed for "),
            "{}",
            result.stderr
        );
        assert!(result.stderr.contains("no-such-repo"), "{}", result.stderr);
    });
}

#[test]
fn from_git_refuses_a_spelling_that_is_not_a_repository_exit_3() {
    let (dir, vault) = fixture();
    let result = run(
        &[
            "adopt",
            "--from-git",
            "./not-a-repo",
            "--vault",
            &vault_str(&vault),
            "--yes",
        ],
        dir.path(),
    );
    assert_eq!(result.code, 3);
    assert!(
        result.stderr.contains("--from-git wants a repository"),
        "{}",
        result.stderr
    );
}

// --- list --------------------------------------------------------------------

/// A second note, so a row's targets and its folder's guess can differ.
fn widen_vault(vault: &Path) {
    fs::create_dir_all(vault.join("commands").join("tidy")).unwrap();
    fs::write(
        vault.join("commands").join("tidy").join("tidy.md"),
        "---\nname: tidy\ndescription: tidies up\nap-kind: skill\nap-targets: []\n---\nTidy.\n",
    )
    .unwrap();
    fs::write(
        vault.join("skills").join("code-review").join("code-review.md"),
        "---\nname: code-review\ndescription: reviews code\nap-targets: [claude-code, codex]\n---\nReview the diff.\n",
    )
    .unwrap();
}

#[test]
fn the_three_readings_of_a_targets_key_each_render_differently() {
    let (dir, vault) = fixture();
    widen_vault(&vault);
    let listed = run(
        &["list", "--vault", &vault_str(&vault), "--quiet"],
        dir.path(),
    );
    assert_eq!(listed.code, 0, "{}", listed.stderr);
    assert!(
        listed.stdout.contains("claude-code, codex"),
        "{}",
        listed.stdout
    );
    assert!(listed.stdout.contains("nowhere"), "{}", listed.stdout);

    // No key at all is every destination.
    fs::remove_dir_all(vault.join("commands")).unwrap();
    fs::write(
        vault
            .join("skills")
            .join("code-review")
            .join("code-review.md"),
        "---\nname: code-review\ndescription: reviews code\n---\nReview the diff.\n",
    )
    .unwrap();
    let absent = run(
        &["list", "--vault", &vault_str(&vault), "--quiet"],
        dir.path(),
    );
    assert!(
        absent.stdout.contains("every destination"),
        "{}",
        absent.stdout
    );
}

// --- the configurable frontmatter namespace ----------------------------------

/// A config naming the vault and, optionally, a namespace stem.
fn namespace_config(dir: &Path, vault: &Path, stem: Option<&str>) -> String {
    let path = dir.join("namespace-config.yaml");
    let mut yaml = format!("vault: {}\n", vault.display());
    if let Some(stem) = stem {
        yaml.push_str(&format!("namespace: {stem}\n"));
    }
    fs::write(&path, yaml).unwrap();
    path.display().to_string()
}

#[test]
fn an_invalid_stem_in_the_config_is_a_run_level_blocker_at_load() {
    let (dir, vault) = fixture();
    let config = namespace_config(dir.path(), &vault, Some("my-vault"));

    let run = run(&["list", "--config", &config], dir.path());

    // A malformed config file is exit 2: nothing attempted, the report empty,
    // stderr naming the reason. Not exit 4 — that one means "no
    // configuration, run `tradecraft init`".
    assert_eq!(run.code, 2, "{}", run.stderr);
    assert_eq!(run.stdout, "");
    // The offending stem, and the core's own reason for refusing it.
    assert!(
        run.stderr
            .contains("`my-vault` cannot be a frontmatter namespace"),
        "{}",
        run.stderr
    );
    assert!(
        run.stderr
            .contains("`-` separates the namespace from the field"),
        "{}",
        run.stderr
    );
    // And where it was set, which the core cannot know.
    assert!(run.stderr.contains(&config), "{}", run.stderr);
}

#[test]
fn namespace_overrides_the_configured_stem_for_this_run_and_never_writes_it_back() {
    let (dir, vault) = fixture();
    fs::write(
        vault.join("skills").join("code-review").join("code-review.md"),
        "---\nname: code-review\ndescription: reviews code\nzz-targets: [codex]\nx-targets: [claude-code]\n---\nReview the diff.\n",
    )
    .unwrap();
    let config = namespace_config(dir.path(), &vault, Some("x"));
    let before = fs::read_to_string(&config).unwrap();

    let run = run(
        &["list", "--config", &config, "--namespace", "zz", "--quiet"],
        dir.path(),
    );
    assert_eq!(run.code, 0, "{}", run.stderr);
    // The flag's namespace was read; the file's is somebody else's key under
    // `zz`.
    assert!(run.stdout.contains("codex"), "{}", run.stdout);
    assert!(!run.stdout.contains("claude-code"), "{}", run.stdout);
    // The file on disk is byte-identical: an override is for one run.
    assert_eq!(fs::read_to_string(&config).unwrap(), before);
}

#[test]
fn namespace_works_with_no_config_file_at_all() {
    let (dir, vault) = fixture();
    fs::create_dir_all(vault.join("commands").join("tidy")).unwrap();
    fs::write(
        vault.join("commands").join("tidy").join("tidy.md"),
        "---\nname: tidy\ndescription: tidies up\nv-kind: skill\n---\nTidy.\n",
    )
    .unwrap();

    let run = run(
        &[
            "list",
            "--vault",
            &vault_str(&vault),
            "--namespace",
            "v",
            "--quiet",
        ],
        dir.path(),
    );
    assert_eq!(run.code, 0, "{}", run.stderr);
    // The declared kind won over the folder's guess, which only happens if
    // `v-kind` was read as ours.
    assert!(
        run.stdout.contains("skill (folder: command)"),
        "{}",
        run.stdout
    );
}

// --- status: the states a published destination can be in --------------------

/// The destination `status_config` names.
fn dest_of(dir: &Path) -> PathBuf {
    dir.join("dest")
}

/// One publish through the core, so a `status` test has a destination in a
/// state to report on. These `status` tests drive the core directly rather
/// than the CLI's `publish` verb, which has its own tests.
fn publish(vault: &Path, dest: &Path, note: &str) {
    let report = publish_skill(
        &NativeVfs,
        &PublishRequest {
            skill_path: vault.join(note),
            destination_root: dest.to_path_buf(),
            target: "claude".to_string(),
            mode: PublishMode::Write,
            skills_root: Some(vault.to_path_buf()),
            published_at: Some("2026-01-01T00:00:00Z".to_string()),
            overwrite: Vec::new(),
        },
        &Namespace::default(),
    )
    .unwrap();
    assert!(
        report
            .files
            .iter()
            .any(|f| f.status == PublishStatus::Written),
        "nothing was published"
    );
}

/// The entry file a `claude` publish of the fixture note writes.
fn published_entry(dest: &Path) -> PathBuf {
    dest.join(".claude")
        .join("skills")
        .join("code-review")
        .join("SKILL.md")
}

#[test]
fn a_published_untouched_destination_is_current() {
    let (dir, vault) = fixture();
    let config = status_config(dir.path(), &vault);
    publish(
        &vault,
        &dest_of(dir.path()),
        "skills/code-review/code-review.md",
    );

    let run = run(&["status", "--config", &config], dir.path());
    assert_eq!(run.code, 0, "{}", run.stderr);
    assert!(run.stdout.contains("current"), "{}", run.stdout);
    assert!(run.stdout.contains("last published "), "{}", run.stdout);
    assert!(run.stderr.contains("1 current"), "{}", run.stderr);
}

#[test]
fn editing_the_note_makes_it_stale_and_check_exits_1() {
    let (dir, vault) = fixture();
    let config = status_config(dir.path(), &vault);
    publish(
        &vault,
        &dest_of(dir.path()),
        "skills/code-review/code-review.md",
    );
    fs::write(
        vault
            .join("skills")
            .join("code-review")
            .join("code-review.md"),
        "---\nname: code-review\ndescription: reviews code, carefully\n---\nReview it twice.\n",
    )
    .unwrap();

    let report = run(&["status", "--config", &config], dir.path());
    assert_eq!(report.code, 0, "{}", report.stderr);
    assert!(report.stdout.contains("stale"), "{}", report.stdout);

    let checked = run(&["status", "--config", &config, "--check"], dir.path());
    assert_eq!(checked.code, 1, "{}", checked.stderr);
}

#[test]
fn a_file_edited_at_the_destination_is_a_conflict_and_the_row_names_the_file() {
    let (dir, vault) = fixture();
    let config = status_config(dir.path(), &vault);
    let dest = dest_of(dir.path());
    publish(&vault, &dest, "skills/code-review/code-review.md");
    fs::write(
        published_entry(&dest),
        "# edited by hand at the destination\n",
    )
    .unwrap();

    let run = run(&["status", "--config", &config, "--check"], dir.path());
    assert_eq!(run.code, 1, "{}", run.stderr);
    assert!(run.stdout.contains("conflict"), "{}", run.stdout);
    assert!(
        run.stdout.contains(".claude/skills/code-review/SKILL.md"),
        "{}",
        run.stdout
    );
}

#[test]
fn an_unreadable_manifest_is_unknown_with_a_reason_not_an_error() {
    let (dir, vault) = fixture();
    let config = status_config(dir.path(), &vault);
    let dest = dest_of(dir.path());
    publish(&vault, &dest, "skills/code-review/code-review.md");
    fs::write(
        dest.join(".agent-pants").join("manifest.json"),
        "{ truncated",
    )
    .unwrap();

    let run = run(&["status", "--config", &config, "--check"], dir.path());
    assert_eq!(run.code, 1, "{}", run.stderr);
    assert!(run.stdout.contains("unknown"), "{}", run.stdout);
    assert!(run.stdout.contains("bad-manifest"), "{}", run.stdout);
}

#[test]
fn a_destination_the_notes_ap_targets_excludes_reads_as_not_published() {
    let (dir, vault) = fixture();
    let config = status_config(dir.path(), &vault);
    fs::write(
        vault.join("skills").join("code-review").join("code-review.md"),
        "---\nname: code-review\ndescription: reviews code\nap-targets:\n  - codex\n---\nReview the diff.\n",
    )
    .unwrap();

    let run = run(&["status", "--config", &config, "--check"], dir.path());
    assert_eq!(run.code, 0, "{}", run.stderr);
    assert!(run.stdout.contains("not published"), "{}", run.stdout);
    for state in ["never-published", "current", "stale", "conflict", "unknown"] {
        assert!(
            !run.stdout.contains(&format!(")  {state}")),
            "{state} in {}",
            run.stdout
        );
    }
}

#[test]
fn with_no_note_every_publishable_unit_the_scan_finds_gets_a_row() {
    let (dir, vault) = fixture();
    let config = status_config(dir.path(), &vault);
    fs::create_dir_all(vault.join("skills").join("release-notes")).unwrap();
    fs::write(
        vault
            .join("skills")
            .join("release-notes")
            .join("release-notes.md"),
        "---\nname: release-notes\ndescription: writes release notes\n---\nWrite them.\n",
    )
    .unwrap();

    let run = run(&["status", "--config", &config], dir.path());
    assert_eq!(run.code, 0, "{}", run.stderr);
    assert!(
        run.stdout.contains("skills/code-review/code-review.md ->"),
        "{}",
        run.stdout
    );
    assert!(
        run.stdout
            .contains("skills/release-notes/release-notes.md ->"),
        "{}",
        run.stdout
    );
}

#[test]
fn a_hook_is_n_a_rather_than_unknown_and_status_check_still_passes() {
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join("hook-vault");
    let dest = dir.path().join("dest");
    let plugin = vault
        .join("marketplaces")
        .join("acme")
        .join("plugins")
        .join("review");
    fs::create_dir_all(plugin.join("skills")).unwrap();
    fs::create_dir_all(plugin.join("hooks")).unwrap();
    fs::create_dir_all(&dest).unwrap();
    fs::write(
        vault.join("marketplaces").join("acme").join("acme.md"),
        "---\nname: acme\ndescription: Acme skills.\n---\n\nOne marketplace.\n",
    )
    .unwrap();
    fs::write(
        plugin.join("review.md"),
        "---\nname: review\ndescription: Skills for reviewing a change.\nap-version: 1.0.0\n---\n\nThe review plugin.\n",
    )
    .unwrap();
    fs::write(
        plugin.join("skills").join("code-review.md"),
        "---\nname: code-review\ndescription: Reviews a diff.\n---\n\nRead the diff.\n",
    )
    .unwrap();
    fs::write(
        plugin.join("hooks").join("lint-on-write.md"),
        "---\nname: lint-on-write\ndescription: Runs the linter after a write.\nevent: PostToolUse\nmatcher: Edit|Write\ntimeout: 5000\n---\n\njust lint\n",
    )
    .unwrap();
    let config = dir.path().join("hook-config.yaml");
    fs::write(
        &config,
        format!(
            "vault: {}\ndestinations:\n  - root: {}\n    target: claude-code\n",
            vault.display(),
            dest.display()
        ),
    )
    .unwrap();

    let run = run(
        &[
            "status",
            "--config",
            &config.display().to_string(),
            "--check",
        ],
        dir.path(),
    );
    assert_eq!(run.code, 0, "{}", run.stderr);
    assert!(run.stdout.contains("lint-on-write.md"), "{}", run.stdout);
    assert!(
        run.stdout
            .contains("n/a · a hook is not published to a destination"),
        "{}",
        run.stdout
    );
    assert!(
        run.stdout
            .contains("n/a · a marketplace is not published to a destination"),
        "{}",
        run.stdout
    );
    assert!(!run.stdout.contains("unknown"), "{}", run.stdout);
    assert!(run.stderr.contains("n/a"), "{}", run.stderr);
}

#[test]
fn a_note_outside_the_vault_prints_a_relative_path_not_an_absolute_one() {
    let (dir, vault) = fixture();
    let config = status_config(dir.path(), &vault);
    // A sibling of the vault, addressed through it, so the row reads `../…` rather than the whole path.
    let outside = dir.path().join("outside");
    fs::create_dir_all(&outside).unwrap();
    fs::write(
        outside.join("stray.md"),
        "---\nname: stray\ndescription: a stray note\n---\nStray.\n",
    )
    .unwrap();

    let run = run(
        &[
            "status",
            "../outside/stray.md",
            "--config",
            &config,
            "--quiet",
        ],
        dir.path(),
    );
    assert!(
        run.stdout.starts_with("../outside/stray.md ->"),
        "{}",
        run.stdout
    );
}

#[test]
fn a_named_note_collapses_dot_segments_the_way_resolve_path_does() {
    let (dir, vault) = fixture();
    let config = status_config(dir.path(), &vault);
    let run = run(
        &[
            "status",
            "./skills/../skills/code-review/code-review.md",
            "--config",
            &config,
            "--quiet",
        ],
        dir.path(),
    );
    assert_eq!(run.code, 0, "{}", run.stderr);
    assert!(
        run.stdout
            .starts_with("skills/code-review/code-review.md ->"),
        "{}",
        run.stdout
    );
}

#[test]
fn a_config_naming_a_directory_is_unreadable_not_missing() {
    let dir = tempfile::tempdir().unwrap();
    let as_dir = dir.path().join("agent-pants.yaml");
    fs::create_dir_all(&as_dir).unwrap();
    // Existence, not "is a file": the path is there, so the failure is the
    // read, and that is a blocker (2) rather than "--config names a file that
    // is not there" (4).
    let run = run(
        &["list", "--config", &as_dir.display().to_string()],
        dir.path(),
    );
    assert_eq!(run.code, 2, "{}", run.stderr);
    assert!(
        run.stderr.starts_with("configuration unreadable: "),
        "{}",
        run.stderr
    );
}

// --- publish: --dry-run and --overwrite --------------------------------------

/// `publish skills/code-review/code-review.md --vault <vault> --to <dest>
/// --target claude --dry-run`, plus whatever `extra` adds.
fn publish_dry(vault: &Path, dest: &Path, extra: &[&str], cwd: &Path) -> Run {
    run_argv(publish_argv(vault, dest, "--dry-run"), extra, cwd)
}

/// `publish <the fixture's one note> --vault … --to … --target claude`, plus
/// the one flag that tells a plan from a write.
fn publish_argv(vault: &Path, dest: &Path, mode: &str) -> Vec<String> {
    vec![
        "publish".to_string(),
        "skills/code-review/code-review.md".to_string(),
        "--vault".to_string(),
        vault_str(vault),
        "--to".to_string(),
        dest.display().to_string(),
        "--target".to_string(),
        "claude".to_string(),
        mode.to_string(),
    ]
}

/// The same note, published for real: `--yes` in place of `--dry-run`, plus
/// whatever `extra` adds.
fn publish_real(vault: &Path, dest: &Path, extra: &[&str], cwd: &Path) -> Run {
    run_argv(publish_argv(vault, dest, "--yes"), extra, cwd)
}

/// The destination-relative path the fixture's one skill renders to under a
/// `claude` destination.
const PUBLISHED_SKILL: &str = ".claude/skills/code-review/SKILL.md";

fn published_skill_path(dest: &Path) -> PathBuf {
    dest.join(".claude")
        .join("skills")
        .join("code-review")
        .join("SKILL.md")
}

/// A sorted `Object.keys()`-equivalent, for comparing a JSON object's key
/// set without caring about field order.
fn sorted_keys(value: &serde_json::Value) -> Vec<String> {
    let mut keys: Vec<String> = value.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    keys
}

/// Publish for real, then hand-edit what landed: the next run refuses
/// `conflict`.
fn conflict(vault: &Path, dest: &Path, cwd: &Path) {
    let published = publish_real(vault, dest, &[], cwd);
    assert_eq!(published.code, 0, "{}", published.stderr);
    let path = published_skill_path(dest);
    let mut content = fs::read_to_string(&path).unwrap();
    content.push_str("\nedited here\n");
    fs::write(&path, content).unwrap();
}

#[test]
fn dry_run_over_a_clean_destination_reports_every_file_written_and_leaves_the_destination_empty() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();

    let run = publish_dry(&vault, &dest, &[], dir.path());

    assert_eq!(run.code, 0, "{}", run.stderr);
    // The outcome, not the status alone: an empty destination is a first
    // write, which the same line for a stale one does not say.
    assert!(
        run.stdout
            .contains(".claude/skills/code-review/SKILL.md  written · first-write"),
        "{}",
        run.stdout
    );
    assert!(
        run.stdout
            .contains(".claude/skills/code-review/references/style.md  written · first-write"),
        "{}",
        run.stdout
    );
    // Marked as a plan, not a completed publish — and not gated by --quiet.
    assert!(run.stderr.contains("dry run"), "{}", run.stderr);
    assert!(run.stderr.contains("(dry run)"), "{}", run.stderr);
    // The tree, not just one file: nothing was created anywhere under dest.
    assert_eq!(tree(&dest), Vec::<PathBuf>::new());
}

#[test]
fn dry_run_over_an_identical_destination_reports_unchanged_still_writes_nothing() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();
    let real = publish_real(&vault, &dest, &[], dir.path());
    assert_eq!(real.code, 0, "{}", real.stderr);
    let before = tree(&dest);

    let run = publish_dry(&vault, &dest, &[], dir.path());

    assert_eq!(run.code, 0, "{}", run.stderr);
    assert!(
        run.stdout
            .contains(".claude/skills/code-review/SKILL.md  unchanged"),
        "{}",
        run.stdout
    );
    assert!(
        run.stdout
            .contains(".claude/skills/code-review/references/style.md  unchanged"),
        "{}",
        run.stdout
    );
    // A dry run over an already-published destination touches nothing on it.
    assert_eq!(tree(&dest), before);
}

#[test]
fn a_rewrite_of_stale_output_does_not_read_as_a_first_write_on_the_line_and_in_json() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();
    let real = publish_real(&vault, &dest, &[], dir.path());
    assert_eq!(real.code, 0, "{}", real.stderr);
    fs::write(
        vault.join("skills").join("code-review").join("code-review.md"),
        "---\nname: code-review\ndescription: reviews code, carefully\n---\nReview the diff twice.\n",
    )
    .unwrap();

    let run = publish_dry(&vault, &dest, &[], dir.path());
    assert!(
        run.stdout
            .contains(".claude/skills/code-review/SKILL.md  written · rewrite"),
        "{}",
        run.stdout
    );
    assert!(
        !run.stdout
            .contains(".claude/skills/code-review/SKILL.md  written · first-write"),
        "{}",
        run.stdout
    );

    let json = publish_dry(&vault, &dest, &["--json"], dir.path());
    let parsed: serde_json::Value = serde_json::from_str(&json.stdout).unwrap();
    let entry = parsed["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["path"] == PUBLISHED_SKILL)
        .unwrap();
    // The same token either way, so a reader and a script agree.
    assert_eq!(entry["outcome"], "rewrite");
}

#[test]
fn dry_run_never_prompts_even_without_yes_and_off_a_tty() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();

    // No --yes here. An ordinary writing command in this position is a usage
    // error; a dry run must reach the run instead, proving the confirmation
    // gate is skipped outright rather than auto-answered.
    let run = publish_dry(&vault, &dest, &[], dir.path());
    assert_eq!(run.code, 0, "{}", run.stderr);
}

#[test]
fn a_dry_run_whose_real_counterpart_refuses_exits_1_same_as_the_real_run_would() {
    let (dir, vault) = fixture();

    // The destination IS the vault: the destination-guard rail refuses every
    // file.
    let run = publish_dry(&vault, &vault, &[], dir.path());
    assert_eq!(run.code, 1, "{}", run.stderr);
    assert!(run.stdout.contains("refused"), "{}", run.stdout);
}

#[test]
fn dry_run_json_emits_the_same_document_shape_as_a_real_run() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();

    let run = publish_dry(&vault, &dest, &["--json"], dir.path());
    assert_eq!(run.code, 0, "{}", run.stderr);
    let parsed: serde_json::Value = serde_json::from_str(&run.stdout).unwrap();
    let files = parsed["files"].as_array().unwrap();
    assert!(
        files.iter().all(|f| f["status"] == "written"),
        "{}",
        run.stdout
    );
    assert_eq!(sorted_keys(&parsed), vec!["files".to_string()]);
    for file in files {
        assert_eq!(
            sorted_keys(file),
            vec![
                "destination".to_string(),
                "outcome".to_string(),
                "path".to_string(),
                "reason".to_string(),
                "skill".to_string(),
                "status".to_string(),
                "target".to_string(),
            ]
        );
    }
    // The document alone, on stdout — not the stderr marker.
    assert!(!run.stdout.contains("dry run"), "{}", run.stdout);
    assert_eq!(tree(&dest), Vec::<PathBuf>::new());
}

#[test]
fn run_dry_then_run_for_real_over_the_same_fixture_the_reports_match() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();

    let dry = publish_dry(&vault, &dest, &["--json"], dir.path());
    assert_eq!(dry.code, 0, "{}", dry.stderr);
    assert_eq!(tree(&dest), Vec::<PathBuf>::new()); // still untouched

    let real = publish_real(&vault, &dest, &["--json"], dir.path());
    assert_eq!(real.code, 0, "{}", real.stderr);

    // The plan and the run it predicted, byte-for-byte at the JSON wire.
    let dry_json: serde_json::Value = serde_json::from_str(&dry.stdout).unwrap();
    let real_json: serde_json::Value = serde_json::from_str(&real.stdout).unwrap();
    assert_eq!(dry_json, real_json);
}

// --- publish --overwrite ------------------------------------------------------

#[test]
fn overwrite_help_says_the_path_is_destination_relative() {
    let dir = tempfile::tempdir().unwrap();
    let run = run(&["publish", "--help"], dir.path());
    assert!(
        run.stdout.contains("destination-relative"),
        "{}",
        run.stdout
    );
}

#[test]
fn a_path_matching_no_projected_file_is_named_on_stderr() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();

    let run = publish_real(
        &vault,
        &dest,
        &["--overwrite", ".claude/skills/typo/SKILL.md"],
        dir.path(),
    );

    assert!(
        run.stderr.contains("matched no projected file"),
        "{}",
        run.stderr
    );
    assert!(
        run.stderr.contains(".claude/skills/typo/SKILL.md"),
        "{}",
        run.stderr
    );
    // Stdout stays the report and nothing else.
    assert!(
        !run.stdout.contains("matched no projected file"),
        "{}",
        run.stdout
    );
    // The run did what it was asked to do, so its exit code is its own: by
    // the time the unmatched set is known the files are written.
    assert_eq!(run.code, 0, "{}", run.stderr);
}

#[test]
fn a_path_matching_a_file_that_needed_no_acknowledgement_is_not_reported() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();
    let first = publish_real(&vault, &dest, &[], dir.path());
    assert_eq!(first.code, 0, "{}", first.stderr);

    let run = publish_real(&vault, &dest, &["--overwrite", PUBLISHED_SKILL], dir.path());

    assert!(
        !run.stderr.contains("matched no projected file"),
        "{}",
        run.stderr
    );
    assert_eq!(run.code, 0, "{}", run.stderr);
}

#[test]
fn a_path_matching_in_one_pair_only_is_not_reported() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();
    // Unmatched means matched no projected file ANYWHERE in the run. The
    // second note projects to a different path, and warning per pair would
    // fire on entirely correct usage.
    fs::create_dir_all(vault.join("skills").join("commit-msg")).unwrap();
    fs::write(
        vault
            .join("skills")
            .join("commit-msg")
            .join("commit-msg.md"),
        "---\nname: commit-msg\ndescription: writes commit messages\n---\nWrite it.\n",
    )
    .unwrap();

    let run = run(
        &[
            "publish",
            "skills/code-review/code-review.md",
            "skills/commit-msg/commit-msg.md",
            "--vault",
            &vault_str(&vault),
            "--to",
            &dest.display().to_string(),
            "--target",
            "claude",
            "--yes",
            "--overwrite",
            PUBLISHED_SKILL,
        ],
        dir.path(),
    );

    assert!(
        !run.stderr.contains("matched no projected file"),
        "{}",
        run.stderr
    );
    assert_eq!(run.code, 0, "{}", run.stderr);
}

#[test]
fn an_absolute_spelling_is_told_that_it_is_absolute() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();
    let absolute = dest.join(PUBLISHED_SKILL).display().to_string();

    let run = publish_real(&vault, &dest, &["--overwrite", &absolute], dir.path());

    assert!(
        run.stderr.contains("matched no projected file"),
        "{}",
        run.stderr
    );
    assert!(run.stderr.contains("absolute"), "{}", run.stderr);
}

#[test]
fn overwrite_dry_run_reports_it_the_same_way_so_the_plan_is_still_the_plan() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();

    let run = publish_dry(
        &vault,
        &dest,
        &["--overwrite", ".claude/skills/typo/SKILL.md"],
        dir.path(),
    );

    assert!(
        run.stderr.contains("matched no projected file"),
        "{}",
        run.stderr
    );
    assert_eq!(run.code, 0, "{}", run.stderr);
}

#[test]
fn overwrite_quiet_still_reports_it() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();

    // `--quiet` drops the progress lines and the tally. An acknowledgement
    // the core never consulted is neither.
    let run = publish_real(
        &vault,
        &dest,
        &["--quiet", "--overwrite", ".claude/skills/typo/SKILL.md"],
        dir.path(),
    );

    assert!(
        run.stderr.contains("matched no projected file"),
        "{}",
        run.stderr
    );
    assert!(!run.stderr.contains("1 written"), "{}", run.stderr);
}

#[test]
fn overwrite_json_is_unchanged_by_the_warning() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();

    let run = publish_real(
        &vault,
        &dest,
        &["--json", "--overwrite", ".claude/skills/typo/SKILL.md"],
        dir.path(),
    );

    let parsed: serde_json::Value = serde_json::from_str(&run.stdout).unwrap();
    assert_eq!(sorted_keys(&parsed), vec!["files".to_string()]);
}

#[test]
fn an_acknowledged_conflict_is_overwritten_and_the_run_exits_0() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();
    conflict(&vault, &dest, dir.path());

    let run = publish_real(&vault, &dest, &["--overwrite", PUBLISHED_SKILL], dir.path());

    assert_eq!(run.code, 0, "{}", run.stderr);
    assert!(
        run.stdout.contains(&format!("{PUBLISHED_SKILL}  written")),
        "{}",
        run.stdout
    );
    let content = fs::read_to_string(published_skill_path(&dest)).unwrap();
    assert!(!content.contains("edited here"), "{content}");
}

#[test]
fn a_run_that_also_refused_a_file_exits_1_warning_and_all() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();
    conflict(&vault, &dest, dir.path());

    let run = publish_real(
        &vault,
        &dest,
        &["--overwrite", ".claude/skills/typo/SKILL.md"],
        dir.path(),
    );

    assert_eq!(run.code, 1, "{}", run.stderr);
    assert!(
        run.stdout.contains(&format!("{PUBLISHED_SKILL}  refused")),
        "{}",
        run.stdout
    );
    assert!(
        run.stderr.contains("matched no projected file"),
        "{}",
        run.stderr
    );
    // The refusal held: the edit at the destination is still there.
    let content = fs::read_to_string(published_skill_path(&dest)).unwrap();
    assert!(content.contains("edited here"), "{content}");
}

#[test]
fn a_run_that_projected_nothing_blames_the_flag_for_nothing() {
    let (dir, vault) = fixture();
    let dest = dest_of(dir.path());
    fs::create_dir_all(&dest).unwrap();
    // Every pair throws before a file list exists, so the run knows no
    // projected paths at all. Reporting every acknowledgement as unmatched
    // there would blame the flag for the failure above it. A plugin note
    // with no member this destination admits reaches the loop with a known
    // target and throws `empty-plugin` there, which is the shape this test
    // needs.
    fs::write(
        vault.join("skills").join("code-review").join("code-review.md"),
        "---\nname: code-review\ndescription: the review pack\nap-kind: plugin\n---\nReview the diff.\n",
    )
    .unwrap();

    let run = publish_real(
        &vault,
        &dest,
        &["--overwrite", ".claude/skills/typo/SKILL.md"],
        dir.path(),
    );

    // The pair threw: one refused line for the skill itself, exit 1.
    assert_eq!(run.code, 1, "{}", run.stderr);
    assert!(run.stdout.contains("refused"), "{}", run.stdout);
    assert!(
        !run.stderr.contains("matched no projected file"),
        "{}",
        run.stderr
    );
}

// --- a note with a `name` and no `description` ----------------------------------

/// A vault holding one name-only skill, and a project file naming it — with
/// `require_descriptions` when `strict`.
fn name_only_project(strict: bool) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let skill = dir.path().join("vault").join("skills").join("quiet");
    fs::create_dir_all(&skill).unwrap();
    fs::write(skill.join("quiet.md"), "---\nname: quiet\n---\nBody.\n").unwrap();
    let strict = if strict {
        "  require_descriptions: true\n"
    } else {
        ""
    };
    fs::write(
        dir.path().join("agent-pants.yaml"),
        format!(
            "vault: vault\nmarketplace:\n  name: demo\n  default_plugin: tools\n  out: out\n{strict}"
        ),
    )
    .unwrap();
    dir
}

const QUIET_WARNING: &str = "skills/quiet/quiet.md  warning · missing-description: `quiet` has a `name` and no `description`; published with \"No description provided.\"";

#[test]
fn a_missing_description_warns_on_stderr_even_under_quiet() {
    let dir = name_only_project(false);
    let build = run(&["build", "--yes", "--quiet"], dir.path());
    assert_eq!(build.code, 0, "{}", build.stderr);
    assert!(build.stderr.contains(QUIET_WARNING), "{}", build.stderr);
    assert!(!build.stdout.contains("warning"), "{}", build.stdout);

    let list = run(&["list", "--quiet"], dir.path());
    assert_eq!(list.code, 0, "{}", list.stderr);
    assert!(list.stderr.contains(QUIET_WARNING), "{}", list.stderr);
}

#[test]
fn require_descriptions_in_the_project_file_refuses_the_build() {
    let dir = name_only_project(true);
    let build = run(&["build", "--yes"], dir.path());
    assert_eq!(build.code, 2, "{}", build.stderr);
    assert!(
        build.stderr.contains("missing-description")
            && build.stderr.contains("skills/quiet/quiet.md"),
        "{}",
        build.stderr
    );
    assert!(!dir.path().join("out").exists());
}
