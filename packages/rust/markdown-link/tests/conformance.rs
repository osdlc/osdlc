//! The shared case file, `tests/fixtures/conformance.json`.
//!
//! The file is language-neutral so the TypeScript twin can read the same
//! cases. It has one section per concern. `code` pins what counts as code:
//! each case is `{ name, source, stripped, strippedSkillExport? }`, where
//! `stripped` is [`strip_code`]'s output for `source` and
//! `strippedSkillExport` is the output under [`CodeRules::SkillExport`] when
//! it differs. An optional `note` says where an answer departs from CommonMark.
//!
//! `parse` pins the link parsers. Each case names one input:
//!
//! - `inner`, a wikilink body, with `parsed`: [`parse_inner`]'s target,
//!   heading and alias, and `targetAt`, where [`target_range`] starts, or
//!   `null` when there is no target. `embed: true` parses it as an embed.
//!   `parsed` may also hold `block` and `size` (`{ width, height }`); a key
//!   left out means `null`.
//! - `url`, a markdown link URL, with `vaultLink` ([`is_vault_link_url`]) and
//!   `target` ([`md_link_target`]).
//! - `body`, with `links`: [`body_links_spanned`]'s links, each with `at`, the
//!   start of its span, and `text`, the source it spans. A link may also hold
//!   `heading`, `block` and `size`; a key left out means `null`. With
//!   `options` (`{ codeRules, skipHtmlComments, selfLinks }`, each optional)
//!   the scan is [`body_links_spanned_with`]; without, [`body_links`] must
//!   agree with the links too. `abandoned` lists each `[[` the scan gave up
//!   on ([`scan_body_with`]), as `{ reason, at, text }`, with `embed: true`
//!   for one after a `!`. `reason` is `bracket`, `code`, `empty-target` or
//!   `unclosed`. A case that leaves `abandoned` out expects none.
//!
//! `display` pins [`display_text`]: each case is `{ name, text, display }`.
//!
//! `typedRef` pins [`parse_typed_ref`]: each case is `{ name, value,
//! typedRef }`, where `typedRef` is `{ kind, slug, alias }` or `null`.
//!
//! Offsets in the case file count characters, so neither twin's own unit
//! (bytes here, UTF-16 code units in TypeScript) leaks into it.

use markdown_link::code::{CodeRules, strip_code_with};
use markdown_link::{
    AbandonReason, BodyLinkKind, LinkKind, ScanOptions, Size, body_links, body_links_spanned,
    body_links_spanned_with, display_text, is_vault_link_url, md_link_target, parse_inner,
    parse_typed_ref, scan_body_with, strip_code, target_range,
};
use serde_json::Value as Json;

const CASES: &str = include_str!("fixtures/conformance.json");

fn section(name: &str) -> Vec<Json> {
    let root: Json = serde_json::from_str(CASES).expect("conformance.json is valid JSON");
    let cases = root
        .get(name)
        .and_then(Json::as_array)
        .unwrap_or_else(|| panic!("conformance.json has no {name:?} array"));
    assert!(!cases.is_empty(), "the {name:?} section is empty");
    cases.clone()
}

fn field<'a>(case: &'a Json, key: &str) -> &'a str {
    case.get(key)
        .and_then(Json::as_str)
        .unwrap_or_else(|| panic!("case field {key:?} must be a string: {case}"))
}

/// Every `code` case, one test, so a failure lists every case that drifted.
#[test]
fn code_cases() {
    let mut failures = Vec::new();
    for case in section("code") {
        let name = field(&case, "name");
        let source = field(&case, "source");
        let commonmark = field(&case, "stripped");
        let skill_export = case
            .get("strippedSkillExport")
            .map_or(commonmark, |_| field(&case, "strippedSkillExport"));
        for (rules, expected, actual) in [
            (CodeRules::CommonMark, commonmark, strip_code(source)),
            (
                CodeRules::SkillExport,
                skill_export,
                strip_code_with(source, CodeRules::SkillExport),
            ),
        ] {
            if actual != expected {
                failures.push(format!(
                    "  [{name}] {rules:?}\n    expected {expected:?}\n    actual   {actual:?}"
                ));
            }
            if actual.chars().count() != source.chars().count() {
                failures.push(format!("  [{name}] {rules:?} char count changed"));
            }
        }
    }
    assert!(
        failures.is_empty(),
        "code case failures:\n{}",
        failures.join("\n")
    );
}

fn size_json(size: Option<Size>) -> Json {
    match size {
        Some(size) => serde_json::json!({ "width": size.width, "height": size.height }),
        None => Json::Null,
    }
}

/// Adds `key` to `actual` when the expected case names it or the value is
/// not null, so a case that leaves an optional key out still pins it to null.
fn optional(actual: &mut Json, expected: &Json, key: &str, value: Json) {
    if expected.get(key).is_some() || !value.is_null() {
        actual[key] = value;
    }
}

fn scan_options(case: &Json) -> Option<ScanOptions> {
    let options = case.get("options")?;
    let flag = |key: &str| options.get(key).and_then(Json::as_bool).unwrap_or(false);
    Some(ScanOptions {
        code_rules: match options.get("codeRules").and_then(Json::as_str) {
            None | Some("commonmark") => CodeRules::CommonMark,
            Some("skill-export") => CodeRules::SkillExport,
            Some(other) => panic!("unknown codeRules {other:?}"),
        },
        skip_html_comments: flag("skipHtmlComments"),
        self_links: flag("selfLinks"),
    })
}

/// The number of characters in `text` before byte `at`.
fn chars_before(text: &str, at: usize) -> usize {
    text[..at].chars().count()
}

fn inner_failures(name: &str, inner: &str, case: &Json) -> Vec<String> {
    let parsed = &case["parsed"];
    let embed = case.get("embed").and_then(Json::as_bool).unwrap_or(false);
    let actual = parse_inner(inner, embed).map(|link| {
        let range = target_range(inner).expect("parse_inner found a target");
        let mut actual = serde_json::json!({
            "target": link.target,
            "heading": link.heading,
            "alias": link.alias,
            "targetAt": chars_before(inner, range.start),
        });
        optional(&mut actual, parsed, "block", opt_str(link.block));
        optional(&mut actual, parsed, "size", size_json(link.size));
        actual
    });
    let actual = actual.unwrap_or(Json::Null);
    if actual == *parsed {
        Vec::new()
    } else {
        vec![format!(
            "  [{name}] parse_inner\n    expected {parsed}\n    actual   {actual}"
        )]
    }
}

fn url_failures(name: &str, url: &str, case: &Json) -> Vec<String> {
    let mut failures = Vec::new();
    let vault = case["vaultLink"].as_bool().expect("vaultLink is a bool");
    if is_vault_link_url(url) != vault {
        failures.push(format!("  [{name}] is_vault_link_url should be {vault}"));
    }
    let target = field(case, "target");
    let actual = md_link_target(url);
    if actual != target {
        failures.push(format!(
            "  [{name}] md_link_target\n    expected {target:?}\n    actual   {actual:?}"
        ));
    }
    failures
}

fn body_failures(name: &str, body: &str, case: &Json) -> Vec<String> {
    let mut failures = Vec::new();
    let expected = case["links"].as_array().expect("links is an array");
    let options = scan_options(case);
    let spanned = match &options {
        Some(options) => body_links_spanned_with(body, options),
        None => body_links_spanned(body),
    };
    let actual: Vec<Json> = spanned
        .iter()
        .enumerate()
        .map(|(n, link)| {
            let kind = match link.kind {
                BodyLinkKind::Wikilink => "wikilink",
                BodyLinkKind::Embed => "embed",
                BodyLinkKind::Markdown => "markdown",
            };
            let mut actual = serde_json::json!({
                "kind": kind,
                "raw": link.raw,
                "target": link.target,
                "alias": link.alias,
                "at": chars_before(body, link.byte_start),
                "text": &body[link.byte_start..link.byte_end],
            });
            let want = expected.get(n).unwrap_or(&Json::Null);
            optional(&mut actual, want, "heading", opt_str(link.heading.clone()));
            optional(&mut actual, want, "block", opt_str(link.block.clone()));
            optional(&mut actual, want, "size", size_json(link.size));
            actual
        })
        .collect();
    if actual != *expected {
        failures.push(format!(
            "  [{name}] body_links_spanned\n    expected {}\n    actual   {}",
            Json::Array(expected.clone()),
            Json::Array(actual)
        ));
    }
    let scan = scan_body_with(body, &options.unwrap_or_default());
    if scan.links != spanned {
        failures.push(format!("  [{name}] scan_body_with's links differ"));
    }
    let expected = case.get("abandoned").map_or_else(Vec::new, |a| {
        a.as_array().expect("abandoned is an array").clone()
    });
    let actual: Vec<Json> = scan
        .abandoned
        .iter()
        .map(|a| {
            let reason = match a.reason {
                AbandonReason::Bracket => "bracket",
                AbandonReason::Code => "code",
                AbandonReason::EmptyTarget => "empty-target",
                AbandonReason::Unclosed => "unclosed",
            };
            let mut actual = serde_json::json!({
                "reason": reason,
                "at": chars_before(body, a.byte_start),
                "text": &body[a.byte_start..a.byte_end],
            });
            if a.embed {
                actual["embed"] = Json::Bool(true);
            }
            actual
        })
        .collect();
    if actual != expected {
        failures.push(format!(
            "  [{name}] scan_body_with abandoned\n    expected {}\n    actual   {}",
            Json::Array(expected),
            Json::Array(actual)
        ));
    }
    if options.is_some() {
        return failures;
    }
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
        failures.push(format!(
            "  [{name}] body_links disagrees with body_links_spanned"
        ));
    }
    failures
}

/// Every `parse` case, one test, so a failure lists every case that drifted.
#[test]
fn parse_cases() {
    let mut failures = Vec::new();
    for case in section("parse") {
        let name = field(&case, "name");
        if let Some(inner) = case.get("inner") {
            let inner = inner.as_str().expect("inner is a string");
            failures.extend(inner_failures(name, inner, &case));
        } else if let Some(url) = case.get("url") {
            let url = url.as_str().expect("url is a string");
            failures.extend(url_failures(name, url, &case));
        } else {
            failures.extend(body_failures(name, field(&case, "body"), &case));
        }
    }
    assert!(
        failures.is_empty(),
        "parse case failures:\n{}",
        failures.join("\n")
    );
}

/// Every `display` case, one test.
#[test]
fn display_cases() {
    let failures: Vec<String> = section("display")
        .iter()
        .filter_map(|case| {
            let (name, text) = (field(case, "name"), field(case, "text"));
            let expected = field(case, "display");
            let actual = display_text(text);
            (actual != expected)
                .then(|| format!("  [{name}]\n    expected {expected:?}\n    actual   {actual:?}"))
        })
        .collect();
    assert!(
        failures.is_empty(),
        "display case failures:\n{}",
        failures.join("\n")
    );
}

/// Every `typedRef` case, one test.
#[test]
fn typed_ref_cases() {
    let failures: Vec<String> = section("typedRef")
        .iter()
        .filter_map(|case| {
            let (name, value) = (field(case, "name"), field(case, "value"));
            let expected = &case["typedRef"];
            let actual = match parse_typed_ref(value) {
                Some(r) => serde_json::json!({ "kind": r.kind, "slug": r.slug, "alias": r.alias }),
                None => Json::Null,
            };
            (actual != *expected)
                .then(|| format!("  [{name}]\n    expected {expected}\n    actual   {actual}"))
        })
        .collect();
    assert!(
        failures.is_empty(),
        "typedRef case failures:\n{}",
        failures.join("\n")
    );
}

/// An optional string as JSON. Spelled out because `From<Option<T>>` for
/// `serde_json::Value` is newer than the oldest serde_json this crate allows.
fn opt_str(value: Option<String>) -> serde_json::Value {
    value.map_or(serde_json::Value::Null, serde_json::Value::String)
}
