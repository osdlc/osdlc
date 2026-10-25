//! The v2 body-grammar + content-leaf compiler — the `mcVersion: 2` body DSL
//! compiled to the SAME internal grammar v1 targets, mirroring the TS
//! v2 `compileBodyV2`.
//!
//! The v2 respell: `additionalSections` replaces `allowUnknown`; occurrence is spelled
//! `minContains` / `maxContains` (both absent = exactly-once, JSON Schema's own
//! defaults for a missing bound once either appears); nesting is HOISTED — `sections`
//! (with `order` / `additionalSections`) sits directly on the section node instead of
//! v1's `children:` wrapper; the list leaf's per-item check is `items` (checkbox | a
//! v2 schema node) instead of `everyItem`; and `description` is accepted on levels,
//! nodes, and leaves, stored for `Finding.hint`.
//!
//! v2 is CLOSED at the node level: a v1 key gets a migration hint, anything else is an
//! unknown key. Table `cells` and list `items` schemas compile through the v2 schema
//! subset ([`super::schema_v2`]); `requires:` / `forbids:` reuse the (unchanged) text
//! compiler ([`super::text`]).

use serde_yaml::Value;

use super::errors::DeclarativeError;
use super::schema_v2::compile_schema_v2;
use super::text::{compile_section_text_rules, has_text_keys};
use crate::camel::to_camel_key;
use crate::contract::{
    CodeConfig, EveryItem, ExtraColumns, GapSpec, LeafSpec, LevelOpts, ListConfig, OneOfSpec,
    Order, SectionContent, SectionOpts, SectionSeq, SectionSpec, Spec, TableConfig,
};

const LEAF_KEYS: &[&str] = &["table", "list", "code", "maxWords"];

/// The keys admitted on the body root level.
const ROOT_LEVEL_KEYS: &[&str] = &[
    "order",
    "additionalSections",
    "sections",
    "description",
    "requires",
    "forbids",
];

/// The keys admitted on a `section:` node (nesting hoisted onto the node).
const SECTION_KEYS: &[&str] = &[
    "section",
    "aliases",
    "anchor",
    "content",
    "requires",
    "forbids",
    "description",
    "minContains",
    "maxContains",
    "sections",
    "order",
    "additionalSections",
];

/// The keys admitted on a `oneOf:` node.
const ONE_OF_KEYS: &[&str] = &[
    "oneOf",
    "anchor",
    "content",
    "requires",
    "forbids",
    "description",
    "minContains",
    "maxContains",
    "sections",
    "order",
    "additionalSections",
];

/// The keys admitted on a `gap:` node.
const GAP_KEYS: &[&str] = &["gap"];

/// The v1 body spellings and their v2 counterparts — the migration hints.
const V1_SPELLINGS: &[(&str, &str)] = &[
    ("optional", "'minContains: 0, maxContains: 1'"),
    ("repeatable", "'minContains' / 'maxContains'"),
    ("min", "'minContains'"),
    ("max", "'maxContains'"),
    (
        "children",
        "'sections' (with 'order' / 'additionalSections') directly on the node",
    ),
    ("allowUnknown", "'additionalSections'"),
    ("everyItem", "'items'"),
];

fn get<'a>(map: &'a serde_yaml::Mapping, key: &str) -> Option<&'a Value> {
    map.get(Value::String(key.into()))
}

fn err(msg: String) -> DeclarativeError {
    DeclarativeError::InvalidBody(msg)
}

fn num(map: &serde_yaml::Mapping, key: &str) -> Option<f64> {
    get(map, key).and_then(Value::as_f64)
}

/// Reject every key of `map` outside `allowed` — v2 is closed at the node level: a v1
/// spelling gets its migration hint, anything else is an unknown key.
fn check_keys(
    map: &serde_yaml::Mapping,
    allowed: &[&str],
    path: &str,
) -> Result<(), DeclarativeError> {
    for key in map.keys() {
        let Some(k) = key.as_str() else {
            return Err(err(format!("{path}: keys must be strings")));
        };
        if allowed.contains(&k) {
            continue;
        }
        if let Some((_, v2)) = V1_SPELLINGS.iter().find(|(v1, _)| *v1 == k) {
            return Err(err(format!(
                "{path}: '{k}' is the v1 spelling — mcVersion 2 uses {v2}"
            )));
        }
        return Err(err(format!("{path}: unknown key '{k}'")));
    }
    Ok(())
}

/// The `description:` annotation — a string, stored for `Finding.hint`.
fn description_of(
    map: &serde_yaml::Mapping,
    path: &str,
) -> Result<Option<String>, DeclarativeError> {
    match get(map, "description") {
        None => Ok(None),
        Some(v) => match v.as_str() {
            Some(s) => Ok(Some(s.to_string())),
            None => Err(err(format!("{path}.description must be a string"))),
        },
    }
}

/// Compile a v2 `body:` mapping into a body grammar. The root's `requires:` /
/// `forbids:` are the loader's to attach (they compile to a doc-scoped rule).
pub fn compile_body_v2(node: &Value, path: &str) -> Result<SectionSeq, DeclarativeError> {
    let Value::Mapping(map) = node else {
        return Err(err(format!(
            "{path}: must be a mapping with a 'sections' list"
        )));
    };
    check_keys(map, ROOT_LEVEL_KEYS, path)?;
    let opts = level_opts(map, path)?;
    let specs = compile_sections(map, path)?;
    Ok(SectionSeq {
        opts,
        specs,
        description: description_of(map, path)?,
    })
}

/// Parse a level's `order` / `additionalSections` knobs (v1 semantics, v2 spelling).
fn level_opts(map: &serde_yaml::Mapping, path: &str) -> Result<LevelOpts, DeclarativeError> {
    let mut opts = LevelOpts::default();
    if let Some(order) = get(map, "order") {
        opts.order = match order.as_str() {
            Some("none") => Order::None,
            Some("recognized-relative") => Order::RecognizedRelative,
            Some("strict") => Order::Strict,
            _ => {
                return Err(err(format!(
                    "{path}.order must be none | recognized-relative | strict (got {})",
                    serde_json::to_string(&crate::frontmatter::yaml_to_json(order.clone()))
                        .unwrap_or_else(|_| "?".into())
                )));
            }
        };
    }
    if let Some(v) = get(map, "additionalSections") {
        opts.allow_unknown = v
            .as_bool()
            .ok_or_else(|| err(format!("{path}.additionalSections must be a boolean")))?;
    }
    Ok(opts)
}

/// The build-time key-collision guard the TS `sections()` runs: among declared
/// section/oneOf primary names at one level, two distinct names collapsing to one
/// camelCase key are rejected (alias spellings within one slot are one logical slot).
fn assert_no_key_collision(specs: &[Spec], path: &str) -> Result<(), DeclarativeError> {
    let mut key_to_name: Vec<(String, String)> = Vec::new();
    for spec in specs {
        let inner = unwrap_inner(spec);
        let primary = match inner {
            Spec::Section(s) => s.names.first(),
            Spec::OneOf(o) => o.names.first(),
            _ => None,
        };
        let Some(primary) = primary else { continue };
        let key = to_camel_key(primary);
        if key.is_empty() {
            continue;
        }
        if let Some((_, prior)) = key_to_name.iter().find(|(k, _)| *k == key) {
            if prior != primary {
                return Err(err(format!(
                    "{path}: contract/key-collision — section names \u{2018}{prior}\u{2019} and \u{2018}{primary}\u{2019} both generate the camelCase key \u{2018}{key}\u{2019}; generated OOM keys must be unique"
                )));
            }
        } else {
            key_to_name.push((key, primary.clone()));
        }
    }
    Ok(())
}

fn unwrap_inner(spec: &Spec) -> &Spec {
    match spec {
        Spec::Optional(inner) => unwrap_inner(inner),
        other => other,
    }
}

/// A YAML scalar as its string spelling (the TS `String(node.anchor)`).
fn scalar_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::Null => "null".into(),
        other => serde_yaml::to_string(other)
            .map(|s| s.trim_end().to_string())
            .unwrap_or_default(),
    }
}

/// Compile a `sections:` list (required) into specs, running the key-collision guard.
fn compile_sections(map: &serde_yaml::Mapping, path: &str) -> Result<Vec<Spec>, DeclarativeError> {
    let Some(Value::Sequence(nodes)) = get(map, "sections") else {
        return Err(err(format!("{path}.sections must be a list of nodes")));
    };
    let specs: Vec<Spec> = nodes
        .iter()
        .enumerate()
        .map(|(i, n)| compile_node(n, &format!("{path}.sections[{i}]")))
        .collect::<Result<_, _>>()?;
    assert_no_key_collision(&specs, path)?;
    Ok(specs)
}

fn compile_node(node: &Value, path: &str) -> Result<Spec, DeclarativeError> {
    let Value::Mapping(map) = node else {
        return Err(err(format!(
            "{path}: a body node must be a mapping (section / oneOf / gap)"
        )));
    };
    if get(map, "oneOf").is_some() {
        check_keys(map, ONE_OF_KEYS, path)?;
        compile_one_of(map, path)
    } else if get(map, "gap").is_some() {
        check_keys(map, GAP_KEYS, path)?;
        compile_gap(map, path)
    } else if get(map, "section").is_some() {
        check_keys(map, SECTION_KEYS, path)?;
        compile_section_node(map, path)
    } else {
        Err(err(format!(
            "{path}: a body node needs one of section / oneOf / gap"
        )))
    }
}

/// Compile a `gap: { min?, max? }` node (unchanged from v1). A gap admits no
/// `description` — the TS compiler rejects it, and the portable vocabulary is the
/// intersection (the docs and meta-schema document `gap` as the node's only key).
fn compile_gap(map: &serde_yaml::Mapping, _path: &str) -> Result<Spec, DeclarativeError> {
    let (min, max) = match get(map, "gap") {
        Some(Value::Mapping(g)) => (
            g.get(Value::String("min".into())).and_then(Value::as_u64),
            g.get(Value::String("max".into())).and_then(Value::as_u64),
        ),
        _ => (None, None),
    };
    Ok(Spec::Gap(GapSpec {
        min: min.map(|n| n as usize),
        max: max.map(|n| n as usize),
        description: None,
    }))
}

/// Compile a `oneOf: [...]` node.
fn compile_one_of(map: &serde_yaml::Mapping, path: &str) -> Result<Spec, DeclarativeError> {
    let names: Option<Vec<String>> = get(map, "oneOf")
        .and_then(Value::as_sequence)
        .map(|seq| seq.iter().map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or(None);
    let names = match names {
        Some(n) if !n.is_empty() => n,
        _ => {
            return Err(err(format!(
                "{path}.oneOf must be a non-empty list of section names"
            )));
        }
    };
    let opts = section_opts(map, path)?;
    finish_slot(
        map,
        path,
        |opts| Spec::OneOf(OneOfSpec { names, opts }),
        opts,
    )
}

/// Compile a `section: <name>` node (with optional `aliases`).
fn compile_section_node(map: &serde_yaml::Mapping, path: &str) -> Result<Spec, DeclarativeError> {
    let Some(name) = get(map, "section").and_then(Value::as_str) else {
        return Err(err(format!(
            "{path}.section must be a heading name (string)"
        )));
    };
    let mut names = vec![name.to_string()];
    if let Some(aliases) = get(map, "aliases") {
        let list: Option<Vec<String>> = aliases
            .as_sequence()
            .map(|seq| seq.iter().map(|v| v.as_str().map(str::to_string)).collect())
            .unwrap_or(None);
        match list {
            Some(mut l) => names.append(&mut l),
            None => {
                return Err(err(format!(
                    "{path}.aliases must be a list of alias spellings"
                )));
            }
        }
    }
    let opts = section_opts(map, path)?;
    finish_slot(
        map,
        path,
        |opts| Spec::Section(SectionSpec { names, opts }),
        opts,
    )
}

/// Apply the occurrence recipe to a section/oneOf slot and build the final spec,
/// wrapping it `optional` when the window admits zero.
fn finish_slot(
    map: &serde_yaml::Mapping,
    path: &str,
    build: impl FnOnce(Option<SectionOpts>) -> Spec,
    mut opts: Option<SectionOpts>,
) -> Result<Spec, DeclarativeError> {
    let mut optional = false;
    if let Some((lo, hi)) = occurrence(map, path)? {
        optional = lo == 0;
        // 0..1 and 1..1 stay scalar slots; everything else is a counted (repeatable)
        // slot with min only meaningful from 2 up (1 is the presence gate's job).
        let plain = matches!((lo, hi), (0, Some(1)) | (1, Some(1)));
        if !plain {
            let o = opts.get_or_insert_with(SectionOpts::default);
            o.repeatable = true;
            if lo >= 2 {
                o.min = Some(lo);
            }
            o.max = hi;
        }
    }
    let spec = build(opts);
    Ok(if optional {
        Spec::Optional(Box::new(spec))
    } else {
        spec
    })
}

/// The v2 occurrence window: both keywords absent → `None` (the exactly-once
/// invariant). Either present → JSON Schema's own defaults for the missing bound
/// (`minContains` 1, `maxContains` unbounded), validated as non-negative integers with
/// `maxContains ≥ 1` and `maxContains ≥ minContains`.
fn occurrence(
    map: &serde_yaml::Mapping,
    path: &str,
) -> Result<Option<(usize, Option<usize>)>, DeclarativeError> {
    let min_v = get(map, "minContains");
    let max_v = get(map, "maxContains");
    if min_v.is_none() && max_v.is_none() {
        return Ok(None);
    }
    let lo = match min_v {
        Some(v) => occurrence_bound(v, "minContains", path)?,
        None => 1,
    };
    let hi = match max_v {
        Some(v) => Some(occurrence_bound(v, "maxContains", path)?),
        None => None,
    };
    if let Some(hi) = hi {
        if hi < 1 {
            return Err(err(format!(
                "{path}: contract/repeat-bounds — maxContains must be at least 1"
            )));
        }
        if hi < lo {
            return Err(err(format!(
                "{path}: contract/repeat-bounds — minContains {lo} is greater than maxContains {hi}"
            )));
        }
    }
    Ok(Some((lo, hi)))
}

/// An occurrence bound: a non-negative integer.
fn occurrence_bound(v: &Value, key: &str, path: &str) -> Result<usize, DeclarativeError> {
    let n = v
        .as_f64()
        .ok_or_else(|| err(format!("{path}.{key} must be a number")))?;
    if n.fract() != 0.0 || n < 0.0 {
        return Err(err(format!(
            "{path}: contract/repeat-bounds — {key} must be a non-negative integer (got {n})"
        )));
    }
    Ok(n as usize)
}

/// A slot's options: anchor / content / text rules / description, plus the HOISTED
/// nested level (`sections` + `order` / `additionalSections` directly on the node).
fn section_opts(
    map: &serde_yaml::Mapping,
    path: &str,
) -> Result<Option<SectionOpts>, DeclarativeError> {
    let mut opts = SectionOpts::default();
    let mut any = false;
    if let Some(anchor) = get(map, "anchor") {
        opts.anchor = Some(scalar_string(anchor));
        any = true;
    }
    if let Some(content) = get(map, "content") {
        opts.content = Some(compile_content(content, &format!("{path}.content"))?);
        any = true;
    }
    if get(map, "sections").is_some() {
        opts.children = Some(nested_level(map, path)?);
        any = true;
    } else if get(map, "order").is_some() || get(map, "additionalSections").is_some() {
        return Err(err(format!(
            "{path}: 'order' / 'additionalSections' apply to a nested 'sections' list — add 'sections'"
        )));
    }
    if let Some(description) = description_of(map, path)? {
        opts.description = Some(description);
        any = true;
    }
    // `requires:` / `forbids:` on a node → node-local rules over that section's subtree
    // (the text vocabulary is unchanged in v2).
    if has_text_keys(map) {
        let label = get(map, "section")
            .and_then(Value::as_str)
            .unwrap_or(path)
            .to_string();
        let rules = compile_section_text_rules(map, path, &label)?;
        if !rules.is_empty() {
            opts.rules = rules;
            any = true;
        }
    }
    Ok(any.then_some(opts))
}

/// The hoisted nested level: `sections` / `order` / `additionalSections` read straight
/// off the section node (v1's `children:` wrapper, flattened) — compiles to the same
/// nested `SectionSeq`. The node's own `description` covers the level, so none is
/// stored here.
fn nested_level(map: &serde_yaml::Mapping, path: &str) -> Result<SectionSeq, DeclarativeError> {
    Ok(SectionSeq {
        opts: level_opts(map, path)?,
        specs: compile_sections(map, path)?,
        description: None,
    })
}

// ── Content leaves ────────────────────────────────────────────────────────────────────

/// A single-key mapping whose key is a leaf keyword — a leaf, not a named-leaf record.
fn is_leaf_map(map: &serde_yaml::Mapping) -> bool {
    map.len() == 1
        && map
            .keys()
            .next()
            .and_then(Value::as_str)
            .is_some_and(|k| LEAF_KEYS.contains(&k))
}

fn compile_content(content: &Value, path: &str) -> Result<SectionContent, DeclarativeError> {
    let Value::Mapping(map) = content else {
        return Err(err(format!(
            "{path}: must be a leaf (table/list/code/maxWords) or a named-leaf map"
        )));
    };
    if is_leaf_map(map) {
        return Ok(SectionContent::Single(compile_leaf(map, path)?));
    }
    // A record of `^anchor`-named leaves.
    let mut entries = Vec::with_capacity(map.len());
    for (name, leaf) in map {
        let Some(name) = name.as_str() else {
            return Err(err(format!("{path}: named-leaf keys must be strings")));
        };
        let Value::Mapping(leaf_map) = leaf else {
            return Err(err(format!(
                "{path}.{name}: a leaf must be a single-key mapping (table | list | code | maxWords)"
            )));
        };
        entries.push((
            name.to_string(),
            compile_leaf(leaf_map, &format!("{path}.{name}"))?,
        ));
    }
    Ok(SectionContent::Anchored(entries))
}

fn compile_leaf(map: &serde_yaml::Mapping, path: &str) -> Result<LeafSpec, DeclarativeError> {
    if map.len() != 1 {
        return Err(err(format!(
            "{path}: a leaf must be a single-key mapping (table | list | code | maxWords)"
        )));
    }
    let (key, cfg) = map.iter().next().expect("len == 1");
    match key.as_str() {
        Some("maxWords") => {
            let n = cfg
                .as_f64()
                .ok_or_else(|| err(format!("{path}.maxWords must be a number")))?;
            Ok(LeafSpec::max_words(n))
        }
        Some("code") => code_leaf(cfg, path),
        Some("table") => table_leaf(cfg, path),
        Some("list") => list_leaf(cfg, path),
        other => Err(err(format!(
            "{path}: unknown leaf '{}'",
            other.unwrap_or("?")
        ))),
    }
}

fn code_leaf(cfg: &Value, path: &str) -> Result<LeafSpec, DeclarativeError> {
    let mut leaf = LeafSpec::code_with(CodeConfig::default());
    if let Value::Mapping(map) = cfg {
        check_keys(map, &["lang", "description"], &format!("{path}.code"))?;
        leaf = LeafSpec::code_with(CodeConfig {
            lang: get(map, "lang").and_then(Value::as_str).map(str::to_string),
        });
        leaf.description = description_of(map, &format!("{path}.code"))?;
    }
    Ok(leaf)
}

fn table_leaf(cfg: &Value, path: &str) -> Result<LeafSpec, DeclarativeError> {
    let Value::Mapping(map) = cfg else {
        return Err(err(format!("{path}.table must be a mapping")));
    };
    check_keys(
        map,
        &[
            "columns",
            "anchor",
            "minRows",
            "extraColumns",
            "cells",
            "description",
        ],
        &format!("{path}.table"),
    )?;
    let columns: Option<Vec<String>> = get(map, "columns")
        .and_then(Value::as_sequence)
        .map(|seq| seq.iter().map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or(None);
    let Some(columns) = columns else {
        return Err(err(format!(
            "{path}.table.columns must be a list of column names"
        )));
    };
    let mut out = TableConfig {
        columns,
        ..Default::default()
    };
    if let Some(anchor) = get(map, "anchor") {
        out.anchor = Some(scalar_string(anchor));
    }
    out.min_rows = num(map, "minRows");
    out.extra_columns = match get(map, "extraColumns").and_then(Value::as_str) {
        Some("error") => ExtraColumns::Error,
        _ => ExtraColumns::Ignore,
    };
    if let Some(cells) = get(map, "cells") {
        let Value::Mapping(cells) = cells else {
            return Err(err(format!(
                "{path}.table.cells must be a mapping of column → schema"
            )));
        };
        for (col, schema) in cells {
            let Some(col) = col.as_str() else {
                return Err(err(format!("{path}.table.cells keys must be column names")));
            };
            out.cells.push((
                col.to_string(),
                compile_schema_v2(schema, &format!("{path}.table.cells.{col}"))?,
            ));
        }
    }
    let mut leaf = LeafSpec::table_with(out);
    leaf.description = description_of(map, &format!("{path}.table"))?;
    Ok(leaf)
}

/// The v2 list leaf: `items` (checkbox | a v2 schema node) replaces v1's `everyItem`;
/// `minItems` / `ordered` are unchanged.
fn list_leaf(cfg: &Value, path: &str) -> Result<LeafSpec, DeclarativeError> {
    let Value::Mapping(map) = cfg else {
        return Err(err(format!("{path}.list must be a mapping")));
    };
    check_keys(
        map,
        &["items", "minItems", "ordered", "description"],
        &format!("{path}.list"),
    )?;
    let mut out = ListConfig {
        ordered: get(map, "ordered").and_then(Value::as_bool),
        min_items: num(map, "minItems"),
        every_item: None,
    };
    if let Some(items) = get(map, "items") {
        out.every_item = Some(if items.as_str() == Some("checkbox") {
            EveryItem::Checkbox
        } else {
            EveryItem::Schema(compile_schema_v2(items, &format!("{path}.list.items"))?)
        });
    }
    let mut leaf = LeafSpec::list_with(out);
    leaf.description = description_of(map, &format!("{path}.list"))?;
    Ok(leaf)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn body(yaml: &str) -> Result<SectionSeq, DeclarativeError> {
        let v: Value = serde_yaml::from_str(yaml).unwrap();
        compile_body_v2(&v, "body")
    }

    fn msg(r: Result<SectionSeq, DeclarativeError>) -> String {
        match r {
            Err(e) => e.to_string(),
            Ok(_) => panic!("expected a DeclarativeError"),
        }
    }

    /// The slot shape the occurrence recipe compiled to:
    /// `(optional-wrapped, repeatable, min, max)`.
    fn slot_shape(spec: &Spec) -> (bool, bool, Option<usize>, Option<usize>) {
        let (inner, optional) = match spec {
            Spec::Optional(inner) => (&**inner, true),
            other => (other, false),
        };
        let opts = match inner {
            Spec::Section(s) => s.opts.as_ref(),
            Spec::OneOf(o) => o.opts.as_ref(),
            _ => panic!("expected a section/oneOf slot"),
        };
        (
            optional,
            opts.is_some_and(|o| o.repeatable),
            opts.and_then(|o| o.min),
            opts.and_then(|o| o.max),
        )
    }

    // Contract first: the canonical v2 body compiles onto the same combinator shapes v1
    // targets — v2 spelling in, identical IR out.
    #[test]
    fn sections_one_of_gap_and_additional_sections_compile() {
        let seq = body(
            "order: strict\nadditionalSections: false\nsections:\n  - section: Title\n  - oneOf: [Goal, 'Goal / Problem statement']\n  - gap:\n      min: 1\n      max: 2\n  - section: Appendix\n    minContains: 0\n    maxContains: 1\n",
        )
        .unwrap();
        assert_eq!(seq.opts.order, Order::Strict);
        assert!(!seq.opts.allow_unknown);
        assert_eq!(seq.specs.len(), 4);
        assert!(matches!(&seq.specs[0], Spec::Section(s) if s.names == ["Title"]));
        assert!(matches!(&seq.specs[1], Spec::OneOf(o) if o.names.len() == 2));
        assert!(matches!(&seq.specs[2], Spec::Gap(g) if g.min == Some(1) && g.max == Some(2)));
        assert!(matches!(&seq.specs[3], Spec::Optional(_)));
    }

    // The occurrence recipe — every row of the v1 to v2 mapping.
    #[test]
    fn occurrence_recipe_compiles_each_window() {
        let compiled = |occ: &str| {
            let seq = body(&format!("sections:\n  - section: Entry\n{occ}")).unwrap();
            slot_shape(&seq.specs[0])
        };
        // both absent → plain slot (exactly-once)
        assert_eq!(compiled(""), (false, false, None, None));
        // 0..1 → optional scalar
        assert_eq!(
            compiled("    minContains: 0\n    maxContains: 1\n"),
            (true, false, None, None)
        );
        // 1..1 → plain
        assert_eq!(
            compiled("    minContains: 1\n    maxContains: 1\n"),
            (false, false, None, None)
        );
        // 0..∞ → optional + repeatable
        assert_eq!(compiled("    minContains: 0\n"), (true, true, None, None));
        // 0..n (n>1) → optional + repeatable + max n
        assert_eq!(
            compiled("    minContains: 0\n    maxContains: 3\n"),
            (true, true, None, Some(3))
        );
        // 1..∞ → repeatable
        assert_eq!(compiled("    minContains: 1\n"), (false, true, None, None));
        // maxContains alone → lo defaults to 1 → repeatable + max
        assert_eq!(
            compiled("    maxContains: 5\n"),
            (false, true, None, Some(5))
        );
        // lo ≥ 2 → repeatable + min (+ max when bounded)
        assert_eq!(
            compiled("    minContains: 2\n"),
            (false, true, Some(2), None)
        );
        assert_eq!(
            compiled("    minContains: 2\n    maxContains: 4\n"),
            (false, true, Some(2), Some(4))
        );
    }

    #[test]
    fn occurrence_bounds_are_validated() {
        assert!(
            msg(body("sections:\n  - section: E\n    minContains: -1\n"))
                .contains("non-negative integer")
        );
        assert!(
            msg(body("sections:\n  - section: E\n    minContains: 1.5\n"))
                .contains("non-negative integer")
        );
        assert!(
            msg(body("sections:\n  - section: E\n    maxContains: 0\n"))
                .contains("maxContains must be at least 1")
        );
        assert!(
            msg(body(
                "sections:\n  - section: E\n    minContains: 3\n    maxContains: 1\n"
            ))
            .contains("minContains 3 is greater than maxContains 1")
        );
    }

    // Hoisted nesting: `sections` (+ order / additionalSections) directly on the node.
    #[test]
    fn hoisted_sections_compile_to_children() {
        let seq = body(
            "sections:\n  - section: Decision\n    order: strict\n    additionalSections: false\n    sections:\n      - section: Components\n      - section: Resolution\n",
        )
        .unwrap();
        let Spec::Section(s) = &seq.specs[0] else {
            panic!()
        };
        let children = s.opts.as_ref().unwrap().children.as_ref().unwrap();
        assert_eq!(children.opts.order, Order::Strict);
        assert!(!children.opts.allow_unknown);
        assert_eq!(children.specs.len(), 2);
    }

    #[test]
    fn content_leaves_compile_with_v2_cells_and_items() {
        let seq = body(
            "sections:\n  - section: Files\n    anchor: files\n    content:\n      table:\n        columns: [Location, Kind]\n        minRows: 1\n        extraColumns: error\n        cells:\n          Kind:\n            enum: [add, modify]\n  - section: Criteria\n    content:\n      list:\n        items: checkbox\n        minItems: 2\n  - section: Steps\n    content:\n      list:\n        items:\n          type: string\n          minLength: 5\n",
        )
        .unwrap();
        let Spec::Section(s) = &seq.specs[0] else {
            panic!()
        };
        let opts = s.opts.as_ref().unwrap();
        assert_eq!(opts.anchor.as_deref(), Some("files"));
        let Some(SectionContent::Single(leaf)) = &opts.content else {
            panic!()
        };
        let Some(crate::contract::LeafConfig::Table(t)) = &leaf.config else {
            panic!()
        };
        assert_eq!(t.columns, ["Location", "Kind"]);
        assert_eq!(t.min_rows, Some(1.0));
        assert_eq!(t.extra_columns, ExtraColumns::Error);
        assert_eq!(t.cells.len(), 1);

        let Spec::Section(s) = &seq.specs[1] else {
            panic!()
        };
        let Some(SectionContent::Single(leaf)) = &s.opts.as_ref().unwrap().content else {
            panic!()
        };
        let Some(crate::contract::LeafConfig::List(l)) = &leaf.config else {
            panic!()
        };
        assert!(matches!(l.every_item, Some(EveryItem::Checkbox)));
        assert_eq!(l.min_items, Some(2.0));

        let Spec::Section(s) = &seq.specs[2] else {
            panic!()
        };
        let Some(SectionContent::Single(leaf)) = &s.opts.as_ref().unwrap().content else {
            panic!()
        };
        let Some(crate::contract::LeafConfig::List(l)) = &leaf.config else {
            panic!()
        };
        assert!(matches!(l.every_item, Some(EveryItem::Schema(_))));
    }

    #[test]
    fn descriptions_are_stored_on_levels_nodes_and_leaves() {
        let seq = body(
            "description: the body\nsections:\n  - section: Summary\n    description: one paragraph\n    content:\n      list:\n        minItems: 1\n        description: the checklist\n  - gap: {}\n",
        )
        .unwrap();
        assert_eq!(seq.description.as_deref(), Some("the body"));
        let Spec::Section(s) = &seq.specs[0] else {
            panic!()
        };
        let opts = s.opts.as_ref().unwrap();
        assert_eq!(opts.description.as_deref(), Some("one paragraph"));
        let Some(SectionContent::Single(leaf)) = &opts.content else {
            panic!()
        };
        assert_eq!(leaf.description.as_deref(), Some("the checklist"));
        let Spec::Gap(g) = &seq.specs[1] else {
            panic!()
        };
        assert_eq!(g.description, None);
    }

    #[test]
    fn gap_rejects_description_like_the_ts_compiler() {
        let err = msg(body("sections:\n  - gap: {}\n    description: extras\n"));
        assert!(err.contains("description"), "got: {err}");
    }

    #[test]
    fn section_text_keys_become_node_rules() {
        let seq =
            body("sections:\n  - section: Summary\n    requires:\n      - pattern: outcome\n")
                .unwrap();
        let Spec::Section(s) = &seq.specs[0] else {
            panic!()
        };
        assert_eq!(s.opts.as_ref().unwrap().rules.len(), 1);
    }

    // v1 keys are migration-hint errors; v2 is closed at the node level.
    #[test]
    fn v1_keys_get_migration_hints() {
        assert_eq!(
            msg(body("sections:\n  - section: A\n    optional: true\n")),
            "body.sections[0]: 'optional' is the v1 spelling — mcVersion 2 uses 'minContains: 0, maxContains: 1'"
        );
        assert_eq!(
            msg(body("sections:\n  - section: A\n    repeatable: true\n")),
            "body.sections[0]: 'repeatable' is the v1 spelling — mcVersion 2 uses 'minContains' / 'maxContains'"
        );
        assert_eq!(
            msg(body(
                "sections:\n  - section: A\n    repeatable: true\n    min: 1\n"
            ))
            .split(" — ")
            .count(),
            2
        );
        assert_eq!(
            msg(body(
                "sections:\n  - section: A\n    children:\n      sections: []\n"
            )),
            "body.sections[0]: 'children' is the v1 spelling — mcVersion 2 uses 'sections' (with 'order' / 'additionalSections') directly on the node"
        );
        assert_eq!(
            msg(body("allowUnknown: true\nsections: []\n")),
            "body: 'allowUnknown' is the v1 spelling — mcVersion 2 uses 'additionalSections'"
        );
        assert_eq!(
            msg(body(
                "sections:\n  - section: A\n    content:\n      list:\n        everyItem: checkbox\n"
            )),
            "body.sections[0].content.list: 'everyItem' is the v1 spelling — mcVersion 2 uses 'items'"
        );
    }

    #[test]
    fn unknown_keys_and_grammar_guards_reject() {
        assert_eq!(
            msg(body("sections:\n  - section: A\n    wibble: 1\n")),
            "body.sections[0]: unknown key 'wibble'"
        );
        assert_eq!(
            msg(body("sections:\n  - section: A\n    order: strict\n")),
            "body.sections[0]: 'order' / 'additionalSections' apply to a nested 'sections' list — add 'sections'"
        );
        // key collision among declared names (same guard as v1)
        assert!(
            body("sections:\n  - section: Files to touch\n  - section: Files To Touch\n").is_err()
        );
        // bad order keyword; missing sections list; unknown node
        assert!(body("order: alphabetical\nsections: []\n").is_err());
        assert!(body("order: none\n").is_err());
        assert!(body("sections:\n  - wibble: 1\n").is_err());
    }
}
