//! The query API over one merged catalogue and a mapping policy (mirror of
//! `catalogue/query.ts`). Offerings and the classifier's placements are
//! derived once, in [`query_catalogue`].

use std::sync::OnceLock;

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use super::offerings::derive_offerings;
use super::types::{Catalogue, Model, Offering, Sourced, Table, Tool};
use crate::chains::{Chain, DEFAULT_CHAIN_ORDER, Pins, expand_chain, pin_key};
use crate::classify::{ClassifyRule, Placement, builtin_classify_rules, classify};
use crate::reference::{TIERS, Tier};

/// The model `name` means on a tool, and the offering that gives it.
#[derive(Debug, Clone, Copy)]
pub struct FoundModel<'a> {
    /// The catalogue row of the model.
    pub model: &'a Sourced<Model>,
    /// The tool's offering of the model.
    pub offering: &'a Offering,
}

/// The mapping table's policy over a catalogue (decision D-06): `classify`,
/// rules tried before the shipped ones; `order`, the chain's tool order
/// (default [`DEFAULT_CHAIN_ORDER`]); `pins`, `tool/tier` to a name.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MappingPolicy {
    /// Classifier rules tried before the shipped ones.
    #[serde(default)]
    pub classify: Vec<ClassifyRule>,
    /// The chain's tool order; [`DEFAULT_CHAIN_ORDER`] when absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<Vec<String>>,
    /// `tool/tier` to the name that tier means on that tool.
    #[serde(default)]
    pub pins: Pins,
}

/// Lookups over one merged catalogue and its mapping policy: tools, models,
/// offerings, tier placement and effort levels. Build one with [`query_catalogue`].
pub struct CatalogueQuery {
    catalogue: Catalogue,
    offerings: Vec<Offering>,
    placements: Table<Placement>,
    pins: Pins,
    chain_order: Vec<String>,
    /// Indexes into `offerings`, per tool, in offering order.
    by_tool: IndexMap<String, Vec<usize>>,
    /// One chain per tier (the tier's chain with no trait filter), built on first use.
    chains: Vec<OnceLock<Chain>>,
}

/// A query over one merged catalogue and a mapping policy; offerings and the
/// classifier's placements are derived once, here.
pub fn query_catalogue(catalogue: Catalogue, policy: MappingPolicy) -> CatalogueQuery {
    let offerings = derive_offerings(&catalogue);
    let mut rules = policy.classify;
    rules.extend(builtin_classify_rules());
    let placements = classify(catalogue.models.values().map(|m| &m.row), &rules);
    let mut by_tool: IndexMap<String, Vec<usize>> = IndexMap::new();
    for (i, o) in offerings.iter().enumerate() {
        by_tool.entry(o.tool.clone()).or_default().push(i);
    }
    CatalogueQuery {
        catalogue,
        offerings,
        placements,
        pins: policy.pins,
        chain_order: policy
            .order
            .unwrap_or_else(|| DEFAULT_CHAIN_ORDER.iter().map(|s| s.to_string()).collect()),
        by_tool,
        chains: TIERS.iter().map(|_| OnceLock::new()).collect(),
    }
}

impl CatalogueQuery {
    /// The merged catalogue this query reads.
    pub fn catalogue(&self) -> &Catalogue {
        &self.catalogue
    }

    /// Every tool and model combination of the catalogue, derived once.
    pub fn offerings(&self) -> &[Offering] {
        &self.offerings
    }

    /// Every tool row, in catalogue order.
    pub fn tools(&self) -> Vec<&Sourced<Tool>> {
        self.catalogue.tools.values().collect()
    }

    /// The tool ids: the one tool list.
    pub fn known_tools(&self) -> Vec<&str> {
        self.catalogue.tools.keys().map(String::as_str).collect()
    }

    /// The tool row for `id`, or `None` when the catalogue lacks it.
    pub fn tool(&self, id: &str) -> Option<&Sourced<Tool>> {
        self.catalogue.tools.get(id)
    }

    /// The chain's tool order.
    pub fn chain_order(&self) -> &[String] {
        &self.chain_order
    }

    /// `router.pins`.
    pub fn pins(&self) -> &Pins {
        &self.pins
    }

    fn offerings_of(&self, tool: &str) -> impl Iterator<Item = &Offering> {
        self.by_tool
            .get(tool)
            .into_iter()
            .flatten()
            .map(|&i| &self.offerings[i])
    }

    /// The models `tool` offers, in offering order.
    pub fn models_for(&self, tool: &str) -> Vec<&Sourced<Model>> {
        self.offerings_of(tool)
            .filter_map(|o| self.catalogue.models.get(&o.model))
            .collect()
    }

    /// The model `name` means on `tool`, matched in order against the
    /// offering's `native_name`, the model key (`provider/id`), the model id,
    /// the model's aliases and the tool's aliases.
    pub fn find_model(&self, tool: &str, name: &str) -> Option<FoundModel<'_>> {
        let with_model: Vec<FoundModel<'_>> = self
            .offerings_of(tool)
            .filter_map(|offering| {
                self.catalogue
                    .models
                    .get(&offering.model)
                    .map(|model| FoundModel { model, offering })
            })
            .collect();
        let alias_target = self
            .tool(tool)
            .and_then(|t| t.aliases.as_ref())
            .and_then(|a| a.get(name));
        let tests: [&dyn Fn(&FoundModel<'_>) -> bool; 5] = [
            &|f| f.offering.native_name == name,
            &|f| f.model.key == name,
            &|f| f.model.id == name,
            &|f| {
                f.model
                    .aliases
                    .as_ref()
                    .is_some_and(|a| a.iter().any(|x| x == name))
            },
            &|f| alias_target.is_some_and(|k| f.model.key == *k),
        ];
        for test in tests {
            if let Some(hit) = with_model.iter().find(|f| test(f)) {
                return Some(*hit);
            }
        }
        None
    }

    /// The tool's offering of the model with catalogue key `model_key`, or `None`.
    pub fn offering(&self, tool: &str, model_key: &str) -> Option<&Offering> {
        self.offerings_of(tool).find(|o| o.model == model_key)
    }

    /// Where the classifier places a model, by key; `unclassified` for a key it does not know.
    pub fn tier_of(&self, model_key: &str) -> Placement {
        self.placements
            .get(model_key)
            .copied()
            .unwrap_or(Placement::Unclassified)
    }

    /// The name the tier-per-tool mapping hands `tool` for `tier`: the pin when
    /// one is set, else the head of that tool's run in the tier's chain.
    pub fn tier_model(&self, tool: &str, tier: Tier) -> Option<String> {
        if let Some(pin) = self.pins.get(&pin_key(tool, tier)) {
            return Some(pin.clone());
        }
        let at = TIERS.iter().position(|t| *t == tier)?;
        let chain = self.chains[at].get_or_init(|| expand_chain(tier, &[], self));
        chain
            .entries
            .iter()
            .find(|e| e.tool == tool)
            .map(|e| e.native_name.clone())
    }

    /// Whether `router.pins` sets `tool/tier`.
    pub fn pinned(&self, tool: &str, tier: Tier) -> bool {
        self.pins.contains_key(&pin_key(tool, tier))
    }

    /// The levels `tool` accepts, for `model` when given: the offering's own
    /// list when it has one, else the model's levels the tool can pass (both
    /// lists when both are declared, else whichever is). `None` when nothing
    /// is declared; `Some([])` when the tool takes no effort.
    pub fn efforts_for(&self, tool: &str, model: Option<&str>) -> Option<Vec<String>> {
        let t = self.tool(tool)?;
        let Some(model) = model else {
            return t.efforts.clone();
        };
        let Some(found) = self.find_model(tool, model) else {
            return t.efforts.clone();
        };
        if let Some(e) = &found.offering.efforts {
            return Some(e.clone());
        }
        let Some(own) = &found.model.efforts else {
            return t.efforts.clone();
        };
        match &t.efforts {
            None => Some(own.clone()),
            Some(te) => Some(te.iter().filter(|e| own.contains(e)).cloned().collect()),
        }
    }
}
