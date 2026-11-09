//! Routing rules (mirror of `routing.ts`): an ordered list of `{ when, profile }`
//! rules, the first whose `when` holds for a request names its profile.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::reference::is_js_whitespace;

/// The request attributes a rule's `when` may test, in display order.
pub const ROUTING_KEYS: [&str; 6] = [
    "workflow",
    "stage",
    "complexity",
    "impact",
    "autonomy",
    "tags",
];

/// All keys present must match; `tags` matches when the request carries any listed tag.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RoutingWhen {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workflow: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub complexity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub impact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub autonomy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

impl RoutingWhen {
    /// The single-valued attribute `key` holds, for a key other than `tags`.
    fn value(&self, key: &str) -> Option<&str> {
        match key {
            "workflow" => self.workflow.as_deref(),
            "stage" => self.stage.as_deref(),
            "complexity" => self.complexity.as_deref(),
            "impact" => self.impact.as_deref(),
            "autonomy" => self.autonomy.as_deref(),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RoutingRule {
    pub when: RoutingWhen,
    /// The profile a matching request resolves through.
    pub profile: String,
}

/// What one launch is for: the workflow, and the attributes of the task it runs on when it has
/// one. The same attributes a rule's `when` tests, so one type serves both; a request that
/// carries a key the rules do not know is a deserialize error, not a silent mismatch.
pub type RouteRequest = RoutingWhen;

/// The values a key may hold, when the caller has a closed set (a task's
/// `complexity`, say). A key left out takes any non-empty string.
pub type RoutingVocabulary = HashMap<String, Vec<String>>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum RoutingError {
    /// The wrong shape. The message is this crate's own, not zod's.
    InvalidShape {
        #[serde(skip_serializing_if = "Option::is_none")]
        index: Option<usize>,
        message: String,
    },
    InvalidValue {
        index: usize,
        key: String,
        value: String,
        valid: Vec<String>,
        message: String,
    },
}

/// A non-empty string once trimmed (`z.string().trim().min(1)`), as trimmed. The
/// trim is JavaScript's, not Unicode's.
fn value_of(v: &Value) -> Option<String> {
    let t = v.as_str()?.trim_matches(is_js_whitespace);
    (!t.is_empty()).then(|| t.to_string())
}

fn when_of(v: &Value) -> Option<RoutingWhen> {
    let map: &Map<String, Value> = v.as_object()?;
    if map.keys().any(|k| !ROUTING_KEYS.contains(&k.as_str())) {
        return None;
    }
    let single = |key: &str| -> Option<Option<String>> {
        match map.get(key) {
            None => Some(None),
            Some(v) => value_of(v).map(Some),
        }
    };
    let tags = match map.get("tags") {
        None => None,
        Some(Value::Array(list)) if !list.is_empty() => {
            Some(list.iter().map(value_of).collect::<Option<Vec<_>>>()?)
        }
        Some(_) => return None,
    };
    Some(RoutingWhen {
        workflow: single("workflow")?,
        stage: single("stage")?,
        complexity: single("complexity")?,
        impact: single("impact")?,
        autonomy: single("autonomy")?,
        tags,
    })
}

fn rule_of(v: &Value) -> Option<RoutingRule> {
    let map = v.as_object()?;
    if map.keys().any(|k| k != "when" && k != "profile") {
        return None;
    }
    Some(RoutingRule {
        when: when_of(map.get("when")?)?,
        profile: value_of(map.get("profile")?)?,
    })
}

/// Parse a `routing:` section: an ordered list of `{ when, profile }` rules.
/// With `vocabulary`, a `when` value outside its key's set is an error naming
/// the rule index and the valid values. Whether `profile` names a defined
/// profile is the caller's check: profiles may be defined elsewhere.
pub fn parse_routing(
    input: &Value,
    vocabulary: &RoutingVocabulary,
) -> Result<Vec<RoutingRule>, RoutingError> {
    let Value::Array(items) = input else {
        return Err(RoutingError::InvalidShape {
            index: None,
            message: "routing: expected an array of rules".to_string(),
        });
    };
    let mut rules = Vec::with_capacity(items.len());
    for (index, item) in items.iter().enumerate() {
        match rule_of(item) {
            Some(rule) => rules.push(rule),
            None => {
                return Err(RoutingError::InvalidShape {
                    index: Some(index),
                    message: format!("routing[{index}]: not a valid rule"),
                });
            }
        }
    }
    for (index, rule) in rules.iter().enumerate() {
        for key in ROUTING_KEYS {
            let Some(valid) = vocabulary.get(key) else {
                continue;
            };
            let values: Vec<&str> = if key == "tags" {
                rule.when
                    .tags
                    .iter()
                    .flatten()
                    .map(String::as_str)
                    .collect()
            } else {
                rule.when.value(key).into_iter().collect()
            };
            for value in values {
                if valid.iter().any(|v| v == value) {
                    continue;
                }
                return Err(RoutingError::InvalidValue {
                    index,
                    key: key.to_string(),
                    value: value.to_string(),
                    valid: valid.clone(),
                    message: format!(
                        "routing[{index}]: when.{key}: '{value}' is not one of {}",
                        valid.join(", ")
                    ),
                });
            }
        }
    }
    Ok(rules)
}

/// Whether every key of `when` holds for `request`. A key the request lacks does not hold.
fn holds(when: &RoutingWhen, request: &RouteRequest) -> bool {
    for key in ROUTING_KEYS {
        if key == "tags" {
            if let Some(tags) = &when.tags
                && !request.tags.iter().flatten().any(|t| tags.contains(t))
            {
                return false;
            }
        } else if let Some(want) = when.value(key)
            && request.value(key) != Some(want)
        {
            return false;
        }
    }
    true
}

/// A rule that matched, with its index.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RuleMatch<'a> {
    pub index: usize,
    pub rule: &'a RoutingRule,
}

/// The first rule whose `when` holds for `request`, with its index; `None` when none does.
pub fn match_rule<'a>(rules: &'a [RoutingRule], request: &RouteRequest) -> Option<RuleMatch<'a>> {
    rules
        .iter()
        .position(|r| holds(&r.when, request))
        .map(|index| RuleMatch {
            index,
            rule: &rules[index],
        })
}

/// Whether every request `narrow` matches, `broad` matches too: each key of
/// `broad` is in `narrow` with the same value, and for `tags`, every tag
/// `narrow` lists is one `broad` lists.
fn covers(broad: &RoutingWhen, narrow: &RoutingWhen) -> bool {
    for key in ROUTING_KEYS {
        if key == "tags" {
            let Some(b) = &broad.tags else { continue };
            match &narrow.tags {
                Some(n) if n.iter().all(|t| b.contains(t)) => {}
                _ => return false,
            }
        } else if let Some(want) = broad.value(key)
            && narrow.value(key) != Some(want)
        {
            return false;
        }
    }
    true
}

/// A rule that can never match, and the first earlier rule that matches every request it does.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Shadowed {
    pub index: usize,
    pub by: usize,
}

/// The rules that can never match because an earlier rule with the same or a
/// broader `when` matches every request they do: each with the first such
/// earlier rule's index.
pub fn shadowed_rules(rules: &[RoutingRule]) -> Vec<Shadowed> {
    rules
        .iter()
        .enumerate()
        .filter_map(|(index, rule)| {
            rules[..index]
                .iter()
                .position(|earlier| covers(&earlier.when, &rule.when))
                .map(|by| Shadowed { index, by })
        })
        .collect()
}

/// `{workflow: implement, complexity: small, tags: [ui]}`: a `when` as the config writes it.
pub fn format_when(when: &RoutingWhen) -> String {
    let parts: Vec<String> = ROUTING_KEYS
        .iter()
        .filter_map(|key| {
            if *key == "tags" {
                when.tags
                    .as_ref()
                    .map(|t| format!("tags: [{}]", t.join(", ")))
            } else {
                when.value(key).map(|v| format!("{key}: {v}"))
            }
        })
        .collect();
    format!("{{{}}}", parts.join(", "))
}
