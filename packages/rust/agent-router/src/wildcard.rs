//! The wildcard `*/<tier>` (mirror of `wildcard.ts`) and the trait filter it
//! shares with a tier entry. A wildcard is the tier's category chain
//! ([`expand_chain`]), each candidate resolved as a reference.

use serde::Serialize;

use crate::chains::{ChainSkipReason, expand_chain, traits_miss};
use crate::reference::{Qualifiers, Ref, Tier, Trait, format_ref};
use crate::resolve::{ResolveContext, Resolved, resolve_ref};

/// Why a wildcard passed a candidate over: the chain's reason, or `unresolved` (an effort the tool lacks).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WildcardSkipReason {
    /// Not an agent model: an embedding or image-output model, or one without the `agent` trait.
    NotAgent,
    /// The model lacks a trait the wildcard asks for.
    MissingTrait,
    /// The candidate does not resolve (an effort the tool lacks).
    Unresolved,
}

impl From<ChainSkipReason> for WildcardSkipReason {
    fn from(r: ChainSkipReason) -> Self {
        match r {
            ChainSkipReason::NotAgent => Self::NotAgent,
            ChainSkipReason::MissingTrait => Self::MissingTrait,
        }
    }
}

/// A candidate a wildcard passed over: why, as a code, and what failed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WildcardSkip {
    /// The candidate reference, as text.
    pub text: String,
    /// Why the candidate was passed over.
    pub reason: WildcardSkipReason,
    /// What failed, in words.
    pub detail: String,
}

/// The result of expanding a wildcard: its resolved candidates in chain
/// order, and the candidates passed over.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct Expansion {
    /// The candidates, resolved, in chain order.
    pub entries: Vec<Resolved>,
    /// The candidates passed over: an embedding or non-agent model, a missing trait, an effort the tool lacks.
    pub skipped: Vec<WildcardSkip>,
}

/// Why `entry`'s model fails the `traits` filter, or `None` when it passes: the
/// model is looked up on the entry's tool, so a model the catalogue does not
/// know fails any filter.
pub fn entry_traits_miss(
    entry: &Resolved,
    traits: &[Trait],
    ctx: &ResolveContext,
) -> Option<String> {
    if traits.is_empty() {
        return None;
    }
    let found = entry
        .model
        .as_deref()
        .and_then(|m| ctx.catalogue.find_model(&entry.tool, m));
    traits_miss(found.map(|f| &f.model.row), traits)
}

/// Expand a wildcard (tool `*`, a tier, qualifiers, effort) into the tier's
/// category chain over the catalogue, keeping the tools in `known_tools` when
/// set. A tool's head (the model its tier maps to, pinned or generated) is the
/// candidate `<tool>/<tier>`; every later model is named. Each candidate keeps
/// the reference's `ctx` qualifier and effort. The chain passes over a model
/// that is `embedding`, an unasked image-output model, not `agent`, or fails
/// the trait filter (see `expand_chain` for the image-out rule); a candidate is also skipped when it
/// does not resolve (an effort the tool lacks). An empty result is the walk's
/// to skip.
pub fn expand_wildcard(r: &Ref, ctx: &ResolveContext) -> Expansion {
    let mut out = Expansion::default();
    let Some(tier) = r.model.as_deref().and_then(Tier::parse) else {
        return out;
    };
    let keep = |tool: &str| ctx.known_tools.is_none_or(|k| k.iter().any(|t| t == tool));
    let traits = r.qualifiers.as_ref().map_or(&[][..], |q| &q.traits[..]);
    let chain = expand_chain(tier, traits, ctx.catalogue);
    let candidate = |tool: &str, native: &str| -> Ref {
        let head = ctx.catalogue.tier_model(tool, tier).as_deref() == Some(native);
        Ref {
            tool: tool.to_string(),
            model: Some(if head {
                tier.as_str().to_string()
            } else {
                native.to_string()
            }),
            qualifiers: r
                .qualifiers
                .as_ref()
                .and_then(|q| q.ctx)
                .map(|c| Qualifiers {
                    ctx: Some(c),
                    traits: Vec::new(),
                }),
            effort: r.effort.clone(),
        }
    };
    for s in &chain.skipped {
        if !keep(&s.tool) {
            continue;
        }
        out.skipped.push(WildcardSkip {
            text: format_ref(&candidate(&s.tool, &s.native_name)),
            reason: s.reason.into(),
            detail: s.detail.clone(),
        });
    }
    for e in &chain.entries {
        if !keep(&e.tool) {
            continue;
        }
        let c = candidate(&e.tool, &e.native_name);
        match resolve_ref(&c, ctx) {
            Ok(resolved) => out.entries.push(resolved),
            Err(error) => out.skipped.push(WildcardSkip {
                text: format_ref(&c),
                reason: WildcardSkipReason::Unresolved,
                detail: error.message,
            }),
        }
    }
    out
}
