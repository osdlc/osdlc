use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::Argument;

/// A user-authored skill: the atomic unit of capability a runtime can
/// install and invoke.
///
/// Skills map to different on-disk layouts per runtime (e.g.
/// `.claude/skills/<slug>/SKILL.md`). This struct is the runtime-agnostic
/// content; the runtime's [`crate::SkillCapability`] impl decides the
/// filename and frontmatter dialect.
///
/// # Field notes
///
/// * [`Skill::name`] is the *human* name. Slugging to kebab-case happens
///   inside [`crate::naming::slugify_skill_name`] when the runtime needs
///   a spec-compliant filename — the struct stores the original so
///   authoring UIs can round-trip it.
/// * [`Skill::allowed_tools`] holds *canonical* tool names (see
///   [`crate::tools`]). Per-runtime translation happens at render time.
/// * [`Skill::argument_hint`], [`Skill::model_override`],
///   [`Skill::context_mode`], [`Skill::user_invocable`], and
///   [`Skill::disable_model_invocation`] map onto
///   [`crate::AGENT_SKILLS_EXTENSION_FIELDS`] — keys Claude Code defines
///   and the Agent Skills specification does not. Setting them is
///   lossless for a Claude Code render and a no-op everywhere else, since
///   every other dialect omits them.
/// * [`Skill::context_mode`] — `Some("fork")` emits `context: fork`,
///   `None` omits it.
/// * [`Skill::user_invocable`] defaults to `true`. Render impls emit
///   `user-invocable: false` only when it's `false`.
/// * [`Skill::disable_model_invocation`] is a direct mapping — `true`
///   emits the frontmatter field, `false` omits it.
/// * [`Skill::license`], [`Skill::compatibility`] and [`Skill::metadata`]
///   are the three optional keys in [`crate::AGENT_SKILLS_FIELDS`] that
///   carry no behaviour here — the crate renders them and never reads
///   them. Every dialect emits all three, because they are the
///   specification's own, not one harness's.
/// * [`Skill::annotations`] carries frontmatter keys the model does not
///   understand. Render impls emit them under `metadata:` — the
///   specification's home for client-specific data — in sorted key order,
///   with values JSON-encoded to strings because `metadata` is typed
///   `dict[str, str]`. Adopting a skill from disk and re-rendering it
///   keeps unrecognized keys and their values; it does not keep their YAML
///   type or their position in the file.
/// * [`Skill::resources`] are peer files that ship beside `SKILL.md`
///   (scripts, templates, references). Render impls emit each one under
///   the same slug directory as the `SKILL.md`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[non_exhaustive]
pub struct Skill {
    /// Human-readable name, e.g. `"Requirements Interview"`.
    pub name: String,
    /// Short description shown to the model.
    pub description: String,
    /// Optional invocation hint, e.g. `"<file-path>"`.
    ///
    /// Hand-written, or derived from [`Skill::arguments`] by
    /// [`crate::render::derive_argument_hint`] when this is `None` and
    /// `arguments` is not empty. The struct itself does not derive it —
    /// nothing here reads `arguments` to fill this in — a caller wanting the
    /// derivation calls that function itself before constructing a `Skill`.
    pub argument_hint: Option<String>,
    /// Claude Code's own `arguments:` frontmatter key — named positional
    /// arguments that make `$name` substitution available in the body,
    /// alongside `$ARGUMENTS`/`$N`. Hand-written, or derived the same way
    /// [`Skill::argument_hint`] is, by
    /// [`crate::render::derive_argument_names`]. Emitted only by the Claude
    /// Code dialect — see [`crate::AGENT_SKILLS_EXTENSION_FIELDS`] — since it
    /// is that harness's own field, not the specification's.
    pub argument_names: Option<Vec<String>>,
    /// What this skill's invocation is expected to carry, beyond the single
    /// hint string. Rendered into the body by
    /// [`crate::render::render_arguments_section`], in declaration order —
    /// the order [`Skill::argument_hint`]'s positional references (where the
    /// target has any) count from too.
    #[serde(default)]
    pub arguments: Vec<Argument>,
    /// The markdown body following the YAML frontmatter in `SKILL.md`.
    pub body: String,
    /// Canonical tool names this skill is allowed to use.
    pub allowed_tools: Vec<String>,
    /// The specification's `license:` — a licence name, or a reference to a
    /// bundled licence file. Free text: the spec constrains neither the
    /// vocabulary nor the length, so nothing here checks it against SPDX.
    #[serde(default)]
    pub license: Option<String>,
    /// The specification's `compatibility:` — what environment this skill
    /// needs. Capped at 500 characters by the spec; the cap is enforced
    /// where an author can act on it (`tradecraft-core`'s discovery, in osdlc/skillwright),
    /// never in the renderer, which has no way to report it.
    #[serde(default)]
    pub compatibility: Option<String>,
    /// The specification's `metadata:` — client-specific data, typed
    /// `dict[str, str]`, so both sides are already strings and nothing is
    /// encoded on the way out.
    ///
    /// Shares one `metadata:` block with [`Skill::annotations`], which is
    /// the same key by a different route. A name in both is written from
    /// here: this is the author's own entry in the specification's own
    /// home for it, and the annotation is a top-level key that had nowhere
    /// else to go.
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
    /// Optional per-skill model override (e.g. `"opus"`).
    pub model_override: Option<String>,
    /// Optional `context:` frontmatter value. `Some("fork")` creates a
    /// forked subagent context.
    pub context_mode: Option<String>,
    /// Whether the user can invoke this skill directly.
    pub user_invocable: bool,
    /// If `true`, the model itself cannot autonomously invoke this skill.
    pub disable_model_invocation: bool,
    /// Free-form tags for categorization.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Unrecognized frontmatter keys, emitted under `metadata:` at render
    /// time.
    ///
    /// A `BTreeMap` so emission order is deterministic regardless of how
    /// the map was populated. A key colliding with a modeled field is not
    /// dropped: the modeled field wins at the top level and the annotation
    /// survives as `metadata.<key>`.
    ///
    /// Filtering is the caller's job: a host application with keys of its own
    /// that must not travel removes them before rendering. The renderer has no
    /// vocabulary for "private".
    #[serde(default)]
    pub annotations: BTreeMap<String, serde_json::Value>,
    /// Peer files shipped beside `SKILL.md` under the slug directory.
    #[serde(default)]
    pub resources: Vec<SkillResource>,
    /// What this render's own target overrides, in that harness's own key
    /// names — `sw-overrides.<target>`, already narrowed to one target by
    /// the caller.
    ///
    /// Deliberately **not** keyed by target: which destination this is
    /// rendering for is the caller's answer, and folding every accepted
    /// spelling of a destination name onto one is `tradecraft-core`'s job (in osdlc/skillwright).
    /// A renderer holding the whole map would need that vocabulary too, and
    /// two places folding target names is two places to disagree.
    ///
    /// Merged **last**, over every modelled field, and outranking
    /// [`crate::FrontmatterDialect::omit_fields`] — see
    /// [`crate::render::FrontmatterBuilder::apply_overrides`].
    #[serde(default)]
    pub overrides: serde_json::Map<String, serde_json::Value>,
}

/// One peer file belonging to a [`Skill`] — rendered into the slug
/// directory beside `SKILL.md`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SkillResource {
    /// Path relative to the skill's slug directory, forward-slashed
    /// (e.g. `"scripts/run.sh"`).
    pub relative_path: String,
    /// Raw bytes — binary assets work.
    pub content: Vec<u8>,
    /// Whether install layers should set the executable bit.
    #[serde(default)]
    pub executable: bool,
}

impl Skill {
    /// Convenience constructor for a minimal skill.
    pub fn new(
        name: impl Into<String>,
        description: impl Into<String>,
        body: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            argument_hint: None,
            argument_names: None,
            arguments: Vec::new(),
            body: body.into(),
            allowed_tools: Vec::new(),
            license: None,
            compatibility: None,
            metadata: BTreeMap::new(),
            model_override: None,
            context_mode: None,
            user_invocable: true,
            disable_model_invocation: false,
            tags: Vec::new(),
            annotations: BTreeMap::new(),
            resources: Vec::new(),
            overrides: serde_json::Map::new(),
        }
    }
}
