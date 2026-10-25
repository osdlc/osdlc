//! `harness install|update|uninstall <harness>` driven through [`run_with`] over a temp
//! project, with a scripted fake in place of the harness CLIs.

mod common;

use std::cell::RefCell;
use std::fs;
use std::path::Path;

use common::with_machine_env;
use tradecraft::cli::run_with;
use tradecraft::commands::harness::cli_runner::{RunResult, Runner};
use tradecraft::ctx::CommandContext;
use tradecraft::exit::{EXIT_BLOCKED, EXIT_USAGE};

/// Answers each list command with canned stdout and every other command
/// with success, recording each argv it is given. A command containing
/// `fail_on` exits 1 with `boom` on stderr.
#[derive(Default)]
struct FakeRunner {
    markets: String,
    plugins: String,
    fail_on: Option<&'static str>,
    calls: RefCell<Vec<String>>,
}

impl FakeRunner {
    fn new(markets: &str, plugins: &str) -> Self {
        Self {
            markets: markets.to_string(),
            plugins: plugins.to_string(),
            ..Self::default()
        }
    }

    fn failing_on(mut self, part: &'static str) -> Self {
        self.fail_on = Some(part);
        self
    }

    fn calls(&self) -> Vec<String> {
        self.calls.borrow().clone()
    }
}

impl Runner for FakeRunner {
    fn run(&self, argv: &[String], _cwd: &Path) -> RunResult {
        let line = argv.join(" ");
        self.calls.borrow_mut().push(line.clone());
        if self.fail_on.is_some_and(|part| line.contains(part)) {
            return RunResult {
                code: Some(1),
                stdout: String::new(),
                stderr: "boom".to_string(),
            };
        }
        let stdout = if line.contains("marketplace list") {
            self.markets.clone()
        } else if line.ends_with("plugin list --json") {
            self.plugins.clone()
        } else {
            String::new()
        };
        RunResult {
            code: Some(0),
            stdout,
            stderr: String::new(),
        }
    }
}

const CLAUDE_MARKETS: &str = "claude plugin marketplace list --json";
const CLAUDE_PLUGINS: &str = "claude plugin list --json";

/// A project whose built marketplace at `published/acme` carries a manifest
/// for each harness root, all naming it `acme`. Returns that root.
fn write_project(dir: &Path) -> String {
    fs::create_dir_all(dir.join("vault")).unwrap();
    fs::write(
        dir.join("agent-pants.yaml"),
        "vault: vault\n\
         marketplace:\n  \
         out: published/acme\n  \
         default_plugin: tools\n",
    )
    .unwrap();
    let root = dir.join("published/acme");
    for manifest in [
        ".claude-plugin/marketplace.json",
        ".agents/plugins/marketplace.json",
        ".cursor-plugin/marketplace.json",
    ] {
        let path = root.join(manifest);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, r#"{"name": "acme", "plugins": []}"#).unwrap();
    }
    root.display().to_string()
}

struct Run {
    code: i32,
    stdout: String,
    stderr: String,
}

fn run(argv: &[&str], cwd: &Path, runner: &dyn Runner) -> Run {
    let owned: Vec<String> = argv.iter().map(|s| (*s).to_string()).collect();
    let mut out: Vec<u8> = Vec::new();
    let mut err: Vec<u8> = Vec::new();
    let code = with_machine_env(Some(&cwd.join("no-machine-config.yaml")), || {
        let mut ctx = CommandContext::new(cwd, &mut out, &mut err).with_runner(runner);
        run_with(&owned, &mut ctx)
    });
    Run {
        code,
        stdout: String::from_utf8(out).unwrap(),
        stderr: String::from_utf8(err).unwrap(),
    }
}

fn claude_market(path: &str) -> String {
    format!(r#"[{{"name": "acme", "source": "directory", "path": "{path}"}}]"#)
}

fn claude_plugin(scope: &str) -> String {
    format!(r#"[{{"id": "tools@acme", "scope": "{scope}", "enabled": true}}]"#)
}

#[test]
fn ac1_a_missing_marketplace_is_added_then_its_plugin_installed() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let fake = FakeRunner::new("[]", "[]");

    let result = run(
        &[
            "harness", "install", "claude", "--scope", "user", "--plugin", "tools", "--yes",
            "--json",
        ],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        fake.calls(),
        vec![
            CLAUDE_MARKETS.to_string(),
            CLAUDE_PLUGINS.to_string(),
            format!("claude plugin marketplace add {root} --scope user"),
            "claude plugin install tools@acme --scope user".to_string(),
        ]
    );
    let doc: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    assert_eq!(doc["outcome"], "added");
}

#[test]
fn ac2_a_matching_install_runs_only_the_list_commands_and_reports_exists() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let fake = FakeRunner::new(&claude_market(&root), &claude_plugin("user"));

    let result = run(
        &["harness", "install", "claude", "--plugin", "tools", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(fake.calls(), vec![CLAUDE_MARKETS, CLAUDE_PLUGINS]);
    assert_eq!(result.stdout, "claude  unchanged · exists\n");
    assert!(
        result.stderr.contains("nothing to change"),
        "{}",
        result.stderr
    );
}

#[test]
fn ac3_a_marketplace_from_another_path_is_removed_and_added_again() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let fake = FakeRunner::new(&claude_market("/somewhere/else"), &claude_plugin("user"));

    let result = run(
        &["harness", "install", "claude", "--yes", "--json"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        &fake.calls()[2..],
        [
            "claude plugin marketplace remove acme --scope user".to_string(),
            format!("claude plugin marketplace add {root} --scope user"),
            "claude plugin install tools@acme --scope user".to_string(),
        ]
    );
    let doc: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    assert_eq!(doc["outcome"], "updated");
}

#[test]
fn a_plugin_installed_at_another_scope_is_installed_at_the_wanted_one() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let fake = FakeRunner::new(&claude_market(&root), &claude_plugin("user"));
    let declared = format!(
        r#"{{"extraKnownMarketplaces": {{"acme": {{"source": {{"source": "directory", "path": "{root}"}}}}}}}}"#
    );
    fs::create_dir_all(dir.path().join(".claude")).unwrap();
    fs::write(dir.path().join(".claude/settings.json"), declared).unwrap();

    let result = run(
        &[
            "harness", "install", "claude", "--scope", "project", "--yes",
        ],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        fake.calls(),
        [
            CLAUDE_PLUGINS,
            "claude plugin install tools@acme --scope project"
        ]
    );
}

/// `marketplace list` merges every scope, so a user-scope registration does
/// not stand in for the project's own declaration.
#[test]
fn a_project_scope_install_declares_the_marketplace_in_the_project() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let fake = FakeRunner::new(&claude_market(&root), "[]");

    let result = run(
        &[
            "harness", "install", "claude", "--scope", "project", "--yes",
        ],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        fake.calls()[1..],
        [
            format!("claude plugin marketplace add {root} --scope project"),
            "claude plugin install tools@acme --scope project".to_string(),
        ]
    );
}

#[test]
fn a_marketplace_listed_under_another_name_names_the_plugin_ids() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let markets = format!(r#"[{{"name": "old", "source": "directory", "path": "{root}"}}]"#);
    let fake = FakeRunner::new(&markets, "[]");

    let result = run(
        &["harness", "install", "claude", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        &fake.calls()[2..],
        ["claude plugin install tools@old --scope user"]
    );
}

#[test]
fn a_failing_mutating_command_blocks_and_names_what_already_ran() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let fake = FakeRunner::new("[]", "[]").failing_on("plugin install");

    let result = run(
        &["harness", "install", "claude", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, EXIT_BLOCKED);
    assert!(result.stderr.contains("boom"), "{}", result.stderr);
    assert!(
        result.stderr.contains(&format!(
            "already ran: claude plugin marketplace add {root} --scope user"
        )),
        "{}",
        result.stderr
    );
}

#[test]
fn without_yes_off_a_tty_a_change_is_a_usage_error_and_runs_nothing() {
    let dir = tempfile::tempdir().unwrap();
    write_project(dir.path());
    let fake = FakeRunner::new("[]", "[]");

    let result = run(&["harness", "install", "claude"], dir.path(), &fake);
    assert_eq!(result.code, EXIT_USAGE);
    assert!(result.stderr.contains("--yes"), "{}", result.stderr);
    assert_eq!(fake.calls(), vec![CLAUDE_MARKETS, CLAUDE_PLUGINS]);
}

#[test]
fn git_ref_is_passed_on_by_codex_and_cursor_and_refused_by_claude() {
    let dir = tempfile::tempdir().unwrap();
    write_project(dir.path());
    let url = "https://example.com/acme.git";
    let argv = |harness: &'static str| {
        [
            "harness",
            "install",
            harness,
            "--git-url",
            url,
            "--git-ref",
            "v1",
            "--yes",
        ]
    };

    let codex = FakeRunner::new(r#"{"marketplaces": []}"#, r#"{"installed": []}"#);
    assert_eq!(run(&argv("codex"), dir.path(), &codex).code, 0);
    assert_eq!(
        codex.calls()[2],
        format!("codex plugin marketplace add {url} --ref v1")
    );

    let cursor = FakeRunner::new("[]", "");
    assert_eq!(run(&argv("cursor"), dir.path(), &cursor).code, 0);
    assert_eq!(
        cursor.calls()[1],
        format!("cursor-agent plugin marketplace add {url} --git-ref v1")
    );

    let claude = FakeRunner::default();
    let result = run(&argv("claude"), dir.path(), &claude);
    assert_eq!(result.code, EXIT_USAGE);
    assert!(result.stderr.contains("--git-ref"), "{}", result.stderr);
    assert!(claude.calls().is_empty());
}

#[test]
fn cursor_replaces_a_marketplace_registered_from_another_url() {
    let dir = tempfile::tempdir().unwrap();
    write_project(dir.path());
    let url = "https://example.com/acme.git";
    let fake = FakeRunner::new(
        r#"[{"name": "acme", "gitUrl": "https://old.example/acme.git"}]"#,
        "",
    );

    let result = run(
        &["harness", "install", "cursor", "--git-url", url, "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        fake.calls()[1..],
        [
            "cursor-agent plugin marketplace remove acme".to_string(),
            format!("cursor-agent plugin marketplace add {url}"),
        ]
    );
}

#[test]
fn ac4_codex_rejects_a_scope_other_than_user_and_runs_nothing() {
    let dir = tempfile::tempdir().unwrap();
    write_project(dir.path());
    let fake = FakeRunner::default();

    let result = run(
        &["harness", "install", "codex", "--scope", "project", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, EXIT_USAGE);
    assert!(
        result.stderr.contains("--scope user only"),
        "{}",
        result.stderr
    );
    assert!(fake.calls().is_empty(), "{:?}", fake.calls());
}

#[test]
fn codex_adds_its_marketplace_and_plugin() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let fake = FakeRunner::new(r#"{"marketplaces": []}"#, r#"{"installed": []}"#);

    let result = run(&["harness", "install", "codex", "--yes"], dir.path(), &fake);
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        &fake.calls()[2..],
        [
            format!("codex plugin marketplace add {root}"),
            "codex plugin add tools@acme".to_string(),
        ]
    );
}

#[test]
fn ac5_cursor_without_a_git_url_is_a_usage_error_naming_the_flag() {
    let dir = tempfile::tempdir().unwrap();
    write_project(dir.path());
    let fake = FakeRunner::default();

    let result = run(
        &["harness", "install", "cursor", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, EXIT_USAGE);
    assert!(result.stderr.contains("--git-url"), "{}", result.stderr);
    assert!(fake.calls().is_empty());
}

#[test]
fn ac5_cursor_adds_its_git_url_only_when_it_is_not_listed() {
    let dir = tempfile::tempdir().unwrap();
    write_project(dir.path());
    let url = "https://example.com/acme.git";
    let argv = ["harness", "install", "cursor", "--git-url", url, "--yes"];

    let missing = FakeRunner::new("[]", "");
    let result = run(&argv, dir.path(), &missing);
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        missing.calls(),
        [
            "cursor-agent plugin marketplace list --format json".to_string(),
            format!("cursor-agent plugin marketplace add {url}"),
        ]
    );
    assert!(
        result.stdout.contains("enable in Cursor · tools"),
        "{}",
        result.stdout
    );

    let listed = FakeRunner::new(&format!(r#"[{{"name": "acme", "gitUrl": "{url}"}}]"#), "");
    let result = run(&argv, dir.path(), &listed);
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(listed.calls().len(), 1, "{:?}", listed.calls());
}

#[test]
fn ac6_dry_run_prints_the_plan_and_runs_only_the_list_commands() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let fake = FakeRunner::new("[]", "[]");

    let result = run(
        &["harness", "install", "claude", "--dry-run"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(fake.calls(), vec![CLAUDE_MARKETS, CLAUDE_PLUGINS]);
    assert!(
        result.stdout.contains(&format!(
            "claude  would run · claude plugin marketplace add {root} --scope user"
        )),
        "{}",
        result.stdout
    );
    assert!(result.stderr.contains("(dry run)"), "{}", result.stderr);
}

#[test]
fn a_failing_list_command_blocks_with_its_stderr() {
    let dir = tempfile::tempdir().unwrap();
    write_project(dir.path());
    let fake = FakeRunner::default().failing_on("marketplace list");

    let result = run(
        &["harness", "install", "claude", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, EXIT_BLOCKED);
    assert!(result.stderr.contains("boom"), "{}", result.stderr);
    assert_eq!(fake.calls(), vec![CLAUDE_MARKETS]);
}

/// No manifest at the target root: `marketplace.name` names the
/// marketplace, so it is what the plugin id carries.
#[test]
fn a_configured_marketplace_name_is_the_fallback_for_an_unbuilt_root() {
    let dir = tempfile::tempdir().unwrap();
    fs::create_dir_all(dir.path().join("vault")).unwrap();
    fs::write(
        dir.path().join("agent-pants.yaml"),
        "vault: vault\n\
         marketplace:\n  \
         out: published/acme\n  \
         name: configured\n  \
         default_plugin: tools\n",
    )
    .unwrap();
    let fake = FakeRunner::new("[]", "[]");

    let result = run(
        &["harness", "install", "claude", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        fake.calls().last().unwrap(),
        "claude plugin install tools@configured --scope user"
    );
}

/// A manifest that is not valid JSON blocks instead of falling back to
/// configuration, and nothing runs.
#[test]
fn a_malformed_manifest_blocks_before_any_command() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    fs::write(
        Path::new(&root).join(".claude-plugin/marketplace.json"),
        "{not json",
    )
    .unwrap();
    let fake = FakeRunner::default();

    let result = run(
        &["harness", "install", "claude", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, EXIT_BLOCKED, "{}", result.stdout);
    assert!(
        result.stderr.contains("marketplace.json"),
        "{}",
        result.stderr
    );
    assert!(fake.calls().is_empty());
}

/// Point every harness root's `marketplace.json` at a `tools` plugin. Claude
/// and Cursor carry `version` on the entry; Codex's entry has none, so its
/// pack's own plugin manifest carries it.
fn publish_tools(root: &str, version: &str) {
    let root = Path::new(root);
    let entry =
        format!(r#"{{"name": "tools", "source": "./packs/tools", "version": "{version}"}}"#);
    for manifest in [
        ".claude-plugin/marketplace.json",
        ".cursor-plugin/marketplace.json",
    ] {
        fs::write(
            root.join(manifest),
            format!(r#"{{"name": "acme", "plugins": [{entry}]}}"#),
        )
        .unwrap();
    }
    fs::write(
        root.join(".agents/plugins/marketplace.json"),
        r#"{"name": "acme", "plugins": [{"name": "tools", "source": {"source": "local", "path": "./.agents/packs/tools"}}]}"#,
    )
    .unwrap();
    let pack = root.join(".agents/packs/tools/.codex-plugin");
    fs::create_dir_all(&pack).unwrap();
    fs::write(
        pack.join("plugin.json"),
        format!(r#"{{"name": "tools", "version": "{version}"}}"#),
    )
    .unwrap();
}

fn claude_plugin_at(version: &str) -> String {
    format!(r#"[{{"id": "tools@acme", "scope": "user", "version": "{version}"}}]"#)
}

#[test]
fn update_ac1_an_outdated_claude_plugin_is_updated() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    publish_tools(&root, "0.2.0");
    let fake = FakeRunner::new(&claude_market(&root), &claude_plugin_at("0.1.0"));

    let result = run(
        &[
            "harness", "update", "claude", "--plugin", "tools", "--yes", "--json",
        ],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        fake.calls(),
        [
            CLAUDE_MARKETS,
            CLAUDE_PLUGINS,
            "claude plugin update tools@acme --scope user"
        ]
    );
    let doc: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    assert_eq!(doc["outcome"], "updated");
}

#[test]
fn update_ac2_a_current_plugin_runs_only_the_list_commands() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    publish_tools(&root, "0.2.0");
    let fake = FakeRunner::new(&claude_market(&root), &claude_plugin_at("0.2.0"));

    let result = run(
        &["harness", "update", "claude", "--plugin", "tools", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(fake.calls(), [CLAUDE_MARKETS, CLAUDE_PLUGINS]);
    assert_eq!(result.stdout, "claude  unchanged · exists\n");
}

#[test]
fn update_installs_a_missing_plugin_instead_of_updating_it() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    publish_tools(&root, "0.2.0");
    let fake = FakeRunner::new(&claude_market(&root), "[]");

    let result = run(
        &["harness", "update", "claude", "--yes", "--json"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        &fake.calls()[2..],
        ["claude plugin install tools@acme --scope user"]
    );
    let doc: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    assert_eq!(doc["outcome"], "added");
}

#[test]
fn update_ac3_codex_removes_and_adds_an_outdated_plugin() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    publish_tools(&root, "0.2.0");
    let markets = format!(
        r#"{{"marketplaces": [{{"name": "acme", "marketplaceSource": {{"source": "{root}"}}}}]}}"#
    );
    let fake = FakeRunner::new(
        &markets,
        r#"{"installed": [{"pluginId": "tools@acme", "version": "0.1.0"}]}"#,
    );

    let result = run(&["harness", "update", "codex", "--yes"], dir.path(), &fake);
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        &fake.calls()[2..],
        [
            "codex plugin remove tools@acme",
            "codex plugin add tools@acme"
        ]
    );
}

#[test]
fn update_refreshes_a_registered_cursor_marketplace_and_only_adds_a_missing_one() {
    let dir = tempfile::tempdir().unwrap();
    write_project(dir.path());
    let url = "https://example.com/acme.git";
    let argv = ["harness", "update", "cursor", "--git-url", url, "--yes"];

    let listed = FakeRunner::new(&format!(r#"[{{"name": "acme", "gitUrl": "{url}"}}]"#), "");
    assert_eq!(run(&argv, dir.path(), &listed).code, 0);
    assert_eq!(
        &listed.calls()[1..],
        ["cursor-agent plugin marketplace update acme"]
    );

    let missing = FakeRunner::new("[]", "");
    assert_eq!(run(&argv, dir.path(), &missing).code, 0);
    assert_eq!(
        missing.calls()[1..],
        [format!("cursor-agent plugin marketplace add {url}")]
    );
}

#[test]
fn update_ac6_codex_rejects_a_scope_other_than_user() {
    let dir = tempfile::tempdir().unwrap();
    write_project(dir.path());
    let fake = FakeRunner::default();

    let result = run(
        &["harness", "update", "codex", "--scope", "project", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, EXIT_USAGE);
    assert!(
        result.stderr.contains("--scope user only"),
        "{}",
        result.stderr
    );
    assert!(fake.calls().is_empty());
}

#[test]
fn update_dry_run_plans_the_update_and_runs_only_the_list_commands() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    publish_tools(&root, "0.2.0");
    let fake = FakeRunner::new(&claude_market(&root), &claude_plugin_at("0.1.0"));

    let result = run(
        &["harness", "update", "claude", "--dry-run"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(fake.calls(), [CLAUDE_MARKETS, CLAUDE_PLUGINS]);
    assert!(
        result
            .stdout
            .contains("claude  would run · claude plugin update tools@acme --scope user"),
        "{}",
        result.stdout
    );
}

#[test]
fn uninstall_ac4_removes_an_installed_plugin_and_a_rerun_changes_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let argv = [
        "harness",
        "uninstall",
        "claude",
        "--plugin",
        "tools",
        "--yes",
        "--json",
    ];

    let installed = FakeRunner::new(&claude_market(&root), &claude_plugin("user"));
    let result = run(&argv, dir.path(), &installed);
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        installed.calls(),
        [
            CLAUDE_MARKETS,
            CLAUDE_PLUGINS,
            "claude plugin uninstall tools@acme --scope user"
        ]
    );
    let doc: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    assert_eq!(doc["outcome"], "removed");

    let absent = FakeRunner::new(&claude_market(&root), "[]");
    let result = run(&argv, dir.path(), &absent);
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(absent.calls(), [CLAUDE_MARKETS, CLAUDE_PLUGINS]);
    let doc: serde_json::Value = serde_json::from_str(&result.stdout).unwrap();
    assert_eq!(doc["outcome"], "exists");
}

#[test]
fn uninstall_ac5_removes_the_marketplace_only_with_the_flag() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());

    let with_flag = FakeRunner::new(&claude_market(&root), &claude_plugin("user"));
    let result = run(
        &["harness", "uninstall", "claude", "--marketplace", "--yes"],
        dir.path(),
        &with_flag,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        &with_flag.calls()[2..],
        [
            "claude plugin uninstall tools@acme --scope user",
            "claude plugin marketplace remove acme --scope user",
        ]
    );

    let without = FakeRunner::new(&claude_market(&root), &claude_plugin("user"));
    let result = run(
        &["harness", "uninstall", "claude", "--yes"],
        dir.path(),
        &without,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        &without.calls()[2..],
        ["claude plugin uninstall tools@acme --scope user"]
    );
}

#[test]
fn uninstall_cursor_needs_no_git_url_and_matches_the_marketplace_by_name() {
    let dir = tempfile::tempdir().unwrap();
    write_project(dir.path());
    let fake = FakeRunner::new(
        r#"[{"name": "acme", "gitUrl": "https://example.com/acme.git"}]"#,
        "",
    );

    let result = run(
        &["harness", "uninstall", "cursor", "--marketplace", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        &fake.calls()[1..],
        ["cursor-agent plugin marketplace remove acme"]
    );
    assert!(!result.stdout.contains("enable in"), "{}", result.stdout);
}

#[test]
fn update_from_git_refreshes_the_marketplace_before_updating_a_plugin() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    publish_tools(&root, "0.2.0");
    let url = "https://example.com/acme.git";
    let markets = format!(r#"[{{"name": "acme", "source": "git", "url": "{url}"}}]"#);
    let fake = FakeRunner::new(&markets, &claude_plugin_at("0.1.0"));

    let result = run(
        &["harness", "update", "claude", "--git-url", url, "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        &fake.calls()[2..],
        [
            "claude plugin marketplace update acme",
            "claude plugin update tools@acme --scope user",
        ]
    );
}

#[test]
fn update_skips_a_plugin_whose_listing_has_no_version() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    publish_tools(&root, "0.2.0");
    let fake = FakeRunner::new(&claude_market(&root), &claude_plugin("user"));

    let result = run(&["harness", "update", "claude", "--yes"], dir.path(), &fake);
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(fake.calls(), [CLAUDE_MARKETS, CLAUDE_PLUGINS]);
}

#[test]
fn uninstall_codex_removes_its_plugin() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let markets = format!(
        r#"{{"marketplaces": [{{"name": "acme", "marketplaceSource": {{"source": "{root}"}}}}]}}"#
    );
    let fake = FakeRunner::new(
        &markets,
        r#"{"installed": [{"pluginId": "tools@acme", "version": "0.1.0"}]}"#,
    );

    let result = run(
        &["harness", "uninstall", "codex", "--yes"],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(&fake.calls()[2..], ["codex plugin remove tools@acme"]);
}

#[test]
fn uninstall_at_project_scope_removes_the_project_declaration() {
    let dir = tempfile::tempdir().unwrap();
    let root = write_project(dir.path());
    let declared = format!(
        r#"{{"extraKnownMarketplaces": {{"acme": {{"source": {{"source": "directory", "path": "{root}"}}}}}}}}"#
    );
    fs::create_dir_all(dir.path().join(".claude")).unwrap();
    fs::write(dir.path().join(".claude/settings.json"), declared).unwrap();
    let fake = FakeRunner::new("[]", &claude_plugin("project"));

    let result = run(
        &[
            "harness",
            "uninstall",
            "claude",
            "--scope",
            "project",
            "--marketplace",
            "--yes",
        ],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, 0, "{}", result.stderr);
    assert_eq!(
        fake.calls(),
        [
            CLAUDE_PLUGINS,
            "claude plugin uninstall tools@acme --scope project",
            "claude plugin marketplace remove acme --scope project",
        ]
    );
}

#[test]
fn uninstall_refuses_a_git_ref() {
    let dir = tempfile::tempdir().unwrap();
    write_project(dir.path());
    let fake = FakeRunner::default();

    let result = run(
        &[
            "harness",
            "uninstall",
            "codex",
            "--git-url",
            "https://example.com/acme.git",
            "--git-ref",
            "v1",
            "--yes",
        ],
        dir.path(),
        &fake,
    );
    assert_eq!(result.code, EXIT_USAGE);
    assert!(result.stderr.contains("--git-ref"), "{}", result.stderr);
    assert!(fake.calls().is_empty());
}
