//! The CLI's `build` verb and a request built the way another host builds
//! it must render byte-identical trees for the same vault.
//!
//! Both sides reach the same `tradecraft_core::export_skills`. The host side
//! is not reachable from here, so this calls that function directly with a
//! request shaped the way a host that embeds the core shapes it: name,
//! display_name, owner and author absent, `plugins` empty, `default_plugin`
//! `"core"`. What it proves: the CLI's own flag-to-request resolution in
//! `commands/marketplace.rs` and a host's request-building do not disagree
//! about what an equivalent build means.
//!
//! The vault is `freeform-vault`, the shared parity fixture: two
//! marketplaces, so `--marketplace acme` is required on both sides or the
//! render refuses `ambiguous-marketplace`.

mod common;

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use common::with_machine_env;
use skillwright::cli::run_with;
use skillwright::ctx::CommandContext;
use tradecraft_core::{
    DEFAULT_SHIM_TARGET, ExportMode, ExportRequest, MarketplaceConfig, Namespace, NativeVfs,
    export_skills,
};

fn fixture_vault() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/freeform-vault")
        .canonicalize()
        .unwrap()
}

/// Every file under `root`, as a path relative to it, sorted.
fn walk(root: &Path) -> Vec<PathBuf> {
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

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(path).unwrap().permissions().mode() & 0o111 != 0
}

/// Windows has no executable bit, so both trees read as not executable.
#[cfg(not(unix))]
fn is_executable(_path: &Path) -> bool {
    false
}

#[test]
fn the_cli_and_a_host_request_render_identical_trees() {
    let vault = fixture_vault();
    let dir = tempfile::tempdir().unwrap();
    let cli_out = dir.path().join("cli");
    let host_out = dir.path().join("host");

    let argv: Vec<String> = [
        "build",
        "--vault",
        &vault.display().to_string(),
        "--out",
        &cli_out.display().to_string(),
        "--marketplace",
        "acme",
        // Matched to the host's default rather than left to each
        // side's, so a future change to either shows up as a real difference
        // instead of being masked by both drifting together.
        "--default-plugin",
        "core",
        "--yes",
    ]
    .iter()
    .map(|s| (*s).to_string())
    .collect();

    let mut out: Vec<u8> = Vec::new();
    let mut err: Vec<u8> = Vec::new();
    // The machine file is relocated for the CLI half alone — the direct call
    // below reads no configuration, so a developer's real one would feed only
    // one side of the comparison.
    let code = with_machine_env(Some(&dir.path().join("no-machine-config.yaml")), || {
        let mut ctx = CommandContext::new(dir.path(), &mut out, &mut err);
        run_with(&argv, &mut ctx)
    });
    assert_eq!(code, 0, "{}", String::from_utf8_lossy(&err));
    assert!(cli_out.is_dir());

    export_skills(
        &NativeVfs,
        &ExportRequest {
            vault_root: vault.clone(),
            skills_root: None,
            marketplace: Some("acme".to_string()),
            out_root: host_out.clone(),
            mode: ExportMode::Build,
            config: MarketplaceConfig {
                name: None,
                display_name: None,
                owner: None,
                description: None,
                author: None,
                license: None,
                default_plugin: "core".to_string(),
                plugins: BTreeMap::new(),
                require_descriptions: false,
                shim_target: DEFAULT_SHIM_TARGET.to_owned(),
            },
            harnesses: BTreeSet::new(),
            assets: Vec::new(),
            hooks: Vec::new(),
        },
        &Namespace::default(),
    )
    .unwrap();
    assert!(host_out.is_dir());

    // The tree shape first: a path only one side produced is the whole
    // difference, and deserves its own failure rather than being buried in a
    // per-file loop that never reaches it.
    let cli_files = walk(&cli_out);
    assert_eq!(cli_files, walk(&host_out));

    for rel in &cli_files {
        let a = cli_out.join(rel);
        let b = host_out.join(rel);
        assert_eq!(fs::read(&a).unwrap(), fs::read(&b).unwrap(), "{rel:?}");
        // The fixture's `bundled/scripts/run.sh` exists to prove the execute
        // bit travels through a build — a render that matched every byte but
        // dropped it would not be the identical tree this test requires.
        assert_eq!(is_executable(&a), is_executable(&b), "{rel:?}");
    }
}

#[test]
fn a_vault_holding_two_marketplaces_refuses_a_build_that_names_neither() {
    let vault = fixture_vault();
    let dir = tempfile::tempdir().unwrap();
    let argv: Vec<String> = [
        "build",
        "--vault",
        &vault.display().to_string(),
        "--out",
        &dir.path().join("out").display().to_string(),
        "--default-plugin",
        "core",
        "--yes",
    ]
    .iter()
    .map(|s| (*s).to_string())
    .collect();

    let mut out: Vec<u8> = Vec::new();
    let mut err: Vec<u8> = Vec::new();
    let code = with_machine_env(Some(&dir.path().join("no-machine-config.yaml")), || {
        let mut ctx = CommandContext::new(dir.path(), &mut out, &mut err);
        run_with(&argv, &mut ctx)
    });
    // A run-level blocker: nothing was staged, so there is no report to
    // print — and the core's own token leads the reason.
    assert_eq!(code, 2);
    let message = String::from_utf8(err).unwrap();
    assert!(message.starts_with("build failed: "), "{message}");
    assert!(message.contains("marketplace"), "{message}");
}
