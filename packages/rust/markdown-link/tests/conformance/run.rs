//! What this crate gives for one case of the markdown-link conformance suite,
//! `packages/conformance/markdown-link/suite.json`.
//!
//! Shared by the generator (`write.rs`, which writes every `expect` from it)
//! and the runner (`tests/conformance.rs`, which checks every `expect` against
//! it). Both include it with `#[path]`, so it is not a test of its own.
//!
//! Offsets in the suite count characters, so neither twin's own unit (bytes
//! here, UTF-16 code units in TypeScript) leaks into it.

use markdown_link::code::{CodeRules, code_ranges, strip_code_with};
use markdown_link::{
    AbandonReason, BodyLinkKind, LinkKind, ScanOptions, Size, body_links, body_links_spanned,
    body_links_spanned_with, display_text, is_vault_link_url, md_link_target, parse_inner,
    parse_typed_ref, scan_body_with, target_range,
};
use serde_json::{Map, Value, json};

/// Path of the suite, from the crate's directory.
pub const SUITE_PATH: &str = "../../conformance/markdown-link/suite.json";

/// The sections this crate runs. A section not listed here fails the runner.
pub const SECTIONS: [&str; 6] = ["code", "inner", "url", "body", "display", "typed_ref"];

/// The keys a case may have. Any other fails both the runner and the generator.
pub const CASE_KEYS: [&str; 3] = ["name", "input", "expect"];

/// The `expect` this crate gives for `input` in `section`, or why the input
/// cannot be run.
pub fn run(section: &str, input: &Value) -> Result<Value, String> {
    match section {
        "code" => {
            let i = fields(input, &["source"], &[])?;
            let source = text(i, "source")?;
            let commonmark = strip_code_with(source, CodeRules::CommonMark);
            let skill_export = strip_code_with(source, CodeRules::SkillExport);
            for (rules, out) in [("commonmark", &commonmark), ("skill-export", &skill_export)] {
                if out.chars().count() != source.chars().count() {
                    return Err(format!("{rules} changed the character count"));
                }
            }
            let ranges: Vec<Value> = code_ranges(source, CodeRules::CommonMark)
                .into_iter()
                .map(|range| {
                    json!([
                        chars_before(source, range.start),
                        chars_before(source, range.end)
                    ])
                })
                .collect();
            Ok(json!({ "commonmark": commonmark, "skill_export": skill_export, "ranges": ranges }))
        }
        "inner" => {
            let i = fields(input, &["inner"], &["embed"])?;
            let inner = text(i, "inner")?;
            let embed = flag(i, "embed")?;
            Ok(parse_inner(inner, embed).map_or(Value::Null, |link| {
                let range = target_range(inner).expect("parse_inner found a target");
                let mut out = json!({
                    "target": link.target,
                    "heading": link.heading,
                    "alias": link.alias,
                    "target_at": chars_before(inner, range.start),
                });
                if link.block.is_some() {
                    out["block"] = json!(link.block);
                }
                if link.size.is_some() {
                    out["size"] = size_json(link.size);
                }
                out
            }))
        }
        "url" => {
            let i = fields(input, &["url"], &[])?;
            let url = text(i, "url")?;
            Ok(json!({ "vault_link": is_vault_link_url(url), "target": md_link_target(url) }))
        }
        "body" => {
            let i = fields(input, &["body"], &["options"])?;
            body(text(i, "body")?, scan_options(i)?)
        }
        "display" => {
            let i = fields(input, &["text"], &[])?;
            Ok(json!({ "display": display_text(text(i, "text")?) }))
        }
        "typed_ref" => {
            let i = fields(input, &["value"], &[])?;
            Ok(match parse_typed_ref(text(i, "value")?) {
                Some(r) => json!({ "kind": r.kind, "slug": r.slug, "alias": r.alias }),
                None => Value::Null,
            })
        }
        _ => Err(format!("unknown section {section}")),
    }
}

fn body(body: &str, options: Option<ScanOptions>) -> Result<Value, String> {
    let spanned = match &options {
        Some(options) => body_links_spanned_with(body, options),
        None => body_links_spanned(body),
    };
    let links: Vec<Value> = spanned
        .iter()
        .map(|link| {
            let kind = match link.kind {
                BodyLinkKind::Wikilink => "wikilink",
                BodyLinkKind::Embed => "embed",
                BodyLinkKind::Markdown => "markdown",
            };
            let mut out = json!({
                "kind": kind,
                "raw": link.raw,
                "target": link.target,
                "alias": link.alias,
                "at": chars_before(body, link.byte_start),
                "text": &body[link.byte_start..link.byte_end],
            });
            if link.heading.is_some() {
                out["heading"] = json!(link.heading);
            }
            if link.block.is_some() {
                out["block"] = json!(link.block);
            }
            if link.size.is_some() {
                out["size"] = size_json(link.size);
            }
            out
        })
        .collect();
    let scan = scan_body_with(body, &options.unwrap_or_default());
    if scan.links != spanned {
        return Err("scan_body_with's links differ from body_links_spanned_with's".into());
    }
    let abandoned: Vec<Value> = scan
        .abandoned
        .iter()
        .map(|a| {
            let reason = match a.reason {
                AbandonReason::Bracket => "bracket",
                AbandonReason::Code => "code",
                AbandonReason::EmptyTarget => "empty-target",
                AbandonReason::Unclosed => "unclosed",
            };
            let mut out = json!({
                "reason": reason,
                "at": chars_before(body, a.byte_start),
                "text": &body[a.byte_start..a.byte_end],
            });
            if a.embed {
                out["embed"] = Value::Bool(true);
            }
            out
        })
        .collect();
    if options.is_none() {
        let plain: Vec<(String, LinkKind)> = body_links(body)
            .into_iter()
            .map(|link| (link.target, link.kind))
            .collect();
        let folded: Vec<(String, LinkKind)> = spanned
            .into_iter()
            .map(|link| {
                let kind = match link.kind {
                    BodyLinkKind::Embed => LinkKind::Embed,
                    BodyLinkKind::Wikilink | BodyLinkKind::Markdown => LinkKind::Wikilink,
                };
                (link.target, kind)
            })
            .collect();
        if plain != folded {
            return Err("body_links disagrees with body_links_spanned".into());
        }
    }
    Ok(json!({ "links": links, "abandoned": abandoned }))
}

fn scan_options(input: &Map<String, Value>) -> Result<Option<ScanOptions>, String> {
    let Some(options) = input.get("options") else {
        return Ok(None);
    };
    let options = fields(
        options,
        &[],
        &["code_rules", "skip_html_comments", "self_links"],
    )?;
    Ok(Some(ScanOptions {
        code_rules: match options.get("code_rules").map(Value::as_str) {
            None | Some(Some("commonmark")) => CodeRules::CommonMark,
            Some(Some("skill-export")) => CodeRules::SkillExport,
            Some(Some("none")) => CodeRules::None,
            Some(_) => return Err("code_rules is not commonmark, skill-export or none".into()),
        },
        skip_html_comments: flag(options, "skip_html_comments")?,
        self_links: flag(options, "self_links")?,
    }))
}

fn size_json(size: Option<Size>) -> Value {
    match size {
        Some(size) => json!({ "width": size.width, "height": size.height }),
        None => Value::Null,
    }
}

/// The number of characters in `text` before byte `at`.
fn chars_before(text: &str, at: usize) -> usize {
    text[..at].chars().count()
}

/// `input` as an object whose keys are `required` and, optionally, `optional`.
pub fn fields<'a>(
    input: &'a Value,
    required: &[&str],
    optional: &[&str],
) -> Result<&'a Map<String, Value>, String> {
    let map = input.as_object().ok_or("input is not an object")?;
    for k in map.keys() {
        if !required.contains(&k.as_str()) && !optional.contains(&k.as_str()) {
            return Err(format!("input has an unknown key {k}"));
        }
    }
    for k in required {
        if !map.contains_key(*k) {
            return Err(format!("input has no {k}"));
        }
    }
    Ok(map)
}

/// The string at `key`.
pub fn text<'a>(map: &'a Map<String, Value>, key: &str) -> Result<&'a str, String> {
    map.get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{key} is not a string"))
}

/// The boolean at `key`, false when left out.
fn flag(map: &Map<String, Value>, key: &str) -> Result<bool, String> {
    match map.get(key) {
        None => Ok(false),
        Some(Value::Bool(b)) => Ok(*b),
        Some(_) => Err(format!("{key} is not a boolean")),
    }
}
