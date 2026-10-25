//! The frontmatter plane — YAML value projection, the key-path → source-line index,
//! and schema validation into `frontmatter/*` findings.
//!
//! Mirrors the TS engine's `matchFrontmatter` (in `content.ts`) plus the projection's
//! `buildFrontmatter` / `lineForPath`:
//!
//! - [`yaml_to_json`] projects a parsed YAML value to the JSON shape the TS `yaml`
//!   package's `toJS()` yields (numbers stay numbers, dates stay strings — the YAML 1.2
//!   core schema has no timestamp type — and map keys stringify);
//! - [`line_for_path`] maps an issue path to the source line of its **key** (map) or
//!   **element** (sequence) within the raw frontmatter text, best-effort over block
//!   YAML (a path into a flow collection resolves to no line, dropping the pos);
//! - [`match_frontmatter`] runs the compiled schema over the frontmatter data (over `{}`
//!   when no block is present, so required-key findings still fire) and emits
//!   `frontmatter/enum` / `unknown-key` / `type` / `required` findings with the same id
//!   selection and position attribution as the TS plane.

use std::sync::OnceLock;

use regex::Regex;

use crate::finding::{Finding, SourcePos};
use crate::registry::{Ctx, FindingSpec};
use crate::schema::{
    Issue, IssueKind, PathSeg, Schema, description_along_path, format_key_path, type_name,
};
use crate::tree::{DocTree, YamlError};

// ── YAML → the TS `toJS()` value shape ────────────────────────────────────────────────

/// Project a `serde_yaml::Value` to the `serde_json::Value` the TS `yaml` package's
/// `toJS()` would produce: scalars keep their resolved types (a date-looking plain
/// scalar is already a *string* in both engines — neither resolves timestamps), map
/// keys stringify, and a non-finite float (which JSON cannot carry) becomes `null`.
pub(crate) fn yaml_to_json(v: serde_yaml::Value) -> serde_json::Value {
    match v {
        serde_yaml::Value::Null => serde_json::Value::Null,
        serde_yaml::Value::Bool(b) => serde_json::Value::Bool(b),
        serde_yaml::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                serde_json::Value::Number(i.into())
            } else if let Some(u) = n.as_u64() {
                serde_json::Value::Number(u.into())
            } else {
                n.as_f64()
                    .and_then(serde_json::Number::from_f64)
                    .map_or(serde_json::Value::Null, serde_json::Value::Number)
            }
        }
        serde_yaml::Value::String(s) => serde_json::Value::String(s),
        serde_yaml::Value::Sequence(items) => {
            serde_json::Value::Array(items.into_iter().map(yaml_to_json).collect())
        }
        serde_yaml::Value::Mapping(map) => {
            let mut out = serde_json::Map::new();
            for (k, val) in map {
                out.insert(yaml_key_to_string(&k), yaml_to_json(val));
            }
            serde_json::Value::Object(out)
        }
        serde_yaml::Value::Tagged(t) => yaml_to_json(t.value),
    }
}

/// A mapping key as the string property name `toJS()` would produce.
fn yaml_key_to_string(k: &serde_yaml::Value) -> String {
    match k {
        serde_yaml::Value::String(s) => s.clone(),
        serde_yaml::Value::Bool(b) => b.to_string(),
        serde_yaml::Value::Number(n) => n.to_string(),
        serde_yaml::Value::Null => "null".into(),
        other => serde_yaml::to_string(other)
            .map(|s| s.trim_end().to_string())
            .unwrap_or_default(),
    }
}

// ── The key-path → line index (the TS CST `lineForPath`, over block YAML) ────────────

/// A positioned node of the frontmatter's block-YAML skeleton: enough structure to
/// resolve an issue path to its key's / element's 1-based line within `raw`.
#[derive(Debug)]
enum LineNode {
    Map(Vec<(String, u32, LineNode)>),
    Seq(Vec<(u32, LineNode)>),
    Scalar,
}

/// One content-bearing line of the raw YAML: `(indent, content, 1-based line)`.
type Line = (usize, String, u32);

fn content_lines(raw: &str) -> Vec<Line> {
    raw.lines()
        .enumerate()
        .filter_map(|(i, line)| {
            let line = line.strip_suffix('\r').unwrap_or(line);
            let indent = line.len() - line.trim_start_matches(' ').len();
            let content = line[indent..].to_string();
            if content.is_empty() || content.starts_with('#') {
                return None;
            }
            Some((indent, content, (i + 1) as u32))
        })
        .collect()
}

/// A `key:`-shaped head of a mapping line: the key text and the value remainder.
/// Handles plain and single/double-quoted keys (the frontmatter corpus shapes).
fn split_key(content: &str) -> Option<(String, &str)> {
    let (key_raw, rest) = if let Some(stripped) = content.strip_prefix('"') {
        let end = stripped.find('"')?;
        (
            stripped[..end].to_string(),
            stripped[end + 1..].trim_start(),
        )
    } else if let Some(stripped) = content.strip_prefix('\'') {
        let end = stripped.find('\'')?;
        (
            stripped[..end].to_string(),
            stripped[end + 1..].trim_start(),
        )
    } else {
        let colon = content.find(':')?;
        (content[..colon].trim_end().to_string(), &content[colon..])
    };
    let rest = rest.strip_prefix(':')?;
    if !(rest.is_empty() || rest.starts_with(' ') || rest.starts_with('\t')) {
        return None; // `a:b` with no space is a plain scalar, not a key
    }
    Some((key_raw, rest.trim()))
}

fn is_dash(content: &str) -> bool {
    content == "-" || content.starts_with("- ")
}

/// Advance `idx` past every line indented deeper than `indent`: the continuation
/// lines of a wrapped or block scalar, or of a flow collection.
fn skip_deeper(lines: &[Line], idx: &mut usize, indent: usize) {
    while lines.get(*idx).is_some_and(|(i, _, _)| *i > indent) {
        *idx += 1;
    }
}

/// Parse the lines from `idx` at exactly `indent` into a node (map, seq, or scalar).
fn parse_block(lines: &[Line], idx: &mut usize, indent: usize) -> LineNode {
    let Some((first_indent, first, _)) = lines.get(*idx) else {
        return LineNode::Scalar;
    };
    if *first_indent != indent {
        return LineNode::Scalar;
    }
    if is_dash(first) {
        parse_seq(lines, idx, indent)
    } else if split_key(first).is_some() {
        parse_map(lines, idx, indent)
    } else {
        *idx += 1;
        skip_deeper(lines, idx, indent);
        LineNode::Scalar
    }
}

/// A value that is only an anchor (`&a`) or a tag (`!t`): the node itself follows on
/// the next lines.
fn is_node_property(value: &str) -> bool {
    (value.starts_with('&') || value.starts_with('!')) && !value.contains(char::is_whitespace)
}

fn parse_map(lines: &[Line], idx: &mut usize, indent: usize) -> LineNode {
    let mut pairs = Vec::new();
    while let Some((line_indent, content, lineno)) = lines.get(*idx) {
        if *line_indent != indent {
            break;
        }
        let Some((key, value)) = split_key(content) else {
            break;
        };
        let lineno = *lineno;
        *idx += 1;
        let child = if value.is_empty() || is_node_property(value) {
            // The value is the following deeper block, or a sequence whose dashes sit
            // at the key's own indent (YAML permits both).
            match lines.get(*idx) {
                Some((i, _, _)) if *i > indent => parse_block(lines, idx, *i),
                Some((i, c, _)) if *i == indent && is_dash(c) => parse_seq(lines, idx, indent),
                _ => LineNode::Scalar,
            }
        } else {
            // An inline value. A wrapped plain scalar, a block scalar or a multi-line
            // flow collection continues on deeper lines.
            skip_deeper(lines, idx, indent);
            LineNode::Scalar
        };
        pairs.push((key, lineno, child));
    }
    LineNode::Map(pairs)
}

fn parse_seq(lines: &[Line], idx: &mut usize, indent: usize) -> LineNode {
    let mut items = Vec::new();
    while let Some((line_indent, content, lineno)) = lines.get(*idx) {
        if *line_indent != indent || !is_dash(content) {
            break;
        }
        let lineno = *lineno;
        let rest = content[1..].trim_start().to_string();
        *idx += 1;
        if rest.is_empty() {
            let child = match lines.get(*idx) {
                Some((i, _, _)) if *i > indent => parse_block(lines, idx, *i),
                _ => LineNode::Scalar,
            };
            items.push((lineno, child));
        } else if split_key(&rest).is_some() {
            // A compact `- key: value` map: re-parse the remainder as a map whose
            // first pair sits on this line at the dash-adjusted indent.
            let inner_indent = line_indent + (content.len() - rest.len());
            let mut virt: Vec<Line> = vec![(inner_indent, rest, lineno)];
            while lines.get(*idx).is_some_and(|(i, _, _)| *i >= inner_indent) {
                virt.push(lines[*idx].clone());
                *idx += 1;
            }
            let mut vidx = 0;
            items.push((lineno, parse_map(&virt, &mut vidx, inner_indent)));
        } else {
            skip_deeper(lines, idx, indent);
            items.push((lineno, LineNode::Scalar));
        }
    }
    LineNode::Seq(items)
}

fn line_tree(raw: &str) -> Option<LineNode> {
    let lines = content_lines(raw);
    let root_indent = lines.first().map(|(i, _, _)| *i)?;
    Some(parse_block(&lines, &mut 0, root_indent))
}

/// The 1-based line within `raw` of the key / element `path` addresses, or `None` when
/// the path does not resolve (a missing key, or a flow collection this best-effort
/// block index does not see into).
pub(crate) fn line_for_path(raw: &str, path: &[PathSeg]) -> Option<u32> {
    let root = line_tree(raw)?;
    let mut node = &root;
    let mut line: Option<u32> = None;
    for seg in path {
        match (node, seg) {
            (LineNode::Map(pairs), PathSeg::Key(k)) => {
                let (_, l, child) = pairs.iter().find(|(key, _, _)| key == k)?;
                line = Some(*l);
                node = child;
            }
            (LineNode::Seq(items), PathSeg::Index(i)) => {
                let (l, child) = items.get(*i)?;
                line = Some(*l);
                node = child;
            }
            _ => return None,
        }
    }
    line
}

/// The line of the first repeated key in any block mapping, which the TS `yaml`
/// package reports as `DUPLICATE_KEY`.
fn duplicate_key_line(node: &LineNode) -> Option<u32> {
    let mut best: Option<u32> = None;
    let mut keep = |l: Option<u32>| {
        if let Some(l) = l {
            best = Some(best.map_or(l, |b| b.min(l)));
        }
    };
    match node {
        LineNode::Map(pairs) => {
            for (i, (key, line, child)) in pairs.iter().enumerate() {
                if pairs[..i].iter().any(|(k, _, _)| k == key) {
                    keep(Some(*line));
                }
                keep(duplicate_key_line(child));
            }
        }
        LineNode::Seq(items) => {
            for (_, child) in items {
                keep(duplicate_key_line(child));
            }
        }
        LineNode::Scalar => {}
    }
    best
}

fn location_suffix() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r" at line \d+ column \d+").expect("static regex"))
}

/// The `frontmatter/yaml` error for a block serde_yaml rejected: its line within
/// `raw` and its message. The line is serde_yaml's, except for a duplicate key, which
/// is placed on the repeated key as the TS engine does.
pub(crate) fn yaml_error(raw: &str, err: &serde_yaml::Error) -> YamlError {
    let message = location_suffix()
        .replace_all(&err.to_string(), "")
        .into_owned();
    let last_line = raw.lines().count().max(1) as u32;
    let mut line = err.location().map_or(1, |l| l.line() as u32);
    if message.starts_with("duplicate entry")
        && let Some(dup) = line_tree(raw).as_ref().and_then(duplicate_key_line)
    {
        line = dup;
    }
    YamlError {
        line: line.clamp(1, last_line),
        message,
    }
}

// ── Issue → finding mapping (the TS `frontmatterIdFor` / `frontmatterMessage`) ───────

/// The value addressed by `path` within `data` (`None` when any segment is absent) —
/// the TS `valueAt`.
fn value_at<'a>(
    data: Option<&'a serde_json::Value>,
    path: &[PathSeg],
) -> Option<&'a serde_json::Value> {
    let mut node = data?;
    for seg in path {
        node = match (node, seg) {
            (serde_json::Value::Object(map), PathSeg::Key(k)) => map.get(k)?,
            (serde_json::Value::Array(items), PathSeg::Index(i)) => items.get(*i)?,
            _ => return None,
        };
    }
    Some(node)
}

/// Map an issue kind to its `frontmatter/*` finding id (enum / unknown-key / type;
/// required is resolved by the caller from the missing-value check).
fn frontmatter_id_for(kind: &IssueKind) -> &'static str {
    match kind {
        IssueKind::InvalidValue { .. } => "frontmatter/enum",
        IssueKind::UnrecognizedKeys { .. } => "frontmatter/unknown-key",
        _ => "frontmatter/type",
    }
}

/// Build the field-qualified message for a frontmatter issue — every message leads with
/// `frontmatter field '<key>'` so the report names exactly what to fix (the TS
/// `frontmatterMessage`).
fn frontmatter_message(issue: &Issue, id: &str, data: Option<&serde_json::Value>) -> String {
    let field = format_key_path(&issue.path);
    let at = if field.is_empty() {
        "frontmatter".to_string()
    } else {
        format!("frontmatter field ‘{field}’")
    };
    if id == "frontmatter/required" {
        return format!("{at} is required");
    }
    match &issue.kind {
        IssueKind::InvalidValue { values } => match values.len() {
            0 => format!("{at} has an invalid value"),
            1 => format!("{at} must be ‘{}’", values[0]),
            _ => format!(
                "{at} must be one of {}",
                values
                    .iter()
                    .map(|v| format!("‘{v}’"))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        },
        IssueKind::InvalidType { expected } => {
            let got = type_name(value_at(data, &issue.path));
            format!("{at} must be a {expected} (got {got})")
        }
        IssueKind::InvalidFormat { format } if format != "regex" => {
            format!("{at} is not a valid {format}")
        }
        IssueKind::InvalidFormat { .. } => format!("{at} does not match the required pattern"),
        IssueKind::TooSmall => format!("{at} is too small"),
        IssueKind::TooBig => format!("{at} is too large"),
        IssueKind::UnrecognizedKeys { .. } => format!("{at} carries unknown keys"),
    }
}

/// Report a frontmatter block whose YAML does not parse as `frontmatter/yaml`, on the
/// error's line. Returns true when the YAML parsed. The finding has no hint: the TS
/// engine reports it outside every `description` scope.
pub(crate) fn match_frontmatter_yaml(tree: &DocTree, ctx: &Ctx, out: &mut Vec<Finding>) -> bool {
    let Some(fm) = &tree.frontmatter else {
        return true;
    };
    let Some(err) = &fm.yaml_error else {
        return true;
    };
    out.push(
        ctx.finding(
            FindingSpec::new(
                "frontmatter/yaml",
                format!("frontmatter is not valid YAML: {}", err.message),
            )
            .pos(SourcePos::line(fm.pos.line + err.line)),
        ),
    );
    false
}

/// Validate the document frontmatter against the compiled schema, remapping each issue
/// to its key's source line. A strict-object rejection fans out to one
/// `frontmatter/unknown-key` per offending key; a missing required key surfaces as
/// `frontmatter/required`. When no frontmatter block is present the schema runs over
/// `{}` so required-key findings still fire (document-level, no pos).
pub(crate) fn match_frontmatter(
    tree: &DocTree,
    schema: &Schema,
    ctx: &Ctx,
    out: &mut Vec<Finding>,
) {
    let empty = serde_json::Value::Object(serde_json::Map::new());
    let data: Option<&serde_json::Value> = match &tree.frontmatter {
        Some(fm) => fm.data.as_ref(),
        None => Some(&empty),
    };
    let Err(issues) = schema.safe_parse(data) else {
        return;
    };

    let line_for = |path: &[PathSeg]| -> Option<SourcePos> {
        let fm = tree.frontmatter.as_ref()?;
        if path.is_empty() {
            // The block itself → its first key line (opening fence + 1).
            return Some(SourcePos::line(fm.pos.line + 1));
        }
        line_for_path(&fm.raw, path).map(|l| SourcePos::line(fm.pos.line + l))
    };

    for issue in &issues {
        if let IssueKind::UnrecognizedKeys { keys } = &issue.kind {
            // Each offending key becomes its own unknown-key finding at that key's line.
            for key in keys {
                let mut path = issue.path.clone();
                path.push(PathSeg::Key(key.clone()));
                let mut spec = FindingSpec::new(
                    "frontmatter/unknown-key",
                    format!("unknown frontmatter key ‘{key}’"),
                )
                .hint_opt(description_along_path(schema, &path));
                if let Some(pos) = line_for(&path) {
                    spec = spec.pos(pos);
                }
                out.push(ctx.finding(spec));
            }
            continue;
        }

        // A missing required key reads as an invalid_type whose input is undefined.
        let missing = matches!(issue.kind, IssueKind::InvalidType { .. })
            && value_at(data, &issue.path).is_none();
        let id = if missing {
            "frontmatter/required"
        } else {
            frontmatter_id_for(&issue.kind)
        };
        // The failing field's stored description (nearest along the issue path) is the
        // finding's hint; the contract-root fallback is `validate`'s.
        let mut spec = FindingSpec::new(id, frontmatter_message(issue, id, data))
            .hint_opt(description_along_path(schema, &issue.path));
        if let Some(pos) = line_for(&issue.path) {
            spec = spec.pos(pos);
        }
        out.push(ctx.finding(spec));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse_document;
    use crate::registry::Registry;
    use crate::schema::ConstValue;
    use serde_json::json;

    // Contract first: the exact toJS shapes — numbers stay numbers, a date-looking
    // scalar stays a STRING (YAML 1.2 core has no timestamp), keys stringify.
    #[test]
    fn yaml_projects_to_the_ts_tojs_value_shape() {
        let v: serde_yaml::Value =
            serde_yaml::from_str("id: D-0001\ncount: 3\nratio: 1.5\nwhen: 2024-01-02\nflag: true\nnothing: null\nrelated: [a, b]").unwrap();
        assert_eq!(
            yaml_to_json(v),
            json!({
                "id": "D-0001",
                "count": 3,
                "ratio": 1.5,
                "when": "2024-01-02",
                "flag": true,
                "nothing": null,
                "related": ["a", "b"],
            })
        );
    }

    #[test]
    fn lines_after_a_wrapped_value_and_an_anchor_resolve() {
        let raw = "summary: a summary that\n  wraps onto a second line\ncount: three\nowner: &o\n  id: seven\n";
        let key = |k: &str| PathSeg::Key(k.into());
        assert_eq!(line_for_path(raw, &[key("count")]), Some(3));
        assert_eq!(line_for_path(raw, &[key("owner"), key("id")]), Some(5));
        let block = "notes: |\n  one\n  two\nafter: 1\n";
        assert_eq!(line_for_path(block, &[key("after")]), Some(4));
    }

    #[test]
    fn yaml_errors_carry_a_line_and_a_message_without_the_location() {
        let err = |raw: &str| {
            let e = serde_yaml::from_str::<serde_yaml::Value>(raw).unwrap_err();
            yaml_error(raw, &e)
        };
        // A duplicate key is placed on the repeat, as the TS `yaml` package does.
        let dup = err("title: a\nowner: b\ntitle: c\n");
        assert_eq!(dup.line, 3);
        assert!(!dup.message.contains(" at line "));
        assert_eq!(err("title: 'unclosed\n").line, 1);
        assert_eq!(err("a:\n\tb: 1\n").line, 2);
    }

    #[test]
    fn line_for_path_resolves_top_level_nested_and_sequence_paths() {
        let raw = "id: D-0001\nnested:\n  b: 2\nrelated:\n  - first\n  - second\n";
        let key = |k: &str| PathSeg::Key(k.to_string());
        assert_eq!(line_for_path(raw, &[key("id")]), Some(1));
        assert_eq!(line_for_path(raw, &[key("nested")]), Some(2));
        assert_eq!(line_for_path(raw, &[key("nested"), key("b")]), Some(3));
        assert_eq!(
            line_for_path(raw, &[key("related"), PathSeg::Index(1)]),
            Some(6)
        );
        assert_eq!(line_for_path(raw, &[key("absent")]), None);
    }

    fn run(source: &str, schema: &Schema) -> Vec<Finding> {
        let tree = parse_document(source);
        let registry = Registry::default();
        let ctx = Ctx::new("doc.md", &registry);
        let mut out = Vec::new();
        match_frontmatter(&tree, schema, &ctx, &mut out);
        out
    }

    fn decision_schema() -> Schema {
        Schema::Object {
            fields: vec![
                (
                    "id".into(),
                    Schema::String {
                        min: None,
                        max: None,
                        pattern: None,
                    },
                ),
                (
                    "status".into(),
                    Schema::Enum(vec!["open/proposed".into(), "open/accepted".into()]),
                ),
            ],
            strict: true,
        }
    }

    // The 07a shape: a bad enum pins its key's document line; the unknown key fans out.
    #[test]
    fn enum_violation_and_unknown_key_pin_their_key_lines() {
        let out = run(
            "---\nid: D-0001\nstatus: open/draft\nfoo: bar\n---\n\nbody\n",
            &decision_schema(),
        );
        assert_eq!(
            out.iter()
                .map(|f| (f.id.as_str(), f.pos.map(|p| p.line)))
                .collect::<Vec<_>>(),
            vec![
                ("frontmatter/enum", Some(3)),
                ("frontmatter/unknown-key", Some(4)),
            ]
        );
        assert_eq!(
            out[0].message,
            "frontmatter field ‘status’ must be one of ‘open/proposed’, ‘open/accepted’"
        );
    }

    // No frontmatter block: the schema runs over {} and missing keys fire pos-less.
    // A missing typed key is `required` (an invalid_type over undefined); a missing
    // ENUM key stays `frontmatter/enum` — zod reports an enum miss as invalid_value
    // whatever the input, and the TS plane maps ids off the issue code.
    #[test]
    fn missing_frontmatter_reports_missing_keys_document_level() {
        let out = run("## Overview\n\nprose\n", &decision_schema());
        assert_eq!(
            out.iter()
                .map(|f| (f.id.as_str(), f.pos))
                .collect::<Vec<_>>(),
            vec![("frontmatter/required", None), ("frontmatter/enum", None)]
        );
        assert_eq!(out[0].message, "frontmatter field ‘id’ is required");
    }

    #[test]
    fn wrong_type_names_expected_and_actual() {
        let schema = Schema::Object {
            fields: vec![(
                "title".into(),
                Schema::String {
                    min: None,
                    max: None,
                    pattern: None,
                },
            )],
            strict: false,
        };
        let out = run("---\ntitle: 7\n---\n\nbody\n", &schema);
        assert_eq!(out[0].id, "frontmatter/type");
        assert_eq!(
            out[0].message,
            "frontmatter field ‘title’ must be a string (got number)"
        );
        assert_eq!(out[0].pos.map(|p| p.line), Some(2));
    }

    #[test]
    fn const_mismatch_is_an_enum_finding_with_the_literal() {
        let schema = Schema::Object {
            fields: vec![("v".into(), Schema::Const(ConstValue::Number(1.0)))],
            strict: false,
        };
        let out = run("---\nv: 2\n---\n\nbody\n", &schema);
        assert_eq!(out[0].id, "frontmatter/enum");
        assert_eq!(out[0].message, "frontmatter field ‘v’ must be ‘1’");
    }
}
