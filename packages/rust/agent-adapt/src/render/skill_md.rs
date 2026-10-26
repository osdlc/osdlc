//! Render a [`Skill`] into a complete `SKILL.md` body (frontmatter + markdown).
//!
//! This is the function each runtime's [`crate::SkillCapability`] impl
//! calls. It handles:
//!
//! * Slugging the human skill name to kebab-case via
//!   [`crate::naming::slugify_skill_name`] for the `name:` field.
//! * Translating each canonical tool name to the target runtime's
//!   vocabulary via [`ToolRegistry::translate_tool_name`].
//! * Honoring the runtime's [`FrontmatterDialect`] (kebab vs snake,
//!   omitted fields, `user-invocable` default handling).
//! * Folding unmodelled keys into `metadata`, which is where the
//!   specification puts client-specific data.
//!
//! # The conformant field set is six keys, and it is closed
//!
//! [`crate::AGENT_SKILLS_FIELDS`] — `name`, `description`, `license`,
//! `compatibility`, `metadata`, `allowed-tools` — is the whole
//! specification-defined vocabulary. A key outside it is **not** quietly
//! ignored by clients that do not know it: `agentskills validate`,
//! claude.ai upload, and the Skills API each reject the file outright.
//! Only loading harnesses are lenient, and the client-implementation
//! guide's advice to be lenient is addressed to *readers*, not writers.
//!
//! All six are modelled. `name`, `description`, `license`,
//! `compatibility` and `allowed-tools` each come from one field, and
//! `metadata` from two: [`Skill::metadata`], the author's own map, merged
//! with [`Skill::annotations`], the keys the model does not understand.
//! Every dialect emits all six — they are the specification's, so no
//! target omits them.
//!
//! `allowed-tools` is a **space-separated string** (`allowed-tools: Read
//! Grep`), not a YAML sequence. The spec types it a string and the
//! reference model types it `Optional[str]`; Claude Code additionally
//! accepts a list, which is a leniency of that one reader and not a
//! licence to emit one.
//!
//! # The six keys that are Claude Code's, not the specification's
//!
//! `argument-hint`, `arguments`, `model`, `context`, `user-invocable`, and
//! `disable-model-invocation` — [`crate::AGENT_SKILLS_EXTENSION_FIELDS`] —
//! are **not** spec fields. They are emitted only by a dialect that
//! declines to omit them, which today means Claude Code alone. (Claude
//! Code's own documentation prints `argument-hint` inside the hard-error
//! message a validating client produces.) Rendering the same skill to
//! [`crate::runtimes::Portable`] is how a caller gets an upload-clean
//! copy of it.
//!
//! # Unmodelled keys: under `metadata`, flattened, never dropped
//!
//! [`Skill::annotations`] carries the frontmatter keys the model does not
//! understand. They are emitted **nested under `metadata:`**, never beside
//! the modelled fields — the specification says `metadata` is where
//! "clients can use this to store additional properties not defined by the
//! Agent Skills spec", and a key at the top level is the hard error above.
//!
//! `metadata` is typed `dict[str, str]`, so a value that is not a string
//! cannot ride through unchanged, and the choice is to flatten it or to
//! refuse it. **This renderer flattens, by JSON-encoding the value**:
//! a string passes through verbatim, and everything else — number,
//! boolean, null, array, nested map — becomes its compact JSON text.
//!
//! ```text
//! priority: 3            ->  metadata: { priority: "3" }
//! reviewers: [a, b]      ->  metadata: { reviewers: "[\"a\",\"b\"]" }
//! ```
//!
//! Two alternatives were weighed and rejected:
//!
//! * **Refusing** a non-string value makes one un-quoted number in a
//!   note's frontmatter un-publishable to *every* target, including the
//!   ones where it was harmless. The rule this crate serves is "verbatim
//!   at the source, conformant at the destination", which wants a total
//!   encoding rather than a hard stop.
//! * **Dotted-path flattening** (`meta.alpha.inner`) reads better but is
//!   ambiguous — `{"a.b": 1}` and `{"a": {"b": 1}}` collide — and it drops
//!   an empty map or empty array entirely, since neither has a leaf. JSON
//!   encoding is total, reversible, and one metadata key per annotation
//!   key, so nothing collides and nothing is silently lost.
//!
//! An annotation whose name matches a modelled field is no longer dropped:
//! the modelled field still wins at the top level, and the author's value
//! survives as `metadata.<name>`. For the one collision this can't split
//! two ways — an annotation named the same as a [`Skill::metadata`] entry
//! — see `metadata_map`'s doc for which one wins and why.
//!
//! What this renderer does *not* do is strip any reserved prefix. Which
//! keys are private to a host application is that application's
//! vocabulary, not the specification's, so the caller filters
//! [`Skill::annotations`] before handing them over.

use std::collections::BTreeMap;

use crate::render::FrontmatterBuilder;
use crate::render::arguments::{ArgumentSite, append_arguments_section};
use crate::{
    FrontmatterDialect, Result, RuntimeId, Skill, ToolRegistry, naming::slugify_skill_name,
};

/// Render `skill` into the full `SKILL.md` contents for the given runtime.
///
/// Each entry in [`Skill::allowed_tools`] is passed through
/// `registry.translate_tool_name(_, runtime)` so authors write canonical
/// names once and every runtime sees its own vocabulary.
///
/// # Errors
///
/// Refuses when [`Skill::name`] has no legal slug — see
/// [`slugify_skill_name`]. `name` is a required spec field, and
/// [`FrontmatterBuilder::scalar`] skips empty values, so an unchecked
/// empty slug would silently ship frontmatter with no `name:` at all.
pub fn render_skill_md(
    skill: &Skill,
    runtime: RuntimeId,
    dialect: &FrontmatterDialect,
    registry: &ToolRegistry,
) -> Result<String> {
    render_skill_md_reporting(skill, runtime, dialect, registry).map(|(text, _)| text)
}

/// [`render_skill_md`], plus the redundant half of
/// [`crate::render::FrontmatterBuilder::apply_overrides`]'s report: every
/// [`Skill::overrides`] key whose value is what this render already wrote.
///
/// The sibling exists because a diagnostic is not a file. Threading it
/// through [`crate::ExportedFile`] would put it on every path a renderer
/// produces, including the peer resources it says nothing about; a caller
/// that wants the report calls this and a caller that wants bytes calls
/// [`render_skill_md`].
///
/// # Errors
///
/// The same one [`render_skill_md`] raises, for the same reason.
pub(crate) fn render_skill_md_reporting(
    skill: &Skill,
    runtime: RuntimeId,
    dialect: &FrontmatterDialect,
    registry: &ToolRegistry,
) -> Result<(String, Vec<String>)> {
    // Non-empty by construction, so `b.scalar("name", ..)` below cannot
    // drop the required key.
    let slug = slugify_skill_name(&skill.name)?;

    let translated_tools: Vec<String> = skill
        .allowed_tools
        .iter()
        .map(|t| registry.translate_tool_name(t, runtime))
        .collect();

    let mut b = FrontmatterBuilder::new(dialect);
    b.scalar("name", &slug);
    b.scalar("description", &skill.description);
    // The spec's own order for its own keys, and no dialect omits them.
    if let Some(license) = skill.license.as_deref() {
        b.scalar("license", license);
    }
    if let Some(compatibility) = skill.compatibility.as_deref() {
        b.scalar("compatibility", compatibility);
    }
    // A space-separated string, not a sequence: that is the type the spec
    // gives `allowed-tools`. An empty list emits no key at all, because
    // `scalar` skips empty values.
    b.scalar("allowed_tools", &translated_tools.join(" "));

    if let Some(hint) = skill.argument_hint.as_deref() {
        b.scalar_quoted("argument_hint", hint);
    }

    if let Some(names) = skill.argument_names.as_deref() {
        b.list("arguments", names);
    }

    if let Some(model) = skill.model_override.as_deref() {
        b.scalar("model", model);
    }

    // `fork` is the only value Claude Code recognizes; anything else is
    // dropped rather than passed through to a reader that cannot act on it.
    if let Some(mode) = skill.context_mode.as_deref()
        && mode == "fork"
    {
        b.scalar("context", "fork");
    }

    // user-invocable defaults to true in Claude Code. Emit
    // `user-invocable: false` only when the skill explicitly disables it;
    // dialects that want the default stated explicitly opt in via
    // `emit_user_invocable_default`.
    if !skill.user_invocable {
        b.boolean("user_invocable", false);
    } else if dialect.emit_user_invocable_default {
        b.boolean("user_invocable", true);
    }

    if skill.disable_model_invocation {
        b.boolean("disable_model_invocation", true);
    }

    // Annotations last, and *inside* `metadata` — the spec's home for
    // keys it does not define — merged with the author's own `metadata`
    // map, which is the same key by a different route. Sorted, because
    // both BTreeMaps already are.
    let metadata = metadata_map(&skill.metadata, &skill.annotations);
    if !metadata.is_empty() {
        b.raw_entry("metadata", &serde_json::Value::Object(metadata));
    }

    // The override has the final word here — see `Skill::overrides`'s doc comment (model/skill.rs) for the merge contract.
    let redundant = b.apply_overrides(&skill.overrides);

    let frontmatter = b.build();
    let body =
        append_arguments_section(&skill.body, &skill.arguments, runtime, ArgumentSite::Skill);
    let mut out = format!("{frontmatter}\n{body}");
    // Exactly one trailing newline. Appending unconditionally grew the
    // file by a byte on every parse-and-re-render pass, so a publish that
    // changed nothing still reported a changed file.
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Ok((out, redundant))
}

/// Fold the author's own `metadata` map and the unmodelled keys into one
/// `metadata` map the spec's `dict[str, str]` typing accepts.
///
/// Annotation values become strings: a JSON string passes through
/// verbatim, and anything else — number, boolean, null, array, object —
/// becomes its compact JSON text. See this module's docs for why that
/// beats refusing the value or flattening nested maps onto dotted keys.
/// `modelled` is already `dict[str, str]` and needs no encoding, and it
/// is written second so a name in both blocks carries the author's own
/// entry.
fn metadata_map(
    modelled: &BTreeMap<String, String>,
    annotations: &BTreeMap<String, serde_json::Value>,
) -> serde_json::Map<String, serde_json::Value> {
    let mut out: serde_json::Map<String, serde_json::Value> = annotations
        .iter()
        .map(|(key, value)| {
            let text = match value {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            (key.clone(), serde_json::Value::String(text))
        })
        .collect();
    for (key, value) in modelled {
        out.insert(key.clone(), serde_json::Value::String(value.clone()));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AGENT_SKILLS_EXTENSION_FIELDS, FieldNaming, Skill};

    fn kebab_dialect() -> FrontmatterDialect {
        FrontmatterDialect {
            field_naming: FieldNaming::Kebab,
            omit_fields: &[],
            emit_user_invocable_default: false,
        }
    }

    fn minimal_skill() -> Skill {
        let mut s = Skill::new("My Skill", "A test skill", "Do the thing.");
        s.allowed_tools = vec!["Read".into(), "Write".into()];
        s
    }

    #[test]
    fn unsluggable_name_is_refused_not_rendered_without_name() {
        for name in ["!!!", "日本語", "", "---"] {
            let mut s = minimal_skill();
            s.name = name.into();
            let err = render_skill_md(
                &s,
                RuntimeId::ClaudeCode,
                &kebab_dialect(),
                &ToolRegistry::default(),
            )
            .expect_err("un-sluggable name must be refused");
            assert!(
                err.to_string().contains("[a-z0-9-]"),
                "refusal states the fix: {err}"
            );
        }
    }

    #[test]
    fn renders_name_as_slug() {
        let out = render_skill_md(
            &minimal_skill(),
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("name: my-skill"));
    }

    #[test]
    fn allowed_tools_is_a_space_separated_string_not_a_sequence() {
        let out = render_skill_md(
            &minimal_skill(),
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("allowed-tools: Read Write"));
        assert!(!out.contains("  - Read"), "no block sequence: {out}");
    }

    #[test]
    fn no_allowed_tools_key_when_the_list_is_empty() {
        let mut s = minimal_skill();
        s.allowed_tools.clear();
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(!out.contains("allowed-tools"));
    }

    #[test]
    fn translates_tools_for_codex() {
        let out = render_skill_md(
            &minimal_skill(),
            RuntimeId::CodexCli,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("allowed-tools: read_file write_file"));
    }

    #[test]
    fn claude_code_keeps_native_tool_names() {
        let out = render_skill_md(
            &minimal_skill(),
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("allowed-tools: Read Write"));
    }

    #[test]
    fn kebab_dialect_uses_hyphenated_fields() {
        let out = render_skill_md(
            &minimal_skill(),
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("allowed-tools:"));
        assert!(!out.contains("allowed_tools:"));
    }

    #[test]
    fn user_invocable_true_is_omitted_by_default() {
        let out = render_skill_md(
            &minimal_skill(),
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(!out.contains("user-invocable"));
    }

    #[test]
    fn user_invocable_false_is_emitted() {
        let mut s = minimal_skill();
        s.user_invocable = false;
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("user-invocable: false"));
    }

    #[test]
    fn disable_model_invocation_emitted_when_true() {
        let mut s = minimal_skill();
        s.disable_model_invocation = true;
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("disable-model-invocation: true"));
    }

    #[test]
    fn argument_hint_quoted() {
        let mut s = minimal_skill();
        s.argument_hint = Some("<file>".into());
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("argument-hint: \"<file>\""));
    }

    #[test]
    fn argument_names_render_as_a_block_sequence() {
        let mut s = minimal_skill();
        s.argument_names = Some(vec!["issue".into(), "branch".into()]);
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("arguments:\n  - issue\n  - branch"), "{out}");
    }

    #[test]
    fn an_absent_argument_names_writes_no_key() {
        let out = render_skill_md(
            &minimal_skill(),
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(!out.contains("arguments:"), "{out}");
    }

    #[test]
    fn argument_names_omitted_outside_claude_code() {
        let mut s = minimal_skill();
        s.argument_names = Some(vec!["issue".into()]);
        let out = render_skill_md(
            &s,
            RuntimeId::CodexCli,
            &FrontmatterDialect {
                field_naming: FieldNaming::Kebab,
                omit_fields: AGENT_SKILLS_EXTENSION_FIELDS,
                emit_user_invocable_default: false,
            },
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(!out.contains("arguments:"), "{out}");
    }

    #[test]
    fn model_override_emitted() {
        let mut s = minimal_skill();
        s.model_override = Some("opus".into());
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("model: opus"));
    }

    #[test]
    fn context_fork_emitted_when_set() {
        let mut s = minimal_skill();
        s.context_mode = Some("fork".into());
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("context: fork"));
    }

    #[test]
    fn context_non_fork_is_ignored() {
        let mut s = minimal_skill();
        s.context_mode = Some("something-else".into());
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(!out.contains("context:"));
    }

    #[test]
    fn annotations_emitted_under_metadata_sorted() {
        let mut s = minimal_skill();
        s.annotations.insert("zeta".into(), serde_json::json!(3));
        s.annotations
            .insert("alpha_key".into(), serde_json::json!("v"));
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        let close = out.find("\n---\n").expect("closing fence");
        let fm = &out[..close];
        assert!(fm.contains("metadata:\n"), "metadata block emitted: {fm}");
        let alpha = fm.find("  alpha_key: v").expect("alpha_key nested");
        // A number cannot ride through `dict[str, str]`, so it is quoted.
        let zeta = fm.find("  zeta: \"3\"").expect("zeta nested and stringy");
        assert!(
            fm.find("description:").unwrap() < alpha,
            "metadata follows the modeled fields"
        );
        assert!(alpha < zeta, "sorted key order");
    }

    #[test]
    fn no_unmodelled_key_reaches_the_top_level() {
        let mut s = minimal_skill();
        s.annotations
            .insert("x-custom".into(), serde_json::json!("kept"));
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("  x-custom: kept"), "nested: {out}");
        assert!(!out.contains("\nx-custom:"), "never at the top level");
    }

    #[test]
    fn nested_and_scalar_values_are_flattened_never_dropped() {
        let mut s = minimal_skill();
        s.annotations
            .insert("nested".into(), serde_json::json!({"inner": {"deep": 1}}));
        s.annotations
            .insert("listy".into(), serde_json::json!(["a", "b"]));
        s.annotations
            .insert("empty_map".into(), serde_json::json!({}));
        s.annotations.insert("flag".into(), serde_json::json!(true));
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(
            out.contains(r#"  nested: "{\"inner\":{\"deep\":1}}""#),
            "{out}"
        );
        assert!(out.contains(r#"  listy: "[\"a\",\"b\"]""#), "{out}");
        // The case dotted-path flattening loses entirely.
        assert!(out.contains(r#"  empty_map: "{}""#), "{out}");
        assert!(out.contains(r#"  flag: "true""#), "{out}");
        // One `metadata:` line and no nested block map under it.
        assert_eq!(out.matches("metadata:").count(), 1);
        assert!(!out.contains("    "), "no second level of nesting: {out}");
    }

    #[test]
    fn annotation_colliding_with_modeled_field_survives_under_metadata() {
        let mut s = minimal_skill();
        s.annotations
            .insert("description".into(), serde_json::json!("clobber"));
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("description: A test skill"), "modeled wins");
        assert!(
            out.contains("  description: clobber"),
            "and the author's value is not silently dropped: {out}"
        );
    }

    #[test]
    fn license_and_compatibility_render_as_spec_scalars() {
        let mut s = minimal_skill();
        s.license = Some("MIT".into());
        s.compatibility = Some("Requires bash and git".into());
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("\nlicense: MIT\n"), "{out}");
        assert!(
            out.contains("\ncompatibility: Requires bash and git\n"),
            "{out}"
        );
    }

    #[test]
    fn absent_license_and_compatibility_write_no_key() {
        let out = render_skill_md(
            &minimal_skill(),
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(!out.contains("license"), "{out}");
        assert!(!out.contains("compatibility"), "{out}");
    }

    /// The three optional spec fields are the specification's, not one
    /// harness's, so the dialect that drops every Claude Code extension
    /// still writes all three.
    #[test]
    fn the_optional_spec_fields_survive_the_portable_dialect() {
        let mut s = minimal_skill();
        s.license = Some("Apache-2.0".into());
        s.compatibility = Some("macOS only".into());
        s.metadata.insert("team".into(), "platform".into());
        let out = render_skill_md(
            &s,
            RuntimeId::Portable,
            &FrontmatterDialect {
                field_naming: FieldNaming::Kebab,
                omit_fields: AGENT_SKILLS_EXTENSION_FIELDS,
                emit_user_invocable_default: false,
            },
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("license: Apache-2.0"), "{out}");
        assert!(out.contains("compatibility: macOS only"), "{out}");
        assert!(out.contains("  team: platform"), "{out}");
    }

    #[test]
    fn modelled_metadata_and_annotations_share_one_sorted_block() {
        let mut s = minimal_skill();
        s.metadata.insert("team".into(), "platform".into());
        s.metadata.insert("alpha".into(), "first".into());
        s.annotations.insert("zeta".into(), serde_json::json!(3));
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert_eq!(out.matches("metadata:").count(), 1, "one block: {out}");
        let alpha = out.find("  alpha: first").expect("modelled entry");
        let team = out.find("  team: platform").expect("modelled entry");
        let zeta = out.find("  zeta: \"3\"").expect("annotation entry");
        assert!(alpha < team && team < zeta, "sorted across both: {out}");
    }

    /// Both routes reach `metadata.<name>`, and there is no second slot, so
    /// the author's own entry is the one written.
    #[test]
    fn a_metadata_entry_outranks_an_annotation_of_the_same_name() {
        let mut s = minimal_skill();
        s.metadata.insert("team".into(), "platform".into());
        s.annotations
            .insert("team".into(), serde_json::json!("stale"));
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("  team: platform"), "{out}");
        assert!(!out.contains("stale"), "{out}");
    }

    /// A `metadata` value is already a string, so nothing JSON-encodes it —
    /// the number-shaped one still quotes, because a plain `3` re-parses as
    /// a number and `metadata` is typed `dict[str, str]`.
    #[test]
    fn metadata_values_are_written_as_the_strings_they_already_are() {
        let mut s = minimal_skill();
        s.metadata.insert("count".into(), "3".into());
        s.metadata.insert("phrase".into(), "two words".into());
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains(r#"  count: "3""#), "{out}");
        assert!(out.contains("  phrase: two words"), "{out}");
    }

    #[test]
    fn body_follows_frontmatter() {
        let out = render_skill_md(
            &minimal_skill(),
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        let (_, after) = out.split_once("---\n").unwrap();
        let (_, body) = after.split_once("---\n").unwrap();
        assert!(body.contains("Do the thing."));
    }

    #[test]
    fn arguments_render_a_section_after_the_body_and_exactly_one_trailing_newline() {
        let mut s = minimal_skill();
        s.arguments = vec![crate::Argument::required("pr-number", "desc")];
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.contains("Do the thing.\n\n## Arguments"), "{out}");
        assert!(out.ends_with("- `pr-number` (required): desc\n"), "{out}");
        assert!(!out.ends_with("\n\n"), "{out}");
    }

    #[test]
    fn no_arguments_renders_no_section_and_no_extra_bytes() {
        let out = render_skill_md(
            &minimal_skill(),
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(!out.contains("## Arguments"), "{out}");
    }

    #[test]
    fn a_body_ending_in_a_newline_does_not_gain_a_second() {
        let mut s = minimal_skill();
        s.body = "Do the thing.\n".into();
        let out = render_skill_md(
            &s,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert!(out.ends_with("Do the thing.\n"));
        assert!(!out.ends_with("\n\n"));

        // Re-rendering what a reader would parse back out is byte-stable.
        let mut again = s.clone();
        again.body = out.rsplit_once("---\n").unwrap().1.trim_start().to_owned();
        let second = render_skill_md(
            &again,
            RuntimeId::ClaudeCode,
            &kebab_dialect(),
            &ToolRegistry::default(),
        )
        .unwrap();
        assert_eq!(out, second);
    }
}
