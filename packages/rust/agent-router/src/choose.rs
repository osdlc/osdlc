//! The profile walk (mirror of `choose.ts`, without the author rule): every
//! entry of a profile is resolved and checked, then the walk takes the first
//! entry the caller's availability callback accepts. The trace text is the
//! TypeScript's, byte for byte, once the vectors strip what this walk does not
//! produce (`sameToolAsAuthor`, and the message of an `invalid-shape`). The
//! author-rule paths are not mirrored here; the vector harness
//! (`tests/fixtures.rs`) and the TypeScript emitter strip those fields, and
//! that stripping is what to revisit when the author rule lands.
//!
//! Not mirrored: the author rule (`authorRule`, `author`, `authorUnknown`, its
//! steps 1 to 4 and the `wait` and `person` outcomes), which only PR review
//! uses. [`ProfileSkipReason::AuthorTool`] stays in the set so the reason codes
//! equal the TypeScript's; this walk never produces it.

use serde::Serialize;

use crate::context::{ContextCheck, check_context, format_size};
use crate::effort::effort_adjusted_message;
use crate::profile::Profile;
use crate::reference::{
    Ref, Tier, format_ref, is_effort_level, is_wildcard, unknown_effort_message,
};
use crate::resolve::{Check, Origin, ResolveContext, ResolveError, Resolved, resolve_ref};
use crate::validity::ValiditySkipCode;
use crate::wildcard::{WildcardSkipReason, entry_traits_miss, expand_wildcard};

/// Why an entry is unavailable: its tool is not installed or signed in, over
/// the usage budget, or cooling down after a rate limit; its local runtime is
/// unreachable or lacks the model; the launcher cannot launch it; it is on a
/// tool other than the one a session runs; or the tool may not run on an
/// untrusted fork's tree.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AvailabilityReason {
    /// The tool is not installed.
    NotInstalled,
    /// The tool is not signed in.
    NotSignedIn,
    /// The tool is over its usage budget.
    OverBudget,
    /// The tool is cooling down after a rate limit.
    CoolingDown,
    /// The local runtime is unreachable.
    ProviderUnreachable,
    /// The local runtime lacks the model.
    ModelNotPresent,
    /// The launcher cannot launch the entry.
    NotLaunchable,
    /// The entry is on a tool other than the one a session runs.
    OtherTool,
    /// The tool may not run on an untrusted fork's tree.
    UntrustedFork,
}

/// Every availability reason, in the TypeScript's order (`AVAILABILITY_REASONS`).
pub const AVAILABILITY_REASONS: &[AvailabilityReason] = &[
    AvailabilityReason::NotInstalled,
    AvailabilityReason::NotSignedIn,
    AvailabilityReason::OverBudget,
    AvailabilityReason::CoolingDown,
    AvailabilityReason::ProviderUnreachable,
    AvailabilityReason::ModelNotPresent,
    AvailabilityReason::NotLaunchable,
    AvailabilityReason::OtherTool,
    AvailabilityReason::UntrustedFork,
];

/// What the caller's callback answers for one resolved entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Availability {
    /// The entry is available.
    Ok,
    /// The entry is unavailable, and why.
    Unavailable {
        /// Why the entry is unavailable.
        reason: AvailabilityReason,
        /// What failed, for the trace; never a secret's value.
        detail: Option<String>,
    },
}

/// Every reason the walk passes an entry over: an availability reason, a
/// wildcard candidate's, a withdrawn model, a context the model cannot reach on
/// its tool, a wildcard that expands to nothing, and the author rule's step 1.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProfileSkipReason {
    /// The tool is not installed.
    NotInstalled,
    /// The tool is not signed in.
    NotSignedIn,
    /// The tool is over its usage budget.
    OverBudget,
    /// The tool is cooling down after a rate limit.
    CoolingDown,
    /// The local runtime is unreachable.
    ProviderUnreachable,
    /// The local runtime lacks the model.
    ModelNotPresent,
    /// The launcher cannot launch the entry.
    NotLaunchable,
    /// The entry is on a tool other than the one a session runs.
    OtherTool,
    /// The tool may not run on an untrusted fork's tree.
    UntrustedFork,
    /// A wildcard candidate that is not an agent model.
    NotAgent,
    /// A candidate that lacks a trait the entry asks for.
    MissingTrait,
    /// A wildcard candidate that does not resolve.
    Unresolved,
    /// The model is withdrawn.
    WithdrawnModel,
    /// The model cannot reach the entry's context on its tool.
    BelowContext,
    /// A wildcard that expands to nothing.
    NoCandidate,
    /// The author rule's step 1. Reserved: this walk has no author rule.
    AuthorTool,
}

/// Every skip reason, in the TypeScript's order (`PROFILE_SKIP_REASONS`).
pub const PROFILE_SKIP_REASONS: &[ProfileSkipReason] = &[
    ProfileSkipReason::NotInstalled,
    ProfileSkipReason::NotSignedIn,
    ProfileSkipReason::OverBudget,
    ProfileSkipReason::CoolingDown,
    ProfileSkipReason::ProviderUnreachable,
    ProfileSkipReason::ModelNotPresent,
    ProfileSkipReason::NotLaunchable,
    ProfileSkipReason::OtherTool,
    ProfileSkipReason::UntrustedFork,
    ProfileSkipReason::NotAgent,
    ProfileSkipReason::MissingTrait,
    ProfileSkipReason::Unresolved,
    ProfileSkipReason::WithdrawnModel,
    ProfileSkipReason::BelowContext,
    ProfileSkipReason::NoCandidate,
    ProfileSkipReason::AuthorTool,
];

impl ProfileSkipReason {
    /// The reason's code, as the trace and JSON spell it.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NotInstalled => "not-installed",
            Self::NotSignedIn => "not-signed-in",
            Self::OverBudget => "over-budget",
            Self::CoolingDown => "cooling-down",
            Self::ProviderUnreachable => "provider-unreachable",
            Self::ModelNotPresent => "model-not-present",
            Self::NotLaunchable => "not-launchable",
            Self::OtherTool => "other-tool",
            Self::UntrustedFork => "untrusted-fork",
            Self::NotAgent => "not-agent",
            Self::MissingTrait => "missing-trait",
            Self::Unresolved => "unresolved",
            Self::WithdrawnModel => "withdrawn-model",
            Self::BelowContext => "below-context",
            Self::NoCandidate => "no-candidate",
            Self::AuthorTool => "author-tool",
        }
    }

    /// The availability reason this is, for the nine the callback reports; `None` for the rest.
    /// The one place the availability subset is listed.
    pub fn availability(self) -> Option<AvailabilityReason> {
        Some(match self {
            Self::NotInstalled => AvailabilityReason::NotInstalled,
            Self::NotSignedIn => AvailabilityReason::NotSignedIn,
            Self::OverBudget => AvailabilityReason::OverBudget,
            Self::CoolingDown => AvailabilityReason::CoolingDown,
            Self::ProviderUnreachable => AvailabilityReason::ProviderUnreachable,
            Self::ModelNotPresent => AvailabilityReason::ModelNotPresent,
            Self::NotLaunchable => AvailabilityReason::NotLaunchable,
            Self::OtherTool => AvailabilityReason::OtherTool,
            Self::UntrustedFork => AvailabilityReason::UntrustedFork,
            _ => return None,
        })
    }

    /// Whether the reason is one of the [`AVAILABILITY_REASONS`].
    pub fn is_availability(self) -> bool {
        self.availability().is_some()
    }
}

impl From<AvailabilityReason> for ProfileSkipReason {
    fn from(r: AvailabilityReason) -> Self {
        match r {
            AvailabilityReason::NotInstalled => Self::NotInstalled,
            AvailabilityReason::NotSignedIn => Self::NotSignedIn,
            AvailabilityReason::OverBudget => Self::OverBudget,
            AvailabilityReason::CoolingDown => Self::CoolingDown,
            AvailabilityReason::ProviderUnreachable => Self::ProviderUnreachable,
            AvailabilityReason::ModelNotPresent => Self::ModelNotPresent,
            AvailabilityReason::NotLaunchable => Self::NotLaunchable,
            AvailabilityReason::OtherTool => Self::OtherTool,
            AvailabilityReason::UntrustedFork => Self::UntrustedFork,
        }
    }
}

impl From<WildcardSkipReason> for ProfileSkipReason {
    fn from(r: WildcardSkipReason) -> Self {
        match r {
            WildcardSkipReason::NotAgent => Self::NotAgent,
            WildcardSkipReason::MissingTrait => Self::MissingTrait,
            WildcardSkipReason::Unresolved => Self::Unresolved,
        }
    }
}

impl From<ValiditySkipCode> for ProfileSkipReason {
    fn from(c: ValiditySkipCode) -> Self {
        match c {
            ValiditySkipCode::WithdrawnModel => Self::WithdrawnModel,
        }
    }
}

/// What the entries resolve against, plus the walk's input: the availability callback.
pub struct ChooseContext<'a> {
    /// The catalogue, known tools and strictness the entries resolve against.
    pub resolve: ResolveContext<'a>,
    /// Asked per entry, with the entry's resolved `context`. It answers availability only; context
    /// skips come from the walk.
    pub is_available: &'a dyn Fn(&Resolved) -> Availability,
}

/// One reason a profile cannot be used. `entry` is the offending text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProfileEntryError {
    /// The offending entry's text.
    pub entry: String,
    /// What is wrong with it.
    pub message: String,
    /// Present when the entry failed to resolve.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Box<ResolveError>>,
}

/// An entry the walk passed over, and why. `ref` is the entry's text (a
/// wildcard's candidate, or the wildcard itself when it expands to nothing);
/// `detail` is what failed, when known.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProfileSkip {
    /// The entry's text: a wildcard's candidate, or the wildcard itself when it expands to nothing.
    #[serde(rename = "ref")]
    pub ref_: String,
    /// The reason, as a code.
    pub reason: ProfileSkipReason,
    /// What failed, when known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// A skip's reason as one line: `unavailable (cooling-down)` or
/// `unavailable (not-launchable: <detail>)` for an availability reason,
/// `below context: <detail>`, `wildcard expands to no candidate`, else the
/// detail (a withdrawn model, a wildcard candidate's), else the code. `BelowContext`
/// without a detail reads `too small`. `AuthorTool` reads `author's tool`, but this
/// walk never produces it; its arm is only for reason-set parity.
pub fn skip_reason_text(reason: ProfileSkipReason, detail: Option<&str>) -> String {
    match reason {
        ProfileSkipReason::AuthorTool => "author's tool".to_string(),
        ProfileSkipReason::NoCandidate => "wildcard expands to no candidate".to_string(),
        r if r.is_availability() => format!(
            "unavailable ({})",
            match detail {
                None => r.as_str().to_string(),
                Some(d) => format!("{}: {d}", r.as_str()),
            }
        ),
        ProfileSkipReason::BelowContext => {
            format!("below context: {}", detail.unwrap_or("too small"))
        }
        r => detail.unwrap_or(r.as_str()).to_string(),
    }
}

/// What [`choose_from_profile`] decided. Every kind carries the `skipped`
/// entries, a `trace` with a line per entry considered, and a one-line `summary`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Choice {
    /// The entry to run.
    Chosen {
        /// The chosen entry, resolved.
        resolved: Box<Resolved>,
        /// Set when no entry was usable except cooling ones and the first of those was taken anyway.
        #[serde(rename = "allCooling", skip_serializing_if = "std::ops::Not::not")]
        all_cooling: bool,
        /// The catalogue's warnings about the chosen entry: an unknown or deprecated
        /// model, an effort moved one step, a context it cannot check.
        warnings: Vec<String>,
        /// The entries passed over, and why.
        skipped: Vec<ProfileSkip>,
        /// A line per entry considered.
        trace: Vec<String>,
        /// The decision in one line.
        summary: String,
    },
    /// Nothing was available.
    None {
        /// The entries passed over, and why.
        skipped: Vec<ProfileSkip>,
        /// A line per entry considered.
        trace: Vec<String>,
        /// The decision in one line.
        summary: String,
    },
    /// The profile holds entries the catalogue refuses.
    Invalid {
        /// Why each refused entry cannot be used.
        errors: Vec<ProfileEntryError>,
        /// The entries passed over, and why.
        skipped: Vec<ProfileSkip>,
        /// A line per entry considered.
        trace: Vec<String>,
        /// The decision in one line.
        summary: String,
    },
}

/// The warning for an effort the catalogue cannot check, when `r` has one.
fn effort_warning(r: &Resolved) -> Option<String> {
    let effort = r.effort.as_deref().filter(|_| r.effort_unchecked)?;
    let on = match &r.model {
        None => format!("'{}'", r.tool),
        Some(m) => format!("'{m}' on '{}'", r.tool),
    };
    Some(format!(
        "effort '{effort}' is not checked: the catalogue declares no effort levels for {on}"
    ))
}

fn context_warning(r: &Resolved) -> String {
    format!(
        "context{} is not checked: the catalogue knows no context size for the model",
        r.context
            .map_or(String::new(), |c| format!(" {}", format_size(c)))
    )
}

/// A resolved entry ready for the walk; `skip` says why the walk passes it over.
struct Prepared {
    entry: Resolved,
    skip: Option<(ProfileSkipReason, String)>,
}

#[derive(Default)]
struct Prep {
    entries: Vec<Prepared>,
    errors: Vec<ProfileEntryError>,
    skipped: Vec<ProfileSkip>,
    trace: Vec<String>,
}

/// One resolved entry of `r` (a wildcard's candidate, or the entry itself): the
/// context check, the traced notes, and the tier entry's trait filter.
fn add(r: &Ref, entry: Resolved, profile: &Profile, ctx: &ResolveContext, prep: &mut Prep) {
    let checked = check_context(
        &entry.tool,
        entry.model.as_deref(),
        r.qualifiers.as_ref().and_then(|q| q.ctx),
        profile.context,
        ctx.catalogue,
    );
    // A wildcard asks for any model that reaches its `[ctx=]`: a candidate that cannot is skipped.
    let context = match checked {
        ContextCheck::Error { message } if is_wildcard(r) => ContextCheck::Skip { message },
        other => other,
    };
    if let ContextCheck::Error { message } = &context {
        prep.errors.push(ProfileEntryError {
            entry: entry.text.clone(),
            message: message.clone(),
            error: None,
        });
        prep.trace
            .push(format!("{}: invalid ({message})", entry.text));
        return;
    }
    if let Origin::Tier { tier, pinned: true } = &entry.from {
        prep.trace.push(format!(
            "{}: pinned: {}/{} is {}",
            entry.text,
            entry.tool,
            tier.as_str(),
            entry.model.as_deref().unwrap_or("undefined")
        ));
    }
    if let Check::Warning { message, .. } = &entry.check {
        prep.trace
            .push(format!("{}: warning: {message}", entry.text));
    }
    if let Some(adjusted) = &entry.effort_adjusted {
        prep.trace.push(format!(
            "{}: {}",
            entry.text,
            effort_adjusted_message(adjusted)
        ));
    }
    if let Some(warning) = effort_warning(&entry) {
        prep.trace
            .push(format!("{}: warning: {warning}", entry.text));
    }
    let (context_size, unchecked) = match context {
        ContextCheck::Skip { message } => {
            prep.entries.push(Prepared {
                entry,
                skip: Some((ProfileSkipReason::BelowContext, message)),
            });
            return;
        }
        ContextCheck::Ok { context, unchecked } => (context, unchecked),
        ContextCheck::Error { .. } => unreachable!("an error returned above"),
    };
    let ready = Resolved {
        context: context_size.or(entry.context),
        context_unchecked: unchecked,
        ..entry
    };
    if unchecked {
        prep.trace.push(format!(
            "{}: warning: {}",
            ready.text,
            context_warning(&ready)
        ));
    }
    let miss = match r.model.as_deref() {
        Some(m) if Tier::parse(m).is_some() => entry_traits_miss(
            &ready,
            r.qualifiers.as_ref().map_or(&[][..], |q| &q.traits[..]),
            ctx,
        ),
        _ => None,
    };
    prep.entries.push(Prepared {
        entry: ready,
        skip: miss.map(|d| (ProfileSkipReason::MissingTrait, d)),
    });
}

/// Resolve every entry of the profile in order, as the walk sees them: a
/// wildcard is expanded into its category chain and its passed-over candidates
/// and an empty expansion are skips; a tier entry's traits filter it; the
/// context requirement is checked, and a wildcard candidate that cannot reach
/// its `[ctx=]` is a skip, not an error; a pinned tier is traced. Errors make
/// the profile invalid; warnings are traced and the entry stays.
fn prepare_entries(profile: &Profile, ctx: &ResolveContext) -> Prep {
    let mut prep = Prep::default();
    for r in &profile.order {
        let text = format_ref(r);
        if is_wildcard(r) {
            if let Some(e) = r.effort.as_deref().filter(|e| !is_effort_level(e)) {
                // No candidate could take it; caught here, not passed over as each one's `unresolved`.
                let message = unknown_effort_message(e);
                prep.trace.push(format!("{text}: invalid ({message})"));
                prep.errors.push(ProfileEntryError {
                    entry: text,
                    message,
                    error: None,
                });
                continue;
            }
            let expansion = expand_wildcard(r, ctx);
            for s in &expansion.skipped {
                prep.skipped.push(ProfileSkip {
                    ref_: s.text.clone(),
                    reason: s.reason.into(),
                    detail: Some(s.detail.clone()),
                });
                prep.trace
                    .push(format!("{}: skipped: {} (from {text})", s.text, s.detail));
            }
            if expansion.entries.is_empty() {
                prep.skipped.push(ProfileSkip {
                    ref_: text.clone(),
                    reason: ProfileSkipReason::NoCandidate,
                    detail: None,
                });
                prep.trace.push(format!(
                    "{text}: skipped: {}",
                    skip_reason_text(ProfileSkipReason::NoCandidate, None)
                ));
                continue;
            }
            prep.trace.push(format!(
                "{text}: expands to {}",
                expansion
                    .entries
                    .iter()
                    .map(|e| e.text.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
            for entry in expansion.entries {
                add(r, entry, profile, ctx, &mut prep);
            }
            continue;
        }
        match resolve_ref(r, ctx) {
            Ok(entry) => add(r, entry, profile, ctx, &mut prep),
            Err(error) => {
                prep.errors.push(ProfileEntryError {
                    entry: text.clone(),
                    message: error.message.clone(),
                    error: Some(error.clone()),
                });
                prep.trace
                    .push(format!("{text}: invalid ({})", error.message));
            }
        }
    }
    prep
}

/// Resolve every entry of the profile (expanding wildcards); returns one error
/// per entry that does not resolve, that the catalogue refuses, or that asks for
/// more context than its model offers anywhere (empty when the profile is
/// usable). Warnings and skips are not errors. Never checks availability.
pub fn validate_profile(profile: &Profile, ctx: &ResolveContext) -> Vec<ProfileEntryError> {
    prepare_entries(profile, ctx).errors
}

/// The one-entry profile a single reference walks as: a `tool:` binding, or a
/// reference checked on its own.
pub fn ref_profile(r: Ref) -> Profile {
    Profile {
        order: vec![r],
        host: None,
        context: None,
    }
}

/// The walk's running record: one trace line per entry considered, the
/// structured skips, and for each skip the position of the prepared entry it
/// belongs to (`owners`, `None` for a wildcard's own skips). Two entries can
/// share a text (a duplicate, or a wildcard candidate and a plain entry), so a
/// skip is matched to its entry by position, never by text.
#[derive(Default)]
struct Walk {
    trace: Vec<String>,
    skipped: Vec<ProfileSkip>,
    owners: Vec<Option<usize>>,
}

impl Walk {
    /// Record a skip of the entry at `owner` (when it is a prepared entry) and its trace line.
    fn pass(&mut self, s: ProfileSkip, owner: Option<usize>) {
        self.trace.push(format!(
            "{}: skipped: {}",
            s.ref_,
            skip_reason_text(s.reason, s.detail.as_deref())
        ));
        self.skipped.push(s);
        self.owners.push(owner);
    }

    /// A `chosen` result for `entry`, the prepared entry at `at`; its own
    /// earlier skips (cooling) are dropped from `skipped`.
    fn chosen(self, at: usize, entry: Resolved, summary: String, all_cooling: bool) -> Choice {
        let skipped = self
            .skipped
            .into_iter()
            .zip(self.owners)
            .filter(|(_, owner)| *owner != Some(at))
            .map(|(s, _)| s)
            .collect();
        Choice::Chosen {
            warnings: warnings_of(&entry),
            resolved: Box::new(entry),
            all_cooling,
            skipped,
            trace: self.trace,
            summary,
        }
    }
}

fn warnings_of(r: &Resolved) -> Vec<String> {
    let mut out = Vec::new();
    if let Check::Warning { message, .. } = &r.check {
        out.push(message.clone());
    }
    if let Some(a) = &r.effort_adjusted {
        out.push(effort_adjusted_message(a));
    }
    if let Some(warning) = effort_warning(r) {
        out.push(warning);
    }
    if r.context_unchecked {
        out.push(context_warning(r));
    }
    out
}

/// Walk the profile in order and pick the first usable entry.
///
/// Every entry is prepared first: resolved and checked against the catalogue,
/// wildcards expanded, the context requirement checked. Each check ends one of
/// three ways:
///
/// - An error makes the outcome `invalid`, and nothing is chosen: an unknown
///   tool, a reference the catalogue knows is impossible, a `[ctx=]` larger
///   than the model offers anywhere.
/// - A warning is traced, and the entry stays.
/// - A skip is traced, and the walk passes over the entry: a withdrawn model, a
///   context the model cannot reach on this tool, a tier entry's missing trait,
///   a wildcard that expands to nothing.
///
/// Cooldowns alone never return `none`. When no entry is available but some
/// were only cooling down, the first of those is taken and flagged
/// `all_cooling`. `none` means nothing was available or cooling.
///
/// The trace has one line per entry considered, and `summary` holds the closing
/// statement. `skipped` lists every entry passed over, with its reason. It never
/// holds the chosen entry's own skip; another entry's skip with the same text stays.
pub fn choose_from_profile(profile: &Profile, ctx: &ChooseContext) -> Choice {
    let prepared = prepare_entries(profile, &ctx.resolve);
    let owners = vec![None; prepared.skipped.len()];
    let mut walk = Walk {
        trace: prepared.trace,
        skipped: prepared.skipped,
        owners,
    };
    if !prepared.errors.is_empty() {
        let summary = format!(
            "invalid: {}",
            prepared
                .errors
                .iter()
                .map(|e| format!("{}: {}", e.entry, e.message))
                .collect::<Vec<_>>()
                .join("; ")
        );
        return Choice::Invalid {
            errors: prepared.errors,
            skipped: walk.skipped,
            trace: walk.trace,
            summary,
        };
    }

    // Entries that were usable but for a cooldown, in profile order.
    let mut cooling: Vec<(usize, Resolved)> = Vec::new();
    for (at, Prepared { entry, skip }) in prepared.entries.into_iter().enumerate() {
        if let Check::Skip { code, message } = &entry.check {
            walk.pass(
                ProfileSkip {
                    ref_: entry.text.clone(),
                    reason: (*code).into(),
                    detail: Some(message.clone()),
                },
                Some(at),
            );
            continue;
        }
        if let Some((reason, detail)) = skip {
            walk.pass(
                ProfileSkip {
                    ref_: entry.text.clone(),
                    reason,
                    detail: Some(detail),
                },
                Some(at),
            );
            continue;
        }
        match (ctx.is_available)(&entry) {
            Availability::Ok => {
                walk.trace.push(format!("{}: taken", entry.text));
                let summary = format!("chosen: {}", entry.text);
                return walk.chosen(at, entry, summary, false);
            }
            Availability::Unavailable { reason, detail } => {
                if reason == AvailabilityReason::CoolingDown {
                    cooling.push((at, entry.clone()));
                }
                walk.pass(
                    ProfileSkip {
                        ref_: entry.text,
                        reason: reason.into(),
                        detail,
                    },
                    Some(at),
                );
            }
        }
    }

    // Nothing available: a cooldown alone must not return `none`.
    if let Some((at, first)) = cooling.first().cloned() {
        walk.trace.push(format!(
            "{}: taken: no entry is available and {} cooling down",
            first.text,
            cooling.len()
        ));
        let summary = format!(
            "chosen: {} (all usable entries are cooling down; first one tried anyway)",
            first.text
        );
        return walk.chosen(at, first, summary, true);
    }
    Choice::None {
        skipped: walk.skipped,
        trace: walk.trace,
        summary: "none: no entry is usable".to_string(),
    }
}
