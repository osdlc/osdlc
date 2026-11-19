//! Classifier rules (mirror of `classify.ts`): data that places each catalogue
//! model in a tier, or leaves it `unclassified`. The category chains and the
//! tier-per-tool mapping are generated from the placement.

use std::sync::LazyLock;

use indexmap::IndexMap;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::catalogue::{Model, Table};
use crate::reference::{TIERS, Tier, Trait};

/// A tier, or `unclassified`: a model no rule places can be named exactly, but
/// no tier picks it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Placement {
    /// The fast tier.
    Fast,
    /// The standard tier.
    Standard,
    /// The max tier.
    Max,
    /// No rule places the model, or a rule leaves it out on purpose.
    Unclassified,
}

impl From<Tier> for Placement {
    fn from(t: Tier) -> Placement {
        match t {
            Tier::Fast => Placement::Fast,
            Tier::Standard => Placement::Standard,
            Tier::Max => Placement::Max,
        }
    }
}

/// One provider or several.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OneOrMany {
    /// A single provider id.
    One(String),
    /// Several provider ids.
    Many(Vec<String>),
}

impl OneOrMany {
    fn contains(&self, s: &str) -> bool {
        match self {
            OneOrMany::One(p) => p == s,
            OneOrMany::Many(ps) => ps.iter().any(|p| p == s),
        }
    }
}

/// A model id glob and the tier it places a matching model in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MatchRule {
    /// The model id glob; `*` matches any run.
    pub id: String,
    /// Where a matching model is placed.
    pub tier: Placement,
}

/// A threshold per tier, such as `<10B` or `>=40B`, tried in tier order.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ByParameters {
    /// The threshold for the fast tier.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fast: Option<String>,
    /// The threshold for the standard tier.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub standard: Option<String>,
    /// The threshold for the max tier.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<String>,
}

impl ByParameters {
    fn threshold(&self, tier: Tier) -> Option<&str> {
        match tier {
            Tier::Fast => self.fast.as_deref(),
            Tier::Standard => self.standard.as_deref(),
            Tier::Max => self.max.as_deref(),
        }
    }
}

/// A classifier rule: the first one that applies (its `provider`, its
/// `require_traits`) and matches (by `families`, then `match` id globs, then
/// `by_parameters`) decides.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClassifyRule {
    /// The provider or providers the rule applies to; every provider when omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<OneOrMany>,
    /// Model family to tier, or `unclassified`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub families: Option<IndexMap<String, Placement>>,
    /// Model id globs to tier, first match wins.
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "match")]
    pub matches: Option<Vec<MatchRule>>,
    /// Tier by parameter count read off the model id (`qwen3:4b`), tried fast first.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub by_parameters: Option<ByParameters>,
    /// The rule matches only models that carry every one of these traits.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub require_traits: Option<Vec<Trait>>,
}

/// The shipped rules, fixed against the shipped snapshot's families. A family
/// no rule names stays unclassified until a rule places it.
pub fn builtin_classify_rules() -> Vec<ClassifyRule> {
    let families = |pairs: [(&str, Placement); 3]| {
        Some(pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
    };
    let one = |p: &str| Some(OneOrMany::One(p.to_string()));
    vec![
        ClassifyRule {
            provider: one("anthropic"),
            families: families([
                ("claude-haiku", Placement::Fast),
                ("claude-sonnet", Placement::Standard),
                ("claude-opus", Placement::Max),
            ]),
            ..Default::default()
        },
        ClassifyRule {
            provider: one("openai"),
            families: families([
                ("gpt-luna", Placement::Fast),
                ("gpt-sol", Placement::Standard),
                ("gpt-astra", Placement::Max),
            ]),
            ..Default::default()
        },
        ClassifyRule {
            provider: one("google"),
            families: families([
                ("gemini-flash-lite", Placement::Fast),
                ("gemini-flash", Placement::Standard),
                ("gemini-pro", Placement::Max),
            ]),
            ..Default::default()
        },
        ClassifyRule {
            provider: Some(OneOrMany::Many(vec!["ollama".into(), "lmstudio".into()])),
            by_parameters: Some(ByParameters {
                fast: Some("<10B".into()),
                standard: Some("<40B".into()),
                max: Some(">=40B".into()),
            }),
            require_traits: Some(vec![Trait::Agent]),
            ..Default::default()
        },
    ]
}

fn glob_matches(glob: &str, text: &str) -> bool {
    let body = glob
        .split('*')
        .map(regex::escape)
        .collect::<Vec<_>>()
        .join(".*");
    Regex::new(&format!("^{body}$")).is_ok_and(|re| re.is_match(text))
}

static PARAMETER_COUNT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)[:-]([0-9]+(?:\.[0-9]+)?)b([a-z])?").expect("static regex"));

/// The parameter count in billions that a model id carries, as local runtimes
/// tag them (`qwen3:4b`, `llama3.1:70b`, `gemma-4-26b-a4b-it`): the first
/// `<number>b` after a `:` or `-` that no letter follows. `None` when the id
/// names none.
pub fn parameter_count(id: &str) -> Option<f64> {
    PARAMETER_COUNT
        .captures_iter(id)
        .find(|c| c.get(2).is_none())
        .and_then(|c| c[1].parse().ok())
}

static THRESHOLD: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(<=|>=|<|>)([0-9]+(?:\.[0-9]+)?)b$").expect("static regex"));

fn meets(count: f64, threshold: &str) -> bool {
    let Some(m) = THRESHOLD.captures(threshold) else {
        return false;
    };
    let Ok(n) = m[2].parse::<f64>() else {
        return false;
    };
    match &m[1] {
        "<" => count < n,
        "<=" => count <= n,
        ">" => count > n,
        _ => count >= n,
    }
}

fn rule_for(rule: &ClassifyRule, model: &Model) -> Option<Placement> {
    if let Some(providers) = &rule.provider
        && !providers.contains(&model.provider)
    {
        return None;
    }
    if rule
        .require_traits
        .iter()
        .flatten()
        .any(|t| !model.has_trait(*t))
    {
        return None;
    }
    if let (Some(family), Some(families)) = (&model.family, &rule.families)
        && let Some(p) = families.get(family)
    {
        return Some(*p);
    }
    for m in rule.matches.iter().flatten() {
        if glob_matches(&m.id, &model.id) {
            return Some(m.tier);
        }
    }
    if let Some(by) = &rule.by_parameters {
        let count = parameter_count(&model.id)?;
        for tier in TIERS {
            if let Some(threshold) = by.threshold(*tier)
                && meets(count, threshold)
            {
                return Some((*tier).into());
            }
        }
    }
    None
}

/// Where `rules` place `model`: the first rule that applies and matches
/// decides; a rule may place a model `unclassified` on purpose. A model no
/// rule matches is `unclassified`.
pub fn classify_model(model: &Model, rules: &[ClassifyRule]) -> Placement {
    rules
        .iter()
        .find_map(|rule| rule_for(rule, model))
        .unwrap_or(Placement::Unclassified)
}

/// Every catalogue model's placement, keyed `provider/id`.
pub fn classify<'a>(
    models: impl IntoIterator<Item = &'a Model>,
    rules: &[ClassifyRule],
) -> Table<Placement> {
    models
        .into_iter()
        .map(|m| (m.key.clone(), classify_model(m, rules)))
        .collect()
}
