//! A canonical hooks file, built into every pack: the per-harness hooks files
//! and the gap report against fixtures under `tests/fixtures/hooks-file/`.
//!
//! `TRADECRAFT_BLESS=1 cargo test -p tradecraft-core --test hooks_file`
//! rewrites the expected files from the current output.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use tradecraft_core::{
    DEFAULT_SHIM_TARGET, ExportMode, ExportRequest, HookFileSpec, MarketplaceConfig, MemVfs,
    Namespace, Vfs, export_skills,
};

const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/hooks-file");

const PACKS: [(&str, &str); 4] = [
    ("claude", "/market/.claude-plugin/packs/core"),
    ("codex", "/market/.agents/packs/core"),
    ("cursor", "/market/.cursor-plugin/packs/core"),
    ("pi", "/market/.pi/packs/core"),
];

fn write(vfs: &dyn Vfs, path: &str, content: &str) {
    let path = Path::new(path);
    vfs.create_dir_all(path.parent().unwrap()).unwrap();
    vfs.write_file(path, content.as_bytes()).unwrap();
}

fn text_at(vfs: &dyn Vfs, path: &str) -> String {
    String::from_utf8(vfs.read_file(Path::new(path)).unwrap()).unwrap()
}

fn vault(hooks: &str) -> MemVfs {
    let vfs = MemVfs::new();
    write(
        &vfs,
        "/vault/plugins/core/skills/review.md",
        "---\nname: review\ndescription: Use review.\nsw-plugin: core\n---\n\n# review\n",
    );
    write(&vfs, "/project/plugin/hooks.json", hooks);
    vfs
}

fn request(mode: ExportMode) -> ExportRequest {
    ExportRequest {
        vault_root: PathBuf::from("/vault"),
        skills_root: None,
        marketplace: None,
        out_root: PathBuf::from("/market"),
        harnesses: BTreeSet::new(),
        mode,
        config: MarketplaceConfig {
            name: Some("demo".to_owned()),
            display_name: None,
            owner: None,
            description: None,
            author: None,
            license: None,
            default_plugin: "core".to_owned(),
            plugins: BTreeMap::new(),
            require_descriptions: false,
            shim_target: DEFAULT_SHIM_TARGET.to_owned(),
        },
        assets: Vec::new(),
        hooks: vec![HookFileSpec {
            source: PathBuf::from("/project/plugin/hooks.json"),
            from: "plugin/hooks.json".to_owned(),
            plugin: None,
        }],
    }
}

fn canonical() -> String {
    std::fs::read_to_string(format!("{FIXTURES}/hooks.json")).unwrap()
}

fn built() -> MemVfs {
    let vfs = vault(&canonical());
    export_skills(&vfs, &request(ExportMode::Build), &Namespace::default()).unwrap();
    vfs
}

/// The rendered text against `expected/<name>`, or a rewrite of it when
/// blessing.
fn assert_fixture(name: &str, actual: &str) {
    let path = format!("{FIXTURES}/expected/{name}");
    if std::env::var_os("TRADECRAFT_BLESS").is_some() {
        std::fs::write(&path, actual).unwrap();
        return;
    }
    let expected = std::fs::read_to_string(&path).unwrap();
    assert_eq!(actual, expected, "{name} differs from its fixture");
}

#[test]
fn claude_and_codex_packs_match_their_fixtures() {
    let vfs = built();
    for (harness, pack) in &PACKS[..2] {
        let hooks = text_at(&vfs, &format!("{pack}/hooks/hooks.json"));
        assert_fixture(&format!("{harness}-hooks.json"), &hooks);
    }
}

#[test]
fn the_cursor_pack_carries_its_own_shape_and_names_it() {
    let vfs = built();
    let pack = PACKS[2].1;
    let hooks = text_at(&vfs, &format!("{pack}/hooks/hooks.json"));
    assert_fixture("cursor-hooks.json", &hooks);
    assert!(hooks.contains("\"beforeSubmitPrompt\""), "{hooks}");
    assert!(hooks.contains("\"stop\""), "{hooks}");
    let manifest = text_at(&vfs, &format!("{pack}/.cursor-plugin/plugin.json"));
    assert!(
        manifest.contains("\"hooks\": \"./hooks/hooks.json\""),
        "{manifest}"
    );
}

/// Cursor keys its hooks by its own event name (`stop`); the others use the
/// file's (`Stop`).
#[test]
fn each_pack_names_its_own_plugin_root_and_fills_the_placeholders() {
    let vfs = built();
    for ((harness, pack), var) in
        PACKS[..3]
            .iter()
            .zip(["CLAUDE_PLUGIN_ROOT", "PLUGIN_ROOT", "CURSOR_PLUGIN_ROOT"])
    {
        let hooks: serde_json::Value =
            serde_json::from_str(&text_at(&vfs, &format!("{pack}/hooks/hooks.json"))).unwrap();
        let stop = if *harness == "cursor" {
            &hooks["hooks"]["stop"][0]["command"]
        } else {
            &hooks["hooks"]["Stop"][0]["hooks"][0]["command"]
        };
        assert_eq!(
            stop.as_str().unwrap(),
            format!("${{{var}}}/cli/sdlc session stop --harness {harness} --event Stop"),
            "{harness}"
        );
    }
}

#[test]
fn an_unknown_placeholder_fails_the_build() {
    let vfs = vault(r#"{"hooks": {"Stop": [{"hooks": [{"command": "x {{foo}}"}]}]}}"#);
    let err = export_skills(&vfs, &request(ExportMode::Build), &Namespace::default())
        .unwrap_err()
        .to_string();
    assert!(err.contains("plugin/hooks.json"), "{err}");
    assert!(err.contains("hooks.Stop[0].hooks[0]"), "{err}");
    assert!(err.contains("{{foo}}"), "{err}");
    assert!(!vfs.exists(Path::new("/market/.claude-plugin")));
}

#[test]
fn the_pi_pack_has_no_hooks_file() {
    let vfs = built();
    let pack = PACKS[3].1;
    assert!(!vfs.exists(Path::new(&format!("{pack}/hooks/hooks.json"))));
    assert!(vfs.exists(Path::new(&format!("{pack}/hooks/gap-report.json"))));
}

/// The gap report is identical in every pack and across builds.
#[test]
fn every_pack_carries_the_same_gap_report() {
    let first = built();
    let second = built();
    let reports: Vec<String> = PACKS
        .iter()
        .map(|(_, pack)| text_at(&first, &format!("{pack}/hooks/gap-report.json")))
        .collect();
    for report in &reports {
        assert_eq!(report, &reports[0], "every pack's report is the same bytes");
    }
    assert_eq!(
        reports[0],
        text_at(&second, &format!("{}/hooks/gap-report.json", PACKS[0].1)),
        "two builds give the same bytes"
    );
    assert_fixture("gap-report.json", &reports[0]);

    let report: serde_json::Value = serde_json::from_str(&reports[0]).unwrap();
    let harnesses = &report["harnesses"];
    for harness in ["claude", "codex", "cursor"] {
        assert_eq!(harnesses[harness]["delivery"], "plugin", "{harness}");
        assert_eq!(harnesses[harness]["file"], "hooks/hooks.json", "{harness}");
    }
    assert_eq!(harnesses["pi"]["delivery"], "none");
    assert_eq!(harnesses["pi"]["file"], serde_json::Value::Null);
    assert_eq!(harnesses["pi"]["plugin_root_var"], serde_json::Value::Null);
    assert_eq!(harnesses["codex"]["plugin_root_var"], "PLUGIN_ROOT");
    assert_eq!(harnesses["cursor"]["plugin_root_var"], "CURSOR_PLUGIN_ROOT");
    for event in [
        "SessionStart",
        "UserPromptSubmit",
        "Stop",
        "Notification",
        "SessionEnd",
    ] {
        assert_eq!(
            harnesses["pi"]["events"][event]["support"], "rejected",
            "{event}"
        );
    }
}

/// An event a harness does not carry is left out of its file and named in
/// the report, and the build goes on.
#[test]
fn an_uncarried_event_is_left_out_and_reported() {
    let vfs = built();
    let report: serde_json::Value = serde_json::from_str(&text_at(
        &vfs,
        &format!("{}/hooks/gap-report.json", PACKS[0].1),
    ))
    .unwrap();
    for (harness, pack) in &PACKS[..3] {
        let left_out: Vec<&str> = report["harnesses"][harness]["left_out"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry["hook"].as_str().unwrap())
            .collect();
        let hooks = text_at(&vfs, &format!("{pack}/hooks/hooks.json"));
        let carried = !left_out.contains(&"hooks.Notification[0].hooks[0]");
        assert_eq!(hooks.contains("session notify"), carried, "{harness}");
    }
    assert_eq!(
        report["harnesses"]["claude"]["left_out"],
        serde_json::json!([]),
        "claude carries every event in the fixture"
    );
}

/// A hook whose shape Cursor's file cannot hold is left out of the Cursor
/// pack alone, and the report says why.
#[test]
fn a_shape_cursor_cannot_hold_is_left_out_of_cursor_only() {
    let vfs =
        vault(r#"{"hooks": {"Stop": [{"hooks": [{"command": "just stop", "async": true}]}]}}"#);
    export_skills(&vfs, &request(ExportMode::Build), &Namespace::default()).unwrap();
    assert!(text_at(&vfs, &format!("{}/hooks/hooks.json", PACKS[0].1)).contains("just stop"));
    let cursor = PACKS[2].1;
    assert!(!vfs.exists(Path::new(&format!("{cursor}/hooks/hooks.json"))));
    let report: serde_json::Value =
        serde_json::from_str(&text_at(&vfs, &format!("{cursor}/hooks/gap-report.json"))).unwrap();
    let cursor = &report["harnesses"]["cursor"];
    assert_eq!(cursor["delivery"], "none");
    assert_eq!(cursor["file"], serde_json::Value::Null);
    let reason = cursor["left_out"][0]["reason"].as_str().unwrap();
    assert!(reason.contains("async"), "{reason}");
}

/// A hook on an event only Codex documents gives every other harness `none`.
#[test]
fn an_event_only_codex_carries_means_no_delivery_elsewhere() {
    let vfs = vault(r#"{"hooks": {"Interrupt": [{"hooks": [{"command": "x"}]}]}}"#);
    export_skills(&vfs, &request(ExportMode::Build), &Namespace::default()).unwrap();
    let report: serde_json::Value = serde_json::from_str(&text_at(
        &vfs,
        &format!("{}/hooks/gap-report.json", PACKS[0].1),
    ))
    .unwrap();
    for (harness, pack) in PACKS.iter().filter(|(harness, _)| *harness != "codex") {
        assert_eq!(
            report["harnesses"][harness]["delivery"], "none",
            "{harness}"
        );
        assert!(!vfs.exists(Path::new(&format!("{pack}/hooks/hooks.json"))));
    }
    assert_ne!(report["harnesses"]["codex"]["delivery"], "none");
}

#[test]
fn a_hand_edited_gap_report_is_drift() {
    let vfs = built();
    let path = format!("{}/hooks/gap-report.json", PACKS[2].1);
    let edited = text_at(&vfs, &path).replace("\"plugin\"", "\"none\"");
    write(&vfs, &path, &edited);
    let report = export_skills(&vfs, &request(ExportMode::Check), &Namespace::default()).unwrap();
    assert!(report.changed, "the edit is reported as drift");
}

#[test]
fn an_unknown_event_fails_the_build() {
    let vfs = vault(r#"{"hooks": {"OnBoot": [{"hooks": [{"command": "x"}]}]}}"#);
    let err = export_skills(&vfs, &request(ExportMode::Build), &Namespace::default())
        .unwrap_err()
        .to_string();
    assert!(err.contains("plugin/hooks.json"), "{err}");
    assert!(err.contains("OnBoot"), "{err}");
    assert!(!vfs.exists(Path::new("/market/.claude-plugin")));
}

#[test]
fn two_hooks_files_for_one_plugin_are_refused() {
    let vfs = vault(&canonical());
    let mut request = request(ExportMode::Build);
    request.hooks.push(request.hooks[0].clone());
    let err = export_skills(&vfs, &request, &Namespace::default())
        .unwrap_err()
        .to_string();
    assert!(err.contains("duplicate-hooks-file"), "{err}");
}

#[test]
fn a_hooks_file_for_a_plugin_the_build_does_not_hold_is_refused() {
    let vfs = vault(&canonical());
    let mut request = request(ExportMode::Build);
    request.hooks[0].plugin = Some("ghost".to_owned());
    let err = export_skills(&vfs, &request, &Namespace::default())
        .unwrap_err()
        .to_string();
    assert!(err.contains("unknown-hooks-plugin"), "{err}");
}
