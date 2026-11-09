//! Category chains and pins (mirror of `chains.ts`): a tier, narrowed by
//! traits, expanded into an ordered list of models across tools. The
//! tier-per-tool mapping is the head of each tool's chain.

use std::cmp::Ordering;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::catalogue::{CatalogueQuery, Model, Sourced};
use crate::reference::{Tier, Trait};

/// Tool order in a chain when `router.chains.order` does not set one.
pub const DEFAULT_CHAIN_ORDER: &[&str] =
    &["claude", "codex", "cursor", "antigravity", "pi", "opencode"];

/// `router.pins`: `tool/tier` to the name the tool is handed, held through refreshes.
pub type Pins = IndexMap<String, String>;

/// The pin key for `tool` and `tier`, `tool/tier`.
pub fn pin_key(tool: &str, tier: Tier) -> String {
    format!("{tool}/{}", tier.as_str())
}

/// One candidate of a chain: a model on a tool, with the name the tool is handed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChainEntry {
    /// The tool id.
    pub tool: String,
    /// The tier the entry stands in.
    pub tier: Tier,
    /// The name the tool is handed.
    pub native_name: String,
    /// The model's catalogue key; absent for a pin the catalogue does not know.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Set when `router.pins` put this entry at the head of its tool.
    pub pinned: bool,
}

/// Why the chain passed a model over: it is not an agent model, or it lacks a
/// trait. See `expand_chain` for the image-out rule.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ChainSkipReason {
    /// Not an agent model: an embedding or image-output model, or one without the `agent` trait.
    NotAgent,
    /// The model lacks a trait the chain asks for.
    MissingTrait,
}

/// A model of the tier the chain passed over: why, as a code, and what failed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChainSkip {
    /// The tool id.
    pub tool: String,
    /// The name the tool would be handed.
    pub native_name: String,
    /// Why the model was passed over.
    pub reason: ChainSkipReason,
    /// What failed, in words.
    pub detail: String,
}

/// An expanded tier chain: the candidate `entries` in order, and the models
/// it `skipped` with the reason for each.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Chain {
    /// The candidates, in order.
    pub entries: Vec<ChainEntry>,
    /// The models passed over, with the reason for each.
    pub skipped: Vec<ChainSkip>,
}

/// Newest first, then larger context first; undated models last.
fn newest_first(a: &Model, b: &Model) -> Ordering {
    let da = a.release_date.as_deref().unwrap_or("");
    let db = b.release_date.as_deref().unwrap_or("");
    let size = |m: &Model| {
        m.context
            .as_ref()
            .and_then(|c| c.max.or(c.default))
            .unwrap_or(0)
    };
    // Later date first (an empty date sorts last), then larger context first.
    db.cmp(da).then_with(|| size(b).cmp(&size(a)))
}

/// Why `model` fails the `traits` filter, or `None` when it passes. A model
/// the catalogue does not know carries no traits, so it fails any filter.
pub fn traits_miss(model: Option<&Model>, traits: &[Trait]) -> Option<String> {
    if traits.is_empty() {
        return None;
    }
    let names = |ts: &[&Trait]| ts.iter().map(|t| t.as_str()).collect::<Vec<_>>().join(", ");
    let Some(model) = model else {
        let all: Vec<&Trait> = traits.iter().collect();
        return Some(format!(
            "traits {} cannot be checked: the catalogue does not know the model",
            names(&all)
        ));
    };
    let missing: Vec<&Trait> = traits.iter().filter(|t| !model.has_trait(**t)).collect();
    if missing.is_empty() {
        None
    } else {
        Some(format!("model {} lacks {}", model.key, names(&missing)))
    }
}

/// True when `m` is an image-output model and the entry did not ask for `image-out`.
fn image_out_unasked(m: &Model, traits: &[Trait]) -> bool {
    m.has_trait(Trait::ImageOut) && !traits.contains(&Trait::ImageOut)
}

fn chain_miss(model: Option<&Model>, traits: &[Trait]) -> Option<(ChainSkipReason, String)> {
    if let Some(m) = model {
        if m.has_trait(Trait::Embedding) {
            return Some((
                ChainSkipReason::NotAgent,
                format!("{} is an embedding model", m.key),
            ));
        }
        // See `expand_chain` for the image-out rule.
        if image_out_unasked(m, traits) {
            return Some((
                ChainSkipReason::NotAgent,
                format!("{} is an image-output model", m.key),
            ));
        }
        if !(m.has_trait(Trait::Agent) || m.has_trait(Trait::ImageOut)) {
            return Some((
                ChainSkipReason::NotAgent,
                format!("{} is not an agent model", m.key),
            ));
        }
    }
    traits_miss(model, traits).map(|d| (ChainSkipReason::MissingTrait, d))
}

/// The `tier` chain: tools in the query's chain order (tools it leaves out
/// follow in catalogue order), and within one tool the current models the
/// classifier places in `tier`, newest first, then larger context first. A pin
/// for `tool/tier` heads that tool's run, flagged `pinned`, and the same model
/// is not repeated. Only `agent` models (or, when `traits` holds `image-out`,
/// image-output models) that carry every one of `traits` stay; the others are
/// returned in `skipped` with the reason. A tier's image-output models are
/// dropped silently unless `traits` asks for `image-out`: they would add a row
/// to every wildcard. An unclassified, deprecated or withdrawn model appears
/// only when a pin names it; a pin the catalogue does not know stays unless
/// `traits` asks for something it cannot check.
pub fn expand_chain(tier: Tier, traits: &[Trait], catalogue: &CatalogueQuery) -> Chain {
    let mut out = Chain::default();
    let known = catalogue.known_tools();
    let order = catalogue.chain_order();
    let tools: Vec<&str> = order
        .iter()
        .map(String::as_str)
        .filter(|t| known.contains(t))
        .chain(
            known
                .iter()
                .copied()
                .filter(|t| !order.iter().any(|o| o == t)),
        )
        .collect();
    for tool in tools {
        let mut run: Vec<(String, Option<&Sourced<Model>>, bool)> = Vec::new();
        let pin = catalogue.pins().get(&pin_key(tool, tier));
        let pinned_model = pin
            .and_then(|p| catalogue.find_model(tool, p))
            .map(|f| f.model);
        if let Some(p) = pin {
            run.push((p.clone(), pinned_model, true));
        }
        let mut placed: Vec<&Sourced<Model>> = catalogue
            .models_for(tool)
            .into_iter()
            .filter(|m| {
                m.status == crate::catalogue::ModelStatus::Current
                    && catalogue.tier_of(&m.key) == tier.into()
                    && Some(&m.key) != pinned_model.map(|p| &p.key)
            })
            .collect();
        placed.sort_by(|a, b| newest_first(a, b));
        for m in placed {
            let name = catalogue
                .offering(tool, &m.key)
                .map_or_else(|| m.id.clone(), |o| o.native_name.clone());
            run.push((name, Some(m), false));
        }
        for (native_name, model, pinned) in run {
            if !pinned && model.is_some_and(|m| image_out_unasked(&m.row, traits)) {
                continue;
            }
            if let Some((reason, detail)) = chain_miss(model.map(|m| &m.row), traits) {
                out.skipped.push(ChainSkip {
                    tool: tool.to_string(),
                    native_name,
                    reason,
                    detail,
                });
                continue;
            }
            out.entries.push(ChainEntry {
                tool: tool.to_string(),
                tier,
                native_name,
                model: model.map(|m| m.key.clone()),
                pinned,
            });
        }
    }
    out
}
