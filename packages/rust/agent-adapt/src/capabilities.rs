//! What each runtime can do, declared by the runtime itself.
//!
//! Every adapter in [`crate::runtimes`] implements [`DeclaresCapabilities`]
//! and returns one [`RuntimeCapabilities`]: a [`Claim`] per asset kind,
//! frontmatter field, tool name, permission concept and hook event. What
//! those subjects *are* is runtime-independent and lives in [`concepts`].
//! [`all_declarations`] collects every declaration; [`matrix`] is one view of them and
//! [`CapabilityMatrix::to_markdown`] its readable form.
//!
//! # The one map keyed by the harness's own words
//!
//! [`RuntimeCapabilities::overrides`] is the exception to all of that —
//! keyed by what the *harness* calls a key (`permissionMode`, `permission`,
//! `policy.allow_implicit_invocation`), not a runtime-independent concept;
//! see its own doc for why. `override_keys` assembles one from the half
//! the dialect already decides and the half an adapter seeds.
//!
//! # Why half of a declaration is derived and half is seeded
//!
//! Half of the answer is already in this crate's code, so an adapter reads
//! it rather than retyping it: `derived_fields` reads its own
//! [`crate::FrontmatterDialect::omit_fields`], `derived_assets` the six
//! per-capability lookups, `derived_tools` its
//! [`ToolRegistry::translate_tool_name`]. Those claims cannot drift from the
//! renderers, and `derived_claims_match_their_source` checks it.
//!
//! Permissions and hook events have no OTHER code to derive their claims from —
//! this crate models no allow/ask/deny vocabulary, and while [`hook_event_spelling`]
//! reads exactly the claims this module seeds to translate or refuse an event, the
//! claims themselves still come from published documentation, not from another
//! source in code. Each adapter seeds those from published documentation, and
//! every seeded claim carries an [`Evidence`] record naming the page and the date
//! it was read.
//!
//! [`crate::runtimes::copilot`] declares like every other adapter even
//! though it is absent from [`crate::runtimes::all`]: it renders commands
//! and nothing else, and a consumer still needs to read "this harness takes
//! commands and refuses the rest".

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::runtimes;
use crate::{
    AGENT_SKILLS_EXTENSION_FIELDS, AGENT_SKILLS_FIELDS, FieldNaming, FrontmatterDialect, RuntimeId,
    ToolRegistry,
};

// ── The model ───────────────────────────────────────────────────────────

/// What one runtime does with one concept.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Support {
    /// Accepted as authored, under the same name.
    Native,
    /// Accepted, but under a different name or shape —
    /// [`Claim::harness_spelling`] carries the name it arrives under.
    Translated,
    /// Dropped. Nothing is delivered and nothing fails.
    Ignored,
    /// Refused. Nothing is produced for this runtime at all, so a caller
    /// that asked for it gets a refusal rather than a silent no-op.
    Rejected,
}

impl Support {
    /// Whether the concept is delivered: [`Support::Native`] or
    /// [`Support::Translated`].
    pub fn is_carried(self) -> bool {
        matches!(self, Support::Native | Support::Translated)
    }

    /// The wire spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            Support::Native => "native",
            Support::Translated => "translated",
            Support::Ignored => "ignored",
            Support::Rejected => "rejected",
        }
    }
}

/// Where a seeded claim was read, and when.
///
/// Harness documentation changes weekly and most of it carries no version
/// number, so a claim without a date is a claim with no shelf life.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Evidence {
    /// The page the claim was read from — a URL, or a repo-relative path
    /// when the observation is recorded in this repository.
    pub url: &'static str,
    /// ISO date the page was read.
    pub observed_on: &'static str,
    /// The product or specification version the reading is pinned to, or
    /// the reason there is none. Never empty: "no version" is itself a fact
    /// about the source and is spelled out.
    pub version: &'static str,
}

/// One runtime's answer about one concept.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Claim {
    /// The verdict.
    pub support: Support,
    /// What the concept is called in this runtime's own vocabulary, when it
    /// has a name of its own. Independent of [`Claim::support`], which alone
    /// says whether it is delivered: a [`Support::Translated`] claim's
    /// spelling is what arrives, an [`Support::Ignored`] claim's is the
    /// nearest equivalent this crate does not reach.
    pub harness_spelling: Option<String>,
    /// What the verdict does not say on its own — most often the gap between
    /// what this crate writes and what the harness reads.
    pub note: Option<&'static str>,
    /// The item in this crate that decides the verdict, for a derived claim.
    pub derived_from: Option<&'static str>,
    /// Where a seeded verdict was read. The two coexist where a derived
    /// verdict has a sourced caveat beside it.
    pub evidence: Option<Evidence>,
}

impl Claim {
    /// A claim this crate's own code decides, citing the item that decides it.
    pub fn derived(support: Support, derived_from: &'static str) -> Self {
        Self {
            support,
            harness_spelling: None,
            note: None,
            derived_from: Some(derived_from),
            evidence: None,
        }
    }

    /// A claim read from documentation, citing where.
    pub fn observed(support: Support, evidence: Evidence) -> Self {
        Self {
            support,
            harness_spelling: None,
            note: None,
            derived_from: None,
            evidence: Some(evidence),
        }
    }

    /// Name the runtime's own spelling for the concept.
    pub fn with_spelling(mut self, spelling: &str) -> Self {
        self.harness_spelling = Some(spelling.to_owned());
        self
    }

    /// Qualify the verdict.
    pub fn with_note(mut self, note: &'static str) -> Self {
        self.note = Some(note);
        self
    }

    /// Source the verdict, or a caveat on a derived one.
    pub fn with_evidence(mut self, evidence: Evidence) -> Self {
        self.evidence = Some(evidence);
        self
    }
}

/// An asset type this crate renders.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum AssetKind {
    /// A `SKILL.md` and its peer resources.
    Skill,
    /// An agent persona.
    Agent,
    /// A slash command.
    Command,
    /// A lifecycle hook.
    Hook,
    /// An MCP server entry.
    McpServer,
    /// A standalone script.
    Script,
}

impl AssetKind {
    /// Every variant, in declaration order.
    pub const ALL: &'static [AssetKind] = &[
        AssetKind::Skill,
        AssetKind::Agent,
        AssetKind::Command,
        AssetKind::Hook,
        AssetKind::McpServer,
        AssetKind::Script,
    ];

    /// The wire spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            AssetKind::Skill => "skill",
            AssetKind::Agent => "agent",
            AssetKind::Command => "command",
            AssetKind::Hook => "hook",
            AssetKind::McpServer => "mcp-server",
            AssetKind::Script => "script",
        }
    }

    /// The inverse of [`AssetKind::as_str`].
    pub fn from_key(key: &str) -> Option<Self> {
        AssetKind::ALL.iter().copied().find(|k| k.as_str() == key)
    }
}

/// Everything one runtime declares about itself.
///
/// Keyed by concept, never by position: a consumer asking "what does this
/// runtime do with the `model` field" reads `declaration.fields["model"]`.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct RuntimeCapabilities {
    /// Whose declaration this is.
    pub runtime: RuntimeId,
    /// One claim per [`AssetKind`].
    pub assets: BTreeMap<AssetKind, Claim>,
    /// One claim per canonical snake_case frontmatter field.
    pub fields: BTreeMap<String, Claim>,
    /// One claim per canonical tool name.
    pub tools: BTreeMap<String, Claim>,
    /// One claim per permission concept.
    pub permissions: BTreeMap<String, Claim>,
    /// One claim per canonical hook event name.
    pub hook_events: BTreeMap<String, Claim>,
    /// One claim per key a per-target override block may name for this
    /// runtime, spelled the way this harness spells it.
    ///
    /// The one map keyed by the *harness's* vocabulary rather than by a
    /// runtime-independent concept, which is why it has no [`Concept`] row
    /// and no column in [`matrix`]: `permissionMode` is a fact about Claude
    /// Code and means nothing to ask another runtime about.
    ///
    /// It is the whole oracle for "does this harness know this key" — an
    /// `ap-overrides` key absent from it is refused, naming the target and
    /// the key. See `override_keys` for how a declaration assembles one.
    pub overrides: BTreeMap<String, Claim>,
    /// One claim per [`BEHAVIOURS`] key: what the harness does with a hook's
    /// output, rather than which events it fires.
    pub behaviours: BTreeMap<String, Claim>,
}

impl RuntimeCapabilities {
    /// An empty declaration for `runtime`: every map is empty. A custom
    /// runtime fills the maps it has claims for.
    pub fn new(runtime: RuntimeId) -> Self {
        Self {
            runtime,
            assets: BTreeMap::new(),
            fields: BTreeMap::new(),
            tools: BTreeMap::new(),
            permissions: BTreeMap::new(),
            hook_events: BTreeMap::new(),
            overrides: BTreeMap::new(),
            behaviours: BTreeMap::new(),
        }
    }

    /// This runtime's claim about one concept, whatever kind it is — the
    /// generic form of indexing the typed map directly.
    pub fn claim(&self, kind: ConceptKind, key: &str) -> Option<&Claim> {
        match kind {
            ConceptKind::Asset => AssetKind::from_key(key).and_then(|k| self.assets.get(&k)),
            ConceptKind::Field => self.fields.get(key),
            ConceptKind::Tool => self.tools.get(key),
            ConceptKind::Permission => self.permissions.get(key),
            ConceptKind::HookEvent => self.hook_events.get(key),
        }
    }
}

/// A runtime that says what it can do.
///
/// Implemented by every adapter in [`crate::runtimes`], including the ones
/// [`crate::runtimes::all`] omits.
pub trait DeclaresCapabilities {
    /// This runtime's whole declaration.
    fn capabilities(&self) -> RuntimeCapabilities;
}

// ── Concepts: what the subjects are, independent of any runtime ──────────

/// The grouping a [`Concept`] belongs to.
///
/// Open by design: plugin and marketplace manifests will want a `Container`
/// kind alongside these five.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConceptKind {
    /// An asset type, keyed by [`AssetKind::as_str`].
    Asset,
    /// A frontmatter field, keyed by its canonical snake_case name.
    Field,
    /// A canonical tool name from [`ToolRegistry`].
    Tool,
    /// A permission concept this crate does not model.
    Permission,
    /// A lifecycle event a hook can bind to.
    HookEvent,
}

impl ConceptKind {
    /// Every variant, in declaration order.
    pub const ALL: &'static [ConceptKind] = &[
        ConceptKind::Field,
        ConceptKind::Asset,
        ConceptKind::Tool,
        ConceptKind::Permission,
        ConceptKind::HookEvent,
    ];

    /// The wire spelling.
    pub fn as_str(self) -> &'static str {
        match self {
            ConceptKind::Asset => "asset",
            ConceptKind::Field => "field",
            ConceptKind::Tool => "tool",
            ConceptKind::Permission => "permission",
            ConceptKind::HookEvent => "hook-event",
        }
    }

    /// Human-readable heading, used by [`CapabilityMatrix::to_markdown`].
    pub fn title(self) -> &'static str {
        match self {
            ConceptKind::Asset => "Asset types",
            ConceptKind::Field => "Frontmatter fields",
            ConceptKind::Tool => "Tool names",
            ConceptKind::Permission => "Permission rules",
            ConceptKind::HookEvent => "Hook events",
        }
    }
}

/// One subject a runtime can make a [`Claim`] about, defined without
/// reference to any runtime.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Concept {
    /// Which grouping this belongs to.
    pub kind: ConceptKind,
    /// The key runtimes claim against.
    pub key: String,
    /// One line saying what the concept is.
    pub summary: String,
    /// A qualification that belongs to the concept rather than to any one
    /// runtime.
    pub note: Option<&'static str>,
    /// Where the concept itself is defined, when a document defines it.
    pub evidence: Option<Evidence>,
}

/// The permission vocabulary this crate reasons about, with what each means.
pub const PERMISSION_CONCEPTS: &[(&str, &str)] = &[
    ("allow", "run this without asking"),
    ("deny", "never run this"),
    ("ask", "prompt before running this"),
    ("mode", "the default that applies where no rule matches"),
];

/// Hook-output behaviours a declaration answers, with what each means.
pub const BEHAVIOURS: &[(&str, &str)] = &[(
    STOP_CONTINUE,
    "a `Stop` hook's output can keep the agent from ending its turn and hand it a follow-up",
)];

/// The [`BEHAVIOURS`] key for a `Stop` hook that keeps the agent working.
pub const STOP_CONTINUE: &str = "stop-continue";

/// A declaration's [`RuntimeCapabilities::behaviours`], one claim per
/// [`BEHAVIOURS`] entry.
pub(crate) fn behaviours(stop_continue: Claim) -> BTreeMap<String, Claim> {
    BTreeMap::from([(STOP_CONTINUE.to_owned(), stop_continue)])
}

/// Hook events Claude Code documents, in the order its reference lists
/// them — all 33. Every other harness's shared events keep this spelling;
/// [`CODEX_ONLY_HOOK_EVENTS`] is the event
/// only one other harness documents, with no Claude Code equivalent.
pub const CLAUDE_HOOK_EVENTS: &[(&str, &str)] = &[
    ("SessionStart", "when a session starts or resumes"),
    (
        "Setup",
        "when the harness runs `--init-only`, or `--init`/`--maintenance` in `-p` mode",
    ),
    (
        "UserPromptSubmit",
        "when the user submits a prompt, before it is processed",
    ),
    (
        "UserPromptExpansion",
        "when a typed command expands into a prompt, before it reaches the model",
    ),
    ("PreToolUse", "before a tool call executes"),
    (
        "PermissionRequest",
        "when a tool call needs a permission decision",
    ),
    ("PermissionDenied", "when auto mode denies a tool call"),
    ("PostToolUse", "after a tool call succeeds"),
    ("PostToolUseFailure", "after a tool call fails"),
    (
        "PostToolBatch",
        "after a batch of parallel tool calls resolves",
    ),
    ("Notification", "when the harness raises a notification"),
    (
        "MessageDisplay",
        "while assistant message text is displayed",
    ),
    ("SubagentStart", "when a subagent is spawned"),
    ("SubagentStop", "when a subagent finishes"),
    ("TaskCreated", "when a task is created"),
    ("TaskCompleted", "when a task is marked completed"),
    ("Stop", "when the agent finishes a turn"),
    ("StopFailure", "when a turn ends due to an API error"),
    (
        "TeammateIdle",
        "when an agent-team teammate is about to go idle",
    ),
    (
        "InstructionsLoaded",
        "when a CLAUDE.md or rules file loads into context",
    ),
    (
        "ConfigChange",
        "when a configuration file changes mid-session",
    ),
    ("CwdChanged", "when the working directory changes"),
    (
        "DirectoryAdded",
        "when a working directory is added mid-session",
    ),
    ("FileChanged", "when a watched file changes on disk"),
    ("WorktreeCreate", "when a worktree is created"),
    ("WorktreeRemove", "when a worktree is removed"),
    ("PreCompact", "before the transcript is compacted"),
    ("PostCompact", "after the transcript finishes compacting"),
    (
        "PreModelSwitch",
        "before the harness applies a model switch",
    ),
    ("PostModelSwitch", "after the session's model changes"),
    (
        "Elicitation",
        "when an MCP server requests user input during a tool call",
    ),
    (
        "ElicitationResult",
        "after the user responds to an MCP elicitation",
    ),
    ("SessionEnd", "when a session ends"),
];

/// The one hook event only Codex CLI documents, with no Claude Code
/// equivalent. Sourced from `CODEX_ONLY_HOOK_EVENT_VOCABULARY`.
pub const CODEX_ONLY_HOOK_EVENTS: &[(&str, &str)] = &[(
    "Interrupt",
    "when the user interrupts an active turn on the main thread",
)];

/// Every hook event concept, the union of every harness's vocabulary this
/// crate has surveyed: [`CLAUDE_HOOK_EVENTS`] plus the harness-only
/// extensions. Adapters iterate this whole list and answer every entry,
/// whether or not their own harness documents it.
pub fn hook_events() -> impl Iterator<Item = &'static (&'static str, &'static str)> {
    CLAUDE_HOOK_EVENTS
        .iter()
        .chain(CODEX_ONLY_HOOK_EVENTS.iter())
}

/// What `runtime` calls the canonical hook event `event`, or a refusal
/// naming both.
///
/// The one oracle for hook-event translation. It reads the runtime's own
/// declaration rather than a second table: a [`Support::Native`] or
/// [`Support::Translated`] claim delivers, under its
/// [`Claim::harness_spelling`] where it has one; [`Support::Ignored`] and
/// [`Support::Rejected`] do not, and the caller is told which event and
/// which target rather than having the hook dropped from the file.
///
/// [`crate::render::render_hooks_json`] calls this for every hook it
/// renders, so a `hooks.json` either carries the target's own event names
/// throughout or is not written at all.
///
/// # Errors
///
/// [`crate::Error::Validation`] — the runtime does not carry the event, or the
/// event is outside [`hook_events`] entirely.
pub fn hook_event_spelling(runtime: RuntimeId, event: &str) -> Result<String, crate::Error> {
    let declaration = runtimes::declaration_for(runtime);
    let Some(claim) = declaration.hook_events.get(event) else {
        return Err(crate::Error::Validation(format!(
            "`{event}` is not a hook event this crate has surveyed, so nothing can be said \
             about what {} does with it",
            runtime.as_str()
        )));
    };
    if claim.support.is_carried() {
        Ok(claim
            .harness_spelling
            .clone()
            .unwrap_or_else(|| event.to_owned()))
    } else {
        Err(crate::Error::Validation(format!(
            "{} does not carry the `{event}` hook event{}",
            runtime.as_str(),
            claim
                .note
                .map(|note| format!(": {note}"))
                .unwrap_or_default()
        )))
    }
}

/// Every concept a declaration can claim against, grouped by kind in
/// [`ConceptKind::ALL`] order.
pub fn concepts() -> Vec<Concept> {
    let mut out = Vec::new();

    for (field, is_spec) in AGENT_SKILLS_FIELDS
        .iter()
        .map(|f| (*f, true))
        .chain(AGENT_SKILLS_EXTENSION_FIELDS.iter().map(|f| (*f, false)))
    {
        out.push(Concept {
            kind: ConceptKind::Field,
            key: field.to_owned(),
            summary: if is_spec {
                "Agent Skills specification field".to_owned()
            } else {
                "Claude Code extension, outside the specification".to_owned()
            },
            note: None,
            evidence: is_spec.then_some(AGENT_SKILLS_SPEC),
        });
    }

    for kind in AssetKind::ALL {
        out.push(Concept {
            kind: ConceptKind::Asset,
            key: kind.as_str().to_owned(),
            summary: format!("does this crate render a {} for the runtime", kind.as_str()),
            note: Some(
                "a claim about this crate's renderers; whether the harness reads what they write is what the hook-event claims source",
            ),
            evidence: None,
        });
    }

    for tool in &ToolRegistry::default().tools {
        out.push(Concept {
            kind: ConceptKind::Tool,
            key: tool.canonical_name.clone(),
            summary: tool.description.clone(),
            note: None,
            evidence: None,
        });
    }

    for (concept, summary) in PERMISSION_CONCEPTS {
        out.push(Concept {
            kind: ConceptKind::Permission,
            key: (*concept).to_owned(),
            summary: (*summary).to_owned(),
            note: Some(
                "this crate models no permission vocabulary at all, so every claim here is an observation about the harness rather than about what `agent-adapt` writes",
            ),
            evidence: None,
        });
    }

    for (event, summary) in hook_events() {
        let owner_evidence = if CODEX_ONLY_HOOK_EVENTS.iter().any(|(e, _)| e == event) {
            CODEX_ONLY_HOOK_EVENT_VOCABULARY
        } else {
            HOOK_EVENT_VOCABULARY
        };
        out.push(Concept {
            kind: ConceptKind::HookEvent,
            key: (*event).to_owned(),
            summary: (*summary).to_owned(),
            note: Some(
                "the hooks renderers write a `native` or `translated` claim's spelling and refuse an event any other claim answers",
            ),
            evidence: Some(owner_evidence),
        });
    }

    out
}

// ── Evidence shared across adapters ─────────────────────────────────────

/// The date the live documentation pages cited in this crate were read.
pub(crate) const OBSERVED: &str = "2026-09-08";

/// The date the plugin-hooks survey read the hooks pages: Codex and Cursor
/// plugin hooks, and every harness's `Stop` output.
pub(crate) const HOOKS_OBSERVED: &str = "2026-10-05";

/// What [`Evidence::version`] says for a docs page that carries no version
/// of its own — most of them.
pub(crate) const UNVERSIONED: &str = "unversioned documentation page";

/// The date the harness pages behind the harness-only override keys were
/// read. Separate from [`OBSERVED`] because those three readings are their
/// own survey, and a later sweep of the live pages moves one date and not
/// the other.
pub(crate) const OVERRIDE_KEYS_OBSERVED: &str = "2026-09-07";

/// The specification the portable target renders to, and the definition of
/// every [`AGENT_SKILLS_FIELDS`] concept.
pub(crate) const AGENT_SKILLS_SPEC: Evidence = Evidence {
    url: "https://agentskills.io/specification",
    observed_on: OBSERVED,
    version: "the specification carries no version number",
};

/// The page that defines the canonical hook event names — Claude Code's,
/// which is the vocabulary this crate treats as canonical.
pub(crate) const HOOK_EVENT_VOCABULARY: Evidence = Evidence {
    url: "https://code.claude.com/docs/en/hooks",
    observed_on: OBSERVED,
    version: UNVERSIONED,
};

/// The page that defines [`CODEX_ONLY_HOOK_EVENTS`] — Codex CLI's own
/// `Interrupt` event, which Claude Code does not document.
pub(crate) const CODEX_ONLY_HOOK_EVENT_VOCABULARY: Evidence = Evidence {
    url: "https://learn.chatgpt.com/docs/hooks",
    observed_on: OBSERVED,
    version: UNVERSIONED,
};

/// The in-repo harness survey. Its own header dates the research and warns
/// that the field churns weekly, so it is cited with that date rather than
/// with the date this module was written.
pub(crate) const HARNESS_SURVEY: Evidence = Evidence {
    url: "solutions/agent-pants/docs/vault/reference/harness-comparison.md",
    observed_on: "2026-08-08",
    version: "surveyed 2026-08-08 from each vendor's official documentation",
};

// ── Shared derivation, for the half of a declaration the code decides ────

/// Field claims read from one dialect's own
/// [`FrontmatterDialect::omit_fields`]: an omitted field is
/// [`Support::Ignored`], every other is [`Support::Native`] under the
/// spelling the dialect's [`FieldNaming`] gives it.
pub(crate) fn derived_fields(dialect: &FrontmatterDialect) -> BTreeMap<String, Claim> {
    AGENT_SKILLS_FIELDS
        .iter()
        .chain(AGENT_SKILLS_EXTENSION_FIELDS.iter())
        .map(|field| {
            let omitted = dialect.omit_fields.contains(field);
            let claim = Claim::derived(
                if omitted {
                    Support::Ignored
                } else {
                    Support::Native
                },
                "runtime::FrontmatterDialect::omit_fields",
            );
            let claim = match (omitted, spell(field, dialect.field_naming)) {
                (false, spelled) if spelled != *field => claim.with_spelling(&spelled),
                _ => claim,
            };
            ((*field).to_owned(), claim)
        })
        .collect()
}

/// How a dialect spells a canonical snake_case field name.
///
/// Mirrors `render::FrontmatterBuilder::render_name`. Casing feeds
/// [`Claim::harness_spelling`] and never [`Claim::support`]: every dialect in
/// the crate is kebab, so treating casing as translation would mark the whole
/// vocabulary `translated` and say nothing.
fn spell(canonical: &str, naming: FieldNaming) -> String {
    match naming {
        FieldNaming::Snake => canonical.to_owned(),
        FieldNaming::Kebab => canonical.replace('_', "-"),
    }
}

/// Asset claims read from the six per-capability lookups in
/// [`crate::runtimes`], which are the crate's record of which adapter
/// implements which renderer trait.
///
/// A lookup answering `Some` is [`Support::Native`]; `None` is
/// [`Support::Rejected`], because a destination with no renderer refuses by
/// name rather than writing a file the harness never loads.
pub(crate) fn derived_assets(runtime: RuntimeId) -> BTreeMap<AssetKind, Claim> {
    AssetKind::ALL
        .iter()
        .map(|kind| {
            let (renders, source) = match kind {
                AssetKind::Skill => (
                    runtimes::skill_renderer_for(runtime).is_some(),
                    "runtimes::skill_renderer_for",
                ),
                AssetKind::Agent => (
                    runtimes::agent_renderer_for(runtime).is_some(),
                    "runtimes::agent_renderer_for",
                ),
                AssetKind::Command => (
                    runtimes::command_renderer_for(runtime).is_some(),
                    "runtimes::command_renderer_for",
                ),
                AssetKind::Hook => (
                    runtimes::hook_renderer_for(runtime).is_some(),
                    "runtimes::hook_renderer_for",
                ),
                AssetKind::McpServer => (
                    runtimes::mcp_renderer_for(runtime).is_some(),
                    "runtimes::mcp_renderer_for",
                ),
                AssetKind::Script => (
                    runtimes::script_renderer_for(runtime).is_some(),
                    "runtimes::script_renderer_for",
                ),
            };
            let support = if renders {
                Support::Native
            } else {
                Support::Rejected
            };
            (*kind, Claim::derived(support, source))
        })
        .collect()
}

/// Override-key claims read from one dialect: every field it renders, under
/// the spelling the harness reads it as.
///
/// A field the dialect omits contributes **nothing**. That is the point: the
/// harness does not read the key, so an override naming it would write a line
/// nobody loads, and a refusal that says so is more use than a silent write.
/// It is also what makes the `codex`/`argument-hint` case a refusal while the
/// `claude`/`allowed-tools` case is merely redundant.
pub(crate) fn derived_override_keys(dialect: &FrontmatterDialect) -> BTreeMap<String, Claim> {
    AGENT_SKILLS_FIELDS
        .iter()
        .chain(AGENT_SKILLS_EXTENSION_FIELDS.iter())
        .filter(|field| !dialect.omit_fields.contains(*field))
        .map(|field| {
            (
                spell(field, dialect.field_naming),
                Claim::derived(Support::Native, "runtime::FrontmatterDialect::omit_fields")
                    .with_note(
                        "a canonical field this dialect already renders, so an override on it is redundant unless the value differs",
                    ),
            )
        })
        .collect()
}

/// One runtime's whole override-key roster: what its dialect already renders,
/// plus the keys it reads that no canonical field maps onto.
///
/// `harness_only` is the half the code cannot derive — `permissionMode`,
/// `permission`, `policy.allow_implicit_invocation` — so every entry carries
/// its own [`Evidence`]. A harness-only key wins over a derived one of the
/// same name: the adapter's own reading of its documentation is the better
/// answer.
pub(crate) fn override_keys(
    dialect: &FrontmatterDialect,
    harness_only: impl IntoIterator<Item = (String, Claim)>,
) -> BTreeMap<String, Claim> {
    let mut out = derived_override_keys(dialect);
    out.extend(harness_only);
    out
}

/// One harness-only override key: the name the harness reads, a note saying
/// what it does there, and where that was read.
pub(crate) fn harness_key(key: &str, note: &'static str, evidence: Evidence) -> (String, Claim) {
    (
        key.to_owned(),
        Claim::observed(Support::Native, evidence)
            .with_spelling(key)
            .with_note(note),
    )
}

/// Tool claims read from one registry's
/// [`ToolRegistry::translate_tool_name`]: a name that comes back unchanged
/// is [`Support::Native`], a renamed one [`Support::Translated`] carrying the
/// runtime's own spelling.
pub(crate) fn derived_tools(
    registry: &ToolRegistry,
    runtime: RuntimeId,
) -> BTreeMap<String, Claim> {
    registry
        .tools
        .iter()
        .map(|tool| {
            let canonical = tool.canonical_name.as_str();
            let translated = registry.translate_tool_name(canonical, runtime);
            let claim = Claim::derived(
                if translated == canonical {
                    Support::Native
                } else {
                    Support::Translated
                },
                "tools::ToolRegistry::translate_tool_name",
            );
            let claim = if translated != canonical {
                claim.with_spelling(&translated)
            } else if tool.runtime_names.contains_key(&runtime) {
                claim
            } else {
                claim.with_note(
                    "the registry carries no spelling for this runtime, so the canonical name is written through unchanged",
                )
            };
            (canonical.to_owned(), claim)
        })
        .collect()
}

// ── Every declaration ───────────────────────────────────────────────────

/// Every runtime's declaration, in [`RuntimeId::ALL`] order.
pub fn all_declarations() -> Vec<RuntimeCapabilities> {
    RuntimeId::ALL
        .iter()
        .copied()
        .map(runtimes::declaration_for)
        .collect()
}

// ── The matrix: one view of the declarations ────────────────────────────

/// The declarations laid out as a table — one column per runtime, one row
/// per concept. Built by [`matrix`]; nothing about it is stored in the model.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapabilityMatrix {
    /// One column per declaration, in the order given to [`matrix`].
    pub columns: Vec<RuntimeId>,
    /// One row per concept, grouped by kind in [`ConceptKind::ALL`] order.
    pub rows: Vec<MatrixRow>,
}

/// One concept against every column.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MatrixRow {
    /// What this row is about.
    pub concept: Concept,
    /// One entry per column, `None` where that runtime declares nothing
    /// about the concept.
    pub claims: Vec<Option<Claim>>,
}

/// Lay declarations out against [`concepts`].
pub fn matrix(declarations: &[RuntimeCapabilities]) -> CapabilityMatrix {
    let columns: Vec<RuntimeId> = declarations.iter().map(|d| d.runtime).collect();
    let rows = concepts()
        .into_iter()
        .map(|concept| {
            let claims = declarations
                .iter()
                .map(|decl| decl.claim(concept.kind, &concept.key).cloned())
                .collect();
            MatrixRow { concept, claims }
        })
        .collect();
    CapabilityMatrix { columns, rows }
}

impl CapabilityMatrix {
    /// One row by kind and key.
    pub fn row(&self, kind: ConceptKind, key: &str) -> Option<&MatrixRow> {
        self.rows
            .iter()
            .find(|row| row.concept.kind == kind && row.concept.key == key)
    }

    /// Every row of one kind, in matrix order.
    pub fn of_kind(&self, kind: ConceptKind) -> impl Iterator<Item = &MatrixRow> {
        self.rows.iter().filter(move |row| row.concept.kind == kind)
    }

    /// The matrix as markdown — one table per concept kind.
    ///
    /// The readable form of the whole answer, and the artifact this module's
    /// test prints: a matrix nobody can read is a matrix nobody checks. A
    /// cell shows its support level, plus the runtime's own spelling in
    /// parentheses where that differs from the row key.
    pub fn to_markdown(&self) -> String {
        let mut out = String::from("# Harness capability matrix\n");
        for kind in ConceptKind::ALL.iter().copied() {
            let rows: Vec<&MatrixRow> = self.of_kind(kind).collect();
            if rows.is_empty() {
                continue;
            }
            out.push_str(&format!("\n## {}\n\n|  |", kind.title()));
            for id in &self.columns {
                out.push_str(&format!(" {} |", id.as_str()));
            }
            out.push_str("\n|---|");
            for _ in &self.columns {
                out.push_str("---|");
            }
            out.push('\n');
            for row in rows {
                out.push_str(&format!("| `{}` |", row.concept.key));
                for claim in &row.claims {
                    let text = match claim {
                        Some(claim) => match &claim.harness_spelling {
                            Some(spelling) if *spelling != row.concept.key => {
                                format!("{} (`{spelling}`)", claim.support.as_str())
                            }
                            _ => claim.support.as_str().to_owned(),
                        },
                        None => "—".to_owned(),
                    };
                    out.push_str(&format!(" {text} |"));
                }
                out.push('\n');
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_runtime_declares() {
        let declared: Vec<RuntimeId> = all_declarations().iter().map(|d| d.runtime).collect();
        for id in RuntimeId::ALL.iter().copied() {
            // Exhaustive on purpose: a new variant breaks this line until it
            // is given an arm, and the assertion until it declares.
            match id {
                RuntimeId::ClaudeCode
                | RuntimeId::Antigravity
                | RuntimeId::CodexCli
                | RuntimeId::OpenCode
                | RuntimeId::Amp
                | RuntimeId::Cursor
                | RuntimeId::GithubCopilot
                | RuntimeId::NpmPackage
                | RuntimeId::Portable
                | RuntimeId::Pi => {}
            }
            assert!(declared.contains(&id), "{id:?} declares no capabilities");
        }
        assert!(
            declared.contains(&RuntimeId::GithubCopilot),
            "the command-only runtime declares too"
        );
    }

    /// Every declaration answers every concept, so a consumer never has to
    /// treat a missing key as an implicit verdict.
    #[test]
    fn every_declaration_answers_every_concept() {
        for declaration in all_declarations() {
            for concept in concepts() {
                assert!(
                    declaration.claim(concept.kind, &concept.key).is_some(),
                    "{:?} declares nothing for {}/{}",
                    declaration.runtime,
                    concept.kind.as_str(),
                    concept.key
                );
            }
        }
    }

    /// Re-derive every derived claim from its original and compare. If
    /// someone hand-edits a field, asset or tool verdict, this fails.
    #[test]
    fn derived_claims_match_their_source() {
        let registry = ToolRegistry::default();
        for declaration in all_declarations() {
            let id = declaration.runtime;
            let runtime = runtimes::for_id(id).expect("every runtime resolves");

            assert_eq!(
                declaration.fields,
                derived_fields(runtime.frontmatter_dialect()),
                "{id:?} field claims"
            );
            for (field, claim) in &declaration.fields {
                let omitted = runtime
                    .frontmatter_dialect()
                    .omit_fields
                    .contains(&field.as_str());
                let expected = if omitted {
                    Support::Ignored
                } else {
                    Support::Native
                };
                assert_eq!(claim.support, expected, "{id:?} field {field}");
            }

            for (kind, claim) in &declaration.assets {
                let expected = derived_assets(id)[kind].support;
                assert_eq!(claim.support, expected, "{id:?} asset {}", kind.as_str());
                assert!(claim.derived_from.is_some());
            }

            assert_eq!(
                declaration.tools,
                derived_tools(&registry, id),
                "{id:?} tool claims"
            );
            for (tool, claim) in &declaration.tools {
                let translated = registry.translate_tool_name(tool, id);
                if translated == *tool {
                    assert_eq!(claim.support, Support::Native, "{id:?} tool {tool}");
                } else {
                    assert_eq!(claim.support, Support::Translated, "{id:?} tool {tool}");
                    assert_eq!(claim.harness_spelling.as_deref(), Some(translated.as_str()));
                }
            }
        }
    }

    /// Nothing in the two seeded groups may ship without a complete evidence
    /// record and a note.
    #[test]
    fn every_seeded_claim_carries_evidence() {
        for declaration in all_declarations() {
            let seeded = declaration
                .permissions
                .iter()
                .map(|(k, c)| ("permission", k, c))
                .chain(
                    declaration
                        .hook_events
                        .iter()
                        .map(|(k, c)| ("hook-event", k, c)),
                );
            let mut counted = 0;
            for (group, key, claim) in seeded {
                counted += 1;
                let evidence = claim.evidence.unwrap_or_else(|| {
                    panic!("{:?} {group} {key} has no evidence", declaration.runtime)
                });
                assert!(!evidence.url.is_empty(), "{group} {key} url");
                assert!(
                    !evidence.observed_on.is_empty(),
                    "{group} {key} observed_on"
                );
                assert!(!evidence.version.is_empty(), "{group} {key} version");
                assert!(claim.note.is_some(), "{group} {key} note");
            }
            assert_eq!(
                counted,
                PERMISSION_CONCEPTS.len() + hook_events().count(),
                "{:?} seeded claims",
                declaration.runtime
            );
        }
    }

    #[test]
    fn every_declaration_answers_every_behaviour_with_evidence() {
        for declaration in all_declarations() {
            assert_eq!(
                declaration.behaviours.len(),
                BEHAVIOURS.len(),
                "{:?}",
                declaration.runtime
            );
            for (key, _) in BEHAVIOURS {
                let claim = &declaration.behaviours[*key];
                assert!(claim.evidence.is_some(), "{:?} {key}", declaration.runtime);
                assert!(claim.note.is_some(), "{:?} {key}", declaration.runtime);
            }
        }
    }

    #[test]
    fn stop_continue_is_carried_where_a_hooks_file_reaches_the_stop_event() {
        for (runtime, carried) in [
            (RuntimeId::ClaudeCode, true),
            (RuntimeId::CodexCli, true),
            (RuntimeId::Cursor, true),
            (RuntimeId::Antigravity, false),
            (RuntimeId::Pi, false),
            (RuntimeId::OpenCode, false),
        ] {
            let support = runtimes::declaration_for(runtime).behaviours[STOP_CONTINUE].support;
            assert_eq!(support.is_carried(), carried, "{runtime:?}");
        }
    }

    /// The two answers the milestone's warning surfaces exist to give.
    ///
    /// "Claude-only" is the list's provenance, not a claim about every other
    /// harness: Cursor documents `disable-model-invocation` under that exact
    /// spelling and that exact meaning, so its dialect keeps the key and the
    /// claim is [`Support::Native`] there too. See
    /// [`crate::runtimes::cursor`]'s "Frontmatter".
    #[test]
    fn claude_only_fields_are_ignored_everywhere_else() {
        for declaration in all_declarations() {
            for field in AGENT_SKILLS_EXTENSION_FIELDS {
                let cursor_reads_it =
                    matches!(declaration.runtime, RuntimeId::Cursor | RuntimeId::Pi)
                        && *field == "disable_model_invocation";
                let expected = if declaration.runtime == RuntimeId::ClaudeCode || cursor_reads_it {
                    Support::Native
                } else {
                    Support::Ignored
                };
                assert_eq!(
                    declaration.fields[*field].support, expected,
                    "{field} for {:?}",
                    declaration.runtime
                );
            }
        }
    }

    #[test]
    fn copilot_takes_commands_and_refuses_the_rest() {
        let copilot = runtimes::declaration_for(RuntimeId::GithubCopilot);
        assert_eq!(copilot.assets[&AssetKind::Command].support, Support::Native);
        for kind in [
            AssetKind::Skill,
            AssetKind::Agent,
            AssetKind::Hook,
            AssetKind::McpServer,
            AssetKind::Script,
        ] {
            assert_eq!(
                copilot.assets[&kind].support,
                Support::Rejected,
                "{}",
                kind.as_str()
            );
        }
    }

    /// The gap the declarations exist to make visible: this crate renders a
    /// hooks file for OpenCode that OpenCode does not read.
    #[test]
    fn opencode_renders_a_hooks_file_no_opencode_event_reads() {
        let opencode = runtimes::declaration_for(RuntimeId::OpenCode);
        let hook = &opencode.assets[&AssetKind::Hook];
        assert_eq!(hook.support, Support::Native);
        assert!(hook.evidence.is_some(), "the caveat is sourced");
        for (event, claim) in &opencode.hook_events {
            assert_eq!(claim.support, Support::Ignored, "{event}");
        }
    }

    /// The registry is the union of every harness's documented hook events:
    /// Claude Code's 33 plus the event only Codex CLI documents. Pins the count so a future addition is a deliberate edit
    /// here, not a silent drop.
    #[test]
    fn hook_event_vocabulary_is_the_union_of_every_harness() {
        let keys: Vec<&str> = hook_events().map(|(event, _)| *event).collect();
        assert_eq!(CLAUDE_HOOK_EVENTS.len(), 33, "Claude Code's own events");
        assert_eq!(keys.len(), 34, "the union of every harness's events");
        for (event, _) in CODEX_ONLY_HOOK_EVENTS {
            assert!(keys.contains(event), "{event} missing from the union");
        }
    }

    /// The override roster is the oracle `ap-overrides` refuses against, so
    /// the three states it has to produce are pinned here by name.
    #[test]
    fn the_override_roster_answers_set_redundant_and_refused() {
        let claude = runtimes::declaration_for(RuntimeId::ClaudeCode).overrides;
        let codex = runtimes::declaration_for(RuntimeId::CodexCli).overrides;

        // `set` — a harness-only key, seeded from that harness's own docs.
        let mode = claude
            .get("permissionMode")
            .expect("claude declares permissionMode");
        assert_eq!(mode.support, Support::Native);
        assert!(mode.evidence.is_some(), "a seeded claim carries its source");

        // `redundant` — a canonical field this dialect already renders, so
        // an override on it is admitted and then compared.
        assert!(claude.contains_key("allowed-tools"));

        // `refused` — a field this dialect omits is not a key the harness
        // reads, so it is not in the roster at all.
        assert!(
            dialect_omits(RuntimeId::CodexCli, "argument_hint"),
            "the fixture depends on codex omitting it"
        );
        assert!(!codex.contains_key("argument-hint"));
        assert!(codex.contains_key("policy.allow_implicit_invocation"));
    }

    /// The portable target validates rather than loads, so its roster is the
    /// specification's six keys and nothing else.
    #[test]
    fn the_portable_override_roster_is_the_spec_field_set() {
        let portable = runtimes::declaration_for(RuntimeId::Portable).overrides;
        for field in AGENT_SKILLS_FIELDS {
            assert!(portable.contains_key(&field.replace('_', "-")), "{field}");
        }
        for field in AGENT_SKILLS_EXTENSION_FIELDS {
            assert!(!portable.contains_key(&field.replace('_', "-")), "{field}");
        }
    }

    fn dialect_omits(runtime: RuntimeId, field: &str) -> bool {
        runtimes::declaration_for(runtime).fields[field].support == Support::Ignored
    }

    /// The visible artifact. Printed so `cargo test -- --nocapture` hands a
    /// reviewer the whole matrix without a second tool.
    #[test]
    fn renders_as_a_markdown_table() {
        let matrix = matrix(&all_declarations());
        let markdown = matrix.to_markdown();
        println!("{markdown}");
        assert!(markdown.starts_with("# Harness capability matrix\n"));
        for kind in ConceptKind::ALL.iter().copied() {
            assert!(
                markdown.contains(&format!("## {}", kind.title())),
                "{kind:?} table"
            );
        }
        let rows = markdown.lines().filter(|l| l.starts_with("| `")).count();
        assert_eq!(rows, matrix.rows.len());
        assert!(markdown.contains("| `argument_hint` |"));
        assert!(markdown.contains("translated (`read_file`)"));
        // A spelling equal to the row key adds nothing and is left off.
        assert!(!markdown.contains("native (`PreToolUse`)"));
    }
}
