//! Resolving one reference against the catalogue (mirror of `resolve.ts`): the
//! reference is checked, a tier maps to the tool's model for it (a pin
//! included), and an effort one step off moves to an accepted level.

use serde::Serialize;

use crate::catalogue::CatalogueQuery;
use crate::effort::{EffortAdjustment, adjust_effort};
use crate::reference::{Ref, Tier, format_ref, is_wildcard};
use crate::validity::{
    CheckContext, ValidityErrorCode, ValiditySkipCode, ValidityWarningCode, check_ref,
};

/// How the model was found; a tier that `router.pins` sets is `pinned`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Origin {
    /// A tier mapped to the tool's model for it.
    Tier {
        /// The tier the reference named.
        tier: Tier,
        /// Set when `router.pins` sets the tool's model for the tier.
        #[serde(skip_serializing_if = "std::ops::Not::not")]
        pinned: bool,
    },
    /// A model named in the reference.
    Name {
        /// The name as written.
        name: String,
    },
    /// No model named: the tool's default.
    Default,
}

/// The catalogue check of a reference that did not fail it: `ok`, a `warning`
/// to surface, or a `skip` (the walk passes the entry over). `Validity` less its error.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Check {
    /// The reference passes.
    Ok,
    /// The reference stays, with a warning to surface.
    Warning {
        /// What the warning is about.
        code: ValidityWarningCode,
        /// A human-readable explanation.
        message: String,
    },
    /// The walk passes the entry over.
    Skip {
        /// Why the entry is passed over.
        code: ValiditySkipCode,
        /// A human-readable explanation.
        message: String,
    },
}

/// A reference resolved against the catalogue: the tool, the concrete model
/// (a tier made concrete), the effort to run with, and the catalogue check
/// that rode along.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Resolved {
    /// The tool id.
    pub tool: String,
    /// The concrete model; absent when the reference names none.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// The effort to run with: the one asked for, or the level `effort_adjusted` moved it to.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    /// Set when the asked-for effort is not accepted and moved one step.
    #[serde(rename = "effortAdjusted", skip_serializing_if = "Option::is_none")]
    pub effort_adjusted: Option<EffortAdjustment>,
    /// True when an effort was given but the catalogue declares no levels to check it against.
    #[serde(rename = "effortUnchecked")]
    pub effort_unchecked: bool,
    /// The context in tokens the entry runs with; [`resolve_ref`] leaves it unset and only the
    /// profile walk fills it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<u64>,
    /// True when a context was asked for but the catalogue knows no size for the model.
    #[serde(rename = "contextUnchecked")]
    pub context_unchecked: bool,
    /// `format_ref` of the original reference, with the effort as asked for.
    pub text: String,
    /// How the model was found.
    pub from: Origin,
    /// The catalogue check of the reference.
    pub check: Check,
}

/// What kind of failure a resolve reports: the validity errors, and a wildcard.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResolveErrorKind {
    /// A wildcard names no one tool: only a profile walk expands it.
    Wildcard,
    /// The tool is not a known tool.
    UnknownTool,
    /// The tool has no model for the tier.
    NoTierEntry,
    /// The tool does not serve the model's provider.
    ProviderNotServed,
    /// The tool serves the model's provider but does not offer the model.
    ModelNotOffered,
    /// The effort is more than one step from any level the tool and model accept.
    UnsupportedEffort,
    /// An effort that is not one of `EFFORT_LEVELS`.
    UnknownEffort,
    /// Only with `strict`: a model the catalogue does not know.
    UnknownModel,
}

impl From<ValidityErrorCode> for ResolveErrorKind {
    fn from(c: ValidityErrorCode) -> Self {
        match c {
            ValidityErrorCode::UnknownTool => Self::UnknownTool,
            ValidityErrorCode::NoTierEntry => Self::NoTierEntry,
            ValidityErrorCode::ProviderNotServed => Self::ProviderNotServed,
            ValidityErrorCode::ModelNotOffered => Self::ModelNotOffered,
            ValidityErrorCode::UnsupportedEffort => Self::UnsupportedEffort,
            ValidityErrorCode::UnknownEffort => Self::UnknownEffort,
            ValidityErrorCode::UnknownModel => Self::UnknownModel,
        }
    }
}

/// Why a reference does not resolve. `effort` and `supported` are set for
/// `unsupported-effort`, `hint` (the nearest valid reference) for the others that have one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ResolveError {
    /// What kind of failure.
    pub kind: ResolveErrorKind,
    /// The reference's tool.
    pub tool: String,
    /// The reference's model, when it names one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// A human-readable explanation.
    pub message: String,
    /// For `unsupported-effort`: the effort asked for.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    /// For `unsupported-effort`: the levels the tool and model accept.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supported: Option<Vec<String>>,
    /// The nearest valid reference, when the catalogue knows one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
}

/// What a reference resolves against.
#[derive(Clone, Copy)]
pub struct ResolveContext<'a> {
    /// The model catalogue: tiers map through it and every reference is checked against it.
    pub catalogue: &'a CatalogueQuery,
    /// A closed set of tool ids; a reference to any other tool is an `unknown-tool` error.
    pub known_tools: Option<&'a [String]>,
    /// `router.strict`: an unknown model is an error.
    pub strict: Option<bool>,
}

impl<'a> ResolveContext<'a> {
    /// A context over `catalogue`, with no closed tool set and `strict` unset.
    pub fn new(catalogue: &'a CatalogueQuery) -> Self {
        ResolveContext {
            catalogue,
            known_tools: None,
            strict: None,
        }
    }
}

/// Resolve a reference against the catalogue. The reference is checked first
/// ([`check_ref`]): an error fails the resolve, and a warning or skip rides on
/// `check`. Then a tier maps to the tool's model for it (a pin included), and
/// an effort one step off moves to the accepted level, recorded on
/// `effort_adjusted`. A wildcard is an error here: the profile walk expands it
/// first. Qualifiers ride on `text`; the walk applies them.
pub fn resolve_ref(r: &Ref, ctx: &ResolveContext) -> Result<Resolved, Box<ResolveError>> {
    if is_wildcard(r) {
        return Err(Box::new(ResolveError {
            kind: ResolveErrorKind::Wildcard,
            tool: r.tool.clone(),
            model: r.model.clone(),
            message: format!(
                "'{}' names every tool; only a profile walk expands it",
                format_ref(r)
            ),
            effort: None,
            supported: None,
            hint: None,
        }));
    }
    let catalogue = ctx.catalogue;
    let check = match check_ref(
        r,
        catalogue,
        &CheckContext {
            strict: ctx.strict,
            known_tools: ctx.known_tools,
        },
    ) {
        crate::validity::Validity::Error {
            code,
            message,
            hint,
            efforts,
        } => {
            let unsupported = code == ValidityErrorCode::UnsupportedEffort;
            return Err(Box::new(ResolveError {
                kind: code.into(),
                tool: r.tool.clone(),
                model: r.model.clone(),
                message,
                effort: unsupported.then(|| r.effort.clone().unwrap_or_default()),
                supported: unsupported.then(|| efforts.unwrap_or_default()),
                hint: if unsupported { None } else { hint },
            }));
        }
        crate::validity::Validity::Ok => Check::Ok,
        crate::validity::Validity::Warning { code, message } => Check::Warning { code, message },
        crate::validity::Validity::Skip { code, message } => Check::Skip { code, message },
    };

    let mut model: Option<String> = None;
    let mut from = Origin::Default;
    if let Some(m) = r.model.as_deref() {
        if let Some(tier) = Tier::parse(m) {
            // `check_ref` passed, so the tool has a model for the tier.
            model = catalogue.tier_model(&r.tool, tier);
            from = Origin::Tier {
                tier,
                pinned: catalogue.pinned(&r.tool, tier),
            };
        } else {
            model = Some(m.to_string());
            from = Origin::Name {
                name: m.to_string(),
            };
        }
    }
    let efforts = catalogue.efforts_for(&r.tool, model.as_deref());
    // `check_ref` passed, so a declared set accepts the effort or a neighbour of it.
    let moved = match (&r.effort, &efforts) {
        (Some(e), Some(levels)) => adjust_effort(e, levels),
        _ => None,
    };
    Ok(Resolved {
        tool: r.tool.clone(),
        model,
        effort: moved
            .as_ref()
            .map(|m| m.effort.clone())
            .or_else(|| r.effort.clone()),
        effort_adjusted: moved.and_then(|m| m.adjusted),
        effort_unchecked: r.effort.is_some() && efforts.is_none(),
        context: None,
        context_unchecked: false,
        text: format_ref(r),
        from,
        check,
    })
}
