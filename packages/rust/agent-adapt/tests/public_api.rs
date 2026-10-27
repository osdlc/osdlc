//! Reaches the public items no other test names, from outside the crate.

use std::collections::HashMap;
use std::path::Path;

use agent_adapt::capabilities::{self, hook_event_spelling, matrix};
use agent_adapt::{
    AssetKind, CapabilityMatrix, Claim, Concept, ConceptKind, DeclaresCapabilities, Error,
    Evidence, ExportedFile, ExportedFileType, ExportedTree, MatrixRow, McpServer, McpTransport,
    Result, RuntimeCapabilities, RuntimeId, RuntimePaths, ScopedRelative, ScriptLanguage, Skill,
    SkillCallSyntax, Support, ToolEntry, ToolRegistry, install, runtimes,
};

const EVIDENCE: Evidence = Evidence {
    url: "https://example.com/docs",
    observed_on: "2026-10-01",
    version: "unversioned documentation page",
};

#[test]
fn claim_builders_set_each_field() {
    let derived = Claim::derived(Support::Translated, "FrontmatterDialect::omit_fields")
        .with_spelling("allowed-tools")
        .with_note("renamed on the way out")
        .with_evidence(EVIDENCE);
    assert_eq!(derived.support, Support::Translated);
    assert_eq!(derived.harness_spelling.as_deref(), Some("allowed-tools"));
    assert_eq!(derived.note, Some("renamed on the way out"));
    assert_eq!(
        derived.derived_from,
        Some("FrontmatterDialect::omit_fields")
    );
    assert_eq!(derived.evidence, Some(EVIDENCE));

    let observed = Claim::observed(Support::Native, EVIDENCE);
    assert_eq!(observed.evidence, Some(EVIDENCE));
    assert_eq!(observed.derived_from, None);
}

#[test]
fn asset_kind_keys_round_trip() {
    for kind in AssetKind::ALL {
        assert_eq!(AssetKind::from_key(kind.as_str()), Some(*kind));
    }
    assert_eq!(AssetKind::from_key("not-an-asset"), None);
}

#[test]
fn a_custom_declaration_answers_through_claim() {
    struct Custom;
    impl DeclaresCapabilities for Custom {
        fn capabilities(&self) -> RuntimeCapabilities {
            let mut declaration = RuntimeCapabilities::new(RuntimeId::Portable);
            declaration
                .assets
                .insert(AssetKind::Skill, Claim::observed(Support::Native, EVIDENCE));
            declaration
        }
    }
    let declaration = Custom.capabilities();
    let claim = declaration.claim(ConceptKind::Asset, AssetKind::Skill.as_str());
    assert_eq!(claim.map(|c| c.support), Some(Support::Native));
    assert!(declaration.fields.is_empty());
}

#[test]
fn every_built_in_runtime_declares_itself() {
    let declarations = capabilities::all_declarations();
    assert_eq!(declarations.len(), RuntimeId::ALL.len());
    assert_eq!(
        runtimes::ClaudeCode.capabilities(),
        runtimes::declaration_for(RuntimeId::ClaudeCode)
    );
}

#[test]
fn the_matrix_finds_rows_by_kind_and_key() {
    let table: CapabilityMatrix = matrix(&capabilities::all_declarations());
    assert_eq!(table.columns.len(), RuntimeId::ALL.len());

    let row: &MatrixRow = table
        .row(ConceptKind::Asset, AssetKind::Skill.as_str())
        .expect("a skill row");
    let concept: &Concept = &row.concept;
    assert_eq!(concept.kind, ConceptKind::Asset);
    assert_eq!(row.claims.len(), table.columns.len());

    assert!(
        table
            .of_kind(ConceptKind::HookEvent)
            .all(|r| r.concept.kind == ConceptKind::HookEvent)
    );
    assert!(table.row(ConceptKind::Tool, "no-such-tool").is_none());
}

#[test]
fn hook_event_spelling_translates_or_refuses() {
    assert_eq!(
        hook_event_spelling(RuntimeId::ClaudeCode, "PreToolUse").unwrap(),
        "PreToolUse"
    );
    assert!(hook_event_spelling(RuntimeId::ClaudeCode, "NoSuchEvent").is_err());
    assert!(hook_event_spelling(RuntimeId::Antigravity, "PreToolUse").is_err());
}

#[test]
fn error_constructors_pick_their_variant() {
    assert!(matches!(Error::render("x"), Error::Render(m) if m == "x"));
    assert!(matches!(Error::validation("y"), Error::Validation(m) if m == "y"));
    assert!(matches!(
        Error::unsafe_path("../x", "it walks up"),
        Error::UnsafePath { path, reason } if path == "../x" && reason == "it walks up"
    ));
    let failed: Result<()> = Err(Error::render("z"));
    assert!(failed.is_err());
}

#[test]
fn user_anchor_is_never_empty() {
    if let Some(home) = install::user_anchor() {
        assert!(!home.as_os_str().is_empty());
    }
}

#[test]
fn exported_tree_hands_back_its_files() {
    let tree: ExportedTree = [ExportedFile::text_file(
        "a.md",
        "x",
        ExportedFileType::Other,
    )]
    .into_iter()
    .collect();
    assert_eq!(tree.as_slice().len(), 1);
    let files = tree.into_files();
    assert_eq!(files[0].path, Path::new("a.md"));
}

#[test]
fn runtime_paths_anchor_each_directory() {
    let mut paths = RuntimePaths::new(
        ScopedRelative::same(".x/skills"),
        ScopedRelative::same(".x/agents"),
        ScopedRelative::same(".x/scripts"),
    );
    let anchor = Path::new("/p");
    let scope = agent_adapt::Scope::Project;
    assert_eq!(
        paths.agents_dir_for(anchor, scope),
        anchor.join(".x/agents")
    );
    assert_eq!(
        paths.scripts_dir_for(anchor, scope),
        anchor.join(".x/scripts")
    );
    assert_eq!(paths.commands_dir_for(anchor, scope), None);
    paths.commands_dir = Some(ScopedRelative::same(".x/commands"));
    assert_eq!(
        paths.commands_dir_for(anchor, scope),
        Some(anchor.join(".x/commands"))
    );
}

#[test]
fn skill_call_syntax_names_its_prefix() {
    let syntax: SkillCallSyntax = RuntimeId::ClaudeCode.skill_call_syntax();
    assert_eq!(syntax.prefix, "/");
    assert!(syntax.namespaced);
}

#[test]
fn an_empty_registry_passes_names_through() {
    let mut registry = ToolRegistry::empty();
    assert_eq!(
        registry.translate_tool_name("Read", RuntimeId::CodexCli),
        "Read"
    );
    registry.tools.push(ToolEntry {
        canonical_name: "Read".into(),
        description: "read a file".into(),
        runtime_names: HashMap::from([(RuntimeId::CodexCli, "read_file".to_string())]),
    });
    assert_eq!(
        registry.translate_tool_name("Read", RuntimeId::CodexCli),
        "read_file"
    );
}

#[test]
fn mcp_transport_follows_the_constructor() {
    let http = McpServer::http("a", "http://localhost/mcp");
    assert!(
        matches!(http.transport, McpTransport::Http { ref url } if url == "http://localhost/mcp")
    );
}

#[test]
fn script_language_gives_extension_and_shebang() {
    assert_eq!(ScriptLanguage::Bash.extension(), "sh");
    assert_eq!(
        ScriptLanguage::Python.shebang(),
        Some("#!/usr/bin/env python3")
    );
    let other = ScriptLanguage::Other("rb".into());
    assert_eq!(other.extension(), "rb");
    assert_eq!(other.shebang(), None);
}

#[test]
fn redundant_skill_overrides_names_a_key_the_render_already_writes() {
    let mut skill = Skill::new("Review", "Review a diff", "body");
    skill
        .overrides
        .insert("description".into(), "Review a diff".into());
    let redundant = runtimes::redundant_skill_overrides(RuntimeId::ClaudeCode, &skill)
        .expect("Claude Code renders skills")
        .unwrap();
    assert_eq!(redundant, ["description"]);
}
