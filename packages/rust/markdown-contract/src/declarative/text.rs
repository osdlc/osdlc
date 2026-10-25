//! The declarative text-constraint compiler — the closed `requires:` / `forbids:`
//! match-spec vocabulary of a `*.contract.yaml`, compiled onto the engine's
//! text-predicate builders, mirroring the TS `declarative/text.ts`.
//!
//! Each entry is checked against the finite vocabulary — exactly one needle (`pattern` |
//! `regex`), the `normalize` / `ignoreCase` tuning, the `min` / `max` bound, and the
//! `id` / `note` / `level` shapers — so an unknown key, a missing or doubled needle, or
//! a wrong-typed value is a [`DeclarativeError`]. Two compile-time consistency checks
//! mirror the TS engine: a DUPLICATE (same matcher identity within one list) and a
//! CONTRADICTION (one literal both required and forbidden at a scope, or a single entry
//! whose `max` falls below its effective minimum) are rejected.

use serde_yaml::Value;

use super::errors::DeclarativeError;
use super::yaml::{get, render};
use crate::contract::{DocRule, Rule};
use crate::finding::FindingLevel;
use crate::text_constraints::{TextRuleSpec, forbids, requires, text_rule};
use crate::text_match::{NeedleError, TextMatchSpec, build_regex};

/// The closed match-spec vocabulary.
const SPEC_KEYS: &[&str] = &[
    "pattern",
    "regex",
    "normalize",
    "ignoreCase",
    "min",
    "max",
    "id",
    "note",
    "level",
];

fn err(msg: String) -> DeclarativeError {
    DeclarativeError::InvalidTextSpec(msg)
}

/// Compile and validate ONE match-spec entry against the closed vocabulary.
fn compile_match_spec(
    raw: &Value,
    kind: &str,
    path: &str,
) -> Result<TextMatchSpec, DeclarativeError> {
    let Value::Mapping(map) = raw else {
        return Err(err(format!(
            "{path}: a match spec must be a mapping (pattern | regex, …)"
        )));
    };

    // Reject any key outside the closed vocabulary.
    for key in map.keys() {
        let known = key.as_str().is_some_and(|k| SPEC_KEYS.contains(&k));
        if !known {
            return Err(err(format!(
                "{path}: unknown match-spec key '{}' (allowed: {})",
                key.as_str().unwrap_or("?"),
                SPEC_KEYS.join(", ")
            )));
        }
    }

    let mut spec = TextMatchSpec::default();
    assign_needle(map, &mut spec, path)?;
    assign_scalar_fields(map, &mut spec, path)?;
    assign_level(map, &mut spec, path)?;
    assert_count_bound(&spec, kind, path)?;
    // Compile the needle as the builders will, so a source the `regex` crate rejects is
    // an error here, not a builder panic.
    if let Err(NeedleError::Invalid(e)) = build_regex(&spec) {
        return Err(err(format!(
            "{path}.regex: invalid regex {}: {e}",
            spec.repr()
        )));
    }
    Ok(spec)
}

/// Resolve the needle: exactly one of `pattern` (a literal) or `regex` (a source).
fn assign_needle(
    map: &serde_yaml::Mapping,
    spec: &mut TextMatchSpec,
    path: &str,
) -> Result<(), DeclarativeError> {
    let pattern = get(map, "pattern");
    let regex = get(map, "regex");
    match (pattern, regex) {
        (Some(_), Some(_)) => Err(err(format!(
            "{path}: a match spec needs exactly one of 'pattern' / 'regex', not both"
        ))),
        (None, None) => Err(err(format!(
            "{path}: a match spec needs one of 'pattern' (a literal) or 'regex' (a source)"
        ))),
        (Some(p), None) => {
            spec.pattern = Some(
                p.as_str()
                    .ok_or_else(|| err(format!("{path}.pattern must be a string")))?
                    .to_string(),
            );
            Ok(())
        }
        (None, Some(r)) => {
            spec.regex = Some(
                r.as_str()
                    .ok_or_else(|| err(format!("{path}.regex must be a string")))?
                    .to_string(),
            );
            Ok(())
        }
    }
}

/// Copy each present scalar tuning / shaper field, type-checking it.
fn assign_scalar_fields(
    map: &serde_yaml::Mapping,
    spec: &mut TextMatchSpec,
    path: &str,
) -> Result<(), DeclarativeError> {
    if let Some(v) = get(map, "normalize") {
        spec.normalize = Some(
            v.as_bool()
                .ok_or_else(|| err(format!("{path}.normalize must be a boolean")))?,
        );
    }
    if let Some(v) = get(map, "ignoreCase") {
        spec.ignore_case = Some(
            v.as_bool()
                .ok_or_else(|| err(format!("{path}.ignoreCase must be a boolean")))?,
        );
    }
    if let Some(v) = get(map, "min") {
        spec.min = Some(
            v.as_f64()
                .ok_or_else(|| err(format!("{path}.min must be a number")))?,
        );
    }
    if let Some(v) = get(map, "max") {
        spec.max = Some(
            v.as_f64()
                .ok_or_else(|| err(format!("{path}.max must be a number")))?,
        );
    }
    if let Some(v) = get(map, "id") {
        spec.id = Some(
            v.as_str()
                .ok_or_else(|| err(format!("{path}.id must be a string")))?
                .to_string(),
        );
    }
    if let Some(v) = get(map, "note") {
        spec.note = Some(
            v.as_str()
                .ok_or_else(|| err(format!("{path}.note must be a string")))?
                .to_string(),
        );
    }
    Ok(())
}

/// Validate and assign the finding `level` override (`error` | `warn`).
fn assign_level(
    map: &serde_yaml::Mapping,
    spec: &mut TextMatchSpec,
    path: &str,
) -> Result<(), DeclarativeError> {
    if let Some(v) = get(map, "level") {
        spec.level = match v.as_str() {
            Some("error") => Some(FindingLevel::Error),
            Some("warn") => Some(FindingLevel::Warn),
            _ => {
                return Err(err(format!(
                    "{path}.level must be \"error\" or \"warn\" (got {})",
                    render(Some(v))
                )));
            }
        };
    }
    Ok(())
}

/// A count bound below its effective floor can never be satisfied — caught here so the
/// builder's construction-time purity panic never fires.
fn assert_count_bound(
    spec: &TextMatchSpec,
    kind: &str,
    path: &str,
) -> Result<(), DeclarativeError> {
    if let Some(max) = spec.max {
        let floor = if kind == "requires" {
            spec.min.unwrap_or(1.0).max(1.0)
        } else {
            spec.min.unwrap_or(0.0)
        };
        if max < floor {
            return Err(err(format!(
                "{path}: max ({max}) is below the minimum ({floor}) — the count bound can never be satisfied{}",
                if kind == "requires" {
                    "; use forbids for an absence check"
                } else {
                    ""
                }
            )));
        }
    }
    Ok(())
}

/// The canonical identity of a spec's MATCHER — mirrors `text_match::pattern_key`, so
/// two entries with one identity (which would synthesize one finding id) are duplicates.
fn matcher_identity(spec: &TextMatchSpec) -> String {
    crate::text_match::pattern_key(spec)
}

/// Compile a `requires` / `forbids` LIST, rejecting a duplicate matcher within it.
fn compile_match_specs(
    raw: &Value,
    kind: &str,
    path: &str,
) -> Result<Vec<TextMatchSpec>, DeclarativeError> {
    let Value::Sequence(entries) = raw else {
        return Err(err(format!("{path}: {kind} must be a list of match specs")));
    };
    let specs: Vec<TextMatchSpec> = entries
        .iter()
        .enumerate()
        .map(|(i, entry)| compile_match_spec(entry, kind, &format!("{path}[{i}]")))
        .collect::<Result<_, _>>()?;
    let mut seen: Vec<(String, usize)> = Vec::new();
    for (i, spec) in specs.iter().enumerate() {
        let key = matcher_identity(spec);
        if let Some((_, prev)) = seen.iter().find(|(k, _)| *k == key) {
            return Err(err(format!(
                "{path}[{i}]: duplicate match spec — same matcher as {path}[{prev}] (identical needle / normalize / ignoreCase)"
            )));
        }
        seen.push((key, i));
    }
    Ok(specs)
}

/// Does this node carry either text-constraint key?
pub fn has_text_keys(node: &serde_yaml::Mapping) -> bool {
    get(node, "requires").is_some() || get(node, "forbids").is_some()
}

/// Compile one scope's `requires` / `forbids` lists and run the cross-list
/// contradiction check: a literal `pattern` both required and forbidden at one scope is
/// unsatisfiable (regex needles carry no identity here — no overlap analysis).
fn compile_scope_text_specs(
    node: &serde_yaml::Mapping,
    path: &str,
    scope_label: &str,
) -> Result<(Vec<TextMatchSpec>, Vec<TextMatchSpec>), DeclarativeError> {
    let req = match get(node, "requires") {
        Some(v) => compile_match_specs(v, "requires", &format!("{path}.requires"))?,
        None => Vec::new(),
    };
    let forb = match get(node, "forbids") {
        Some(v) => compile_match_specs(v, "forbids", &format!("{path}.forbids"))?,
        None => Vec::new(),
    };

    let literal_id = |spec: &TextMatchSpec| -> Option<String> {
        spec.regex.is_none().then(|| matcher_identity(spec))
    };
    let required: Vec<String> = req.iter().filter_map(literal_id).collect();
    for spec in &forb {
        if let Some(key) = literal_id(spec)
            && required.contains(&key)
        {
            return Err(err(format!(
                "{path}: contradiction in {scope_label} — the literal \"{}\" is both required and forbidden",
                spec.pattern.as_deref().unwrap_or("")
            )));
        }
    }
    Ok((req, forb))
}

/// The node-local rules for a section node's `requires` / `forbids` — `requires(...)`
/// then `forbids(...)`, the order a TS author writes them. Empty when the node carries
/// neither key (or only empty lists).
pub fn compile_section_text_rules(
    node: &serde_yaml::Mapping,
    path: &str,
    scope_label: &str,
) -> Result<Vec<Box<dyn Rule>>, DeclarativeError> {
    let (req, forb) = compile_scope_text_specs(node, path, scope_label)?;
    let mut rules: Vec<Box<dyn Rule>> = Vec::new();
    if !req.is_empty() {
        rules.push(requires(req));
    }
    if !forb.is_empty() {
        rules.push(forbids(forb));
    }
    Ok(rules)
}

/// The single cross-plane `DocRule` for the body root's `requires` / `forbids` — one
/// `text_rule({ requires, forbids })`. `None` when neither key carries entries.
pub fn compile_body_text_rule(
    node: &serde_yaml::Mapping,
    path: &str,
) -> Result<Option<Box<dyn DocRule>>, DeclarativeError> {
    let (req, forb) = compile_scope_text_specs(node, path, "the document")?;
    if req.is_empty() && forb.is_empty() {
        return Ok(None);
    }
    Ok(Some(text_rule(TextRuleSpec {
        requires: req,
        forbids: forb,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(yaml: &str) -> serde_yaml::Mapping {
        serde_yaml::from_str(yaml).unwrap()
    }

    // Contract first: a well-formed section scope compiles to requires-then-forbids.
    #[test]
    fn section_scope_compiles_requires_then_forbids() {
        let node =
            map("requires:\n  - pattern: outcome\nforbids:\n  - pattern: TBD\n    level: warn\n");
        let rules = compile_section_text_rules(&node, "body.sections[0]", "Summary").unwrap();
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[0].id(), "text/requires");
        assert_eq!(rules[1].id(), "text/forbids");
    }

    #[test]
    fn body_root_compiles_to_one_doc_rule_or_none() {
        let node = map("forbids:\n  - pattern: '}scripts/'\n    normalize: false\n");
        assert!(compile_body_text_rule(&node, "body").unwrap().is_some());
        let empty = map("sections: []\n");
        assert!(compile_body_text_rule(&empty, "body").unwrap().is_none());
    }

    // The closed vocabulary: unknown keys, needle arity, and typing all reject.
    #[test]
    fn vocabulary_violations_are_declarative_errors() {
        let cases = [
            "requires:\n  - pattern: a\n    wibble: 1\n", // unknown key
            "requires:\n  - pattern: a\n    regex: b\n",  // both needles
            "requires:\n  - min: 1\n",                    // no needle
            "requires:\n  - pattern: 3\n",                // wrong type
            "requires:\n  - pattern: a\n    level: report\n", // bad level
            "requires:\n  - pattern: a\n    max: 0\n",    // absence form
            "requires:\n  - pattern: a\n  - pattern: a\n", // duplicate
            "requires:\n  - regex: '('\n",                // invalid regex
            "requires:\n  - regex: '(?=x)'\n",            // lookaround
            "requires:\n  - regex: '\\w{1000}{1000}'\n",  // past the size limit
        ];
        for yaml in cases {
            let node = map(yaml);
            assert!(
                compile_section_text_rules(&node, "p", "S").is_err(),
                "expected rejection for: {yaml}"
            );
        }
    }

    #[test]
    fn a_required_and_forbidden_literal_is_a_contradiction() {
        let node = map("requires:\n  - pattern: outcome\nforbids:\n  - pattern: outcome\n");
        let Err(e) = compile_section_text_rules(&node, "p", "Summary") else {
            panic!("expected a DeclarativeError")
        };
        assert!(e.to_string().contains("contradiction in Summary"));
    }
}
