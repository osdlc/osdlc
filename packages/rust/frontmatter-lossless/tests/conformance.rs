//! Runs the frontmatter-lossless conformance suite,
//! `packages/conformance/frontmatter-lossless/suite.json`.
//!
//! The suite holds the cases this crate and the TypeScript
//! `@osdlc/frontmatter-lossless` package must agree on: BOM, CRLF, empty and
//! unterminated blocks, byte offsets, the lenient split, and composing new
//! text into a shape. This crate is the family's reference: its generator,
//! `tests/conformance/write.rs`, writes every `expect` from
//! `tests/conformance/run.rs`, which this test shares. Every section and case
//! runs here. A missing section, a case with no name, and a section, case
//! key or input key this test does not know all fail it.
//!
//! On top of the stored values it checks the properties the values cannot say
//! on their own: a strict split composes back to its source byte for byte,
//! the offsets index the source, and composed text splits back to what went
//! in. The tests after it are hand-written cases the suite has no field for.

use frontmatter_lossless::{compose, split};
use serde_json::Value;

#[path = "conformance/run.rs"]
#[allow(dead_code, reason = "shared with the generator, which uses all of it")]
mod run;

/// Compiled in rather than read at runtime: the test binary then carries the
/// suite, and a moved or deleted suite is a build error, not a late panic.
const SUITE_JSON: &str = include_str!("../../../conformance/frontmatter-lossless/suite.json");

/// Every case of the suite, one test. A failure lists every failing case by
/// name rather than stopping at the first, so a change shows everything it
/// breaks.
#[test]
fn conformance_suite() {
    let suite: Value = serde_json::from_str(SUITE_JSON).expect("suite.json is valid JSON");
    assert_eq!(suite["family"], "frontmatter-lossless");
    assert_eq!(suite["reference"], "rust");
    let sections = suite["sections"]
        .as_object()
        .expect("sections is an object");
    let mut found: Vec<&str> = sections.keys().map(String::as_str).collect();
    found.sort_unstable();
    let mut known = run::SECTIONS.to_vec();
    known.sort_unstable();
    assert_eq!(
        found, known,
        "the suite's sections are not the ones this crate runs"
    );
    let mut failures = Vec::new();
    let (mut total, mut ran) = (0, 0);
    for (section, body) in sections {
        let cases = body["cases"].as_array().expect("cases is a list");
        for case in cases {
            total += 1;
            let Some(name) = case["name"].as_str() else {
                failures.push(format!("  {section}: a case has no string name"));
                continue;
            };
            match run_case(section, case) {
                Ok(()) => ran += 1,
                Err(msg) => failures.push(format!("  {section} [{name}] {msg}")),
            }
        }
    }
    assert!(
        failures.is_empty(),
        "conformance suite failures:\n{}",
        failures.join("\n")
    );
    assert!(total > 0, "the suite has no cases");
    assert_eq!(ran, total, "every case runs");
}

fn run_case(section: &str, case: &Value) -> Result<(), String> {
    let map = case.as_object().ok_or("not an object")?;
    if let Some(k) = map.keys().find(|k| !run::CASE_KEYS.contains(&k.as_str())) {
        return Err(format!("unknown case key {k}"));
    }
    let input = map.get("input").ok_or("no input")?;
    let want = map.get("expect").ok_or("no expect")?;
    let got = run::run(section, input)?;
    if &got != want {
        return Err(format!("got {got}, want {want}"));
    }
    match section {
        "split" => split_properties(run::text(run::fields(input, &["source"])?, "source")?),
        "compose_edit" | "new_shape" => {
            let out = run::text(got.as_object().ok_or("expect is not an object")?, "out")?;
            let i = input.as_object().ok_or("input is not an object")?;
            splits_back(out, run::maybe_text(i, "yaml")?, run::text(i, "body")?)
        }
        _ => Ok(()),
    }
}

/// The property that matters: split a note and compose it again, and get the
/// original file byte for byte. Anything that normalises fences, drops or
/// doubles a BOM, or rewrites CRLF fails on every shape it affects. The
/// offsets index the source exactly, so an edit can use real byte offsets.
fn split_properties(src: &str) -> Result<(), String> {
    let s = split(src);
    let out = compose(s.yaml, s.body, s.shape);
    if out != src {
        return Err(format!("round trip was not byte-identical: {out:?}"));
    }
    if let Some(yaml) = s.yaml
        && &src[s.yaml_range.clone()] != yaml
    {
        return Err("yaml_range does not index yaml".into());
    }
    if &src[s.body_start..] != s.body {
        return Err("body_start does not index body".into());
    }
    if s.unterminated && s.yaml.is_some() {
        return Err("only a note with no block can be unterminated".into());
    }
    Ok(())
}

/// Text composed into a shape lands where a later split finds it again.
fn splits_back(out: &str, yaml: Option<&str>, body: &str) -> Result<(), String> {
    let back = split(out);
    if back.yaml != yaml || back.body != body {
        return Err(format!(
            "{out:?} split back to ({:?}, {:?})",
            back.yaml, back.body
        ));
    }
    Ok(())
}

/// The empty block is a shape of its own: [`split`] returns it as `Some("")`
/// with its framing, and [`compose`] puts the fences back.
#[test]
fn compose_reproduces_an_empty_block() {
    let s = split("---\n---\nbody\n");
    assert_eq!(s.yaml, Some(""), "the empty block is captured");
    assert_eq!(s.body, "body\n");
    assert_eq!(&"---\n---\nbody\n"[s.yaml_range.clone()], "");
    assert_eq!(compose(s.yaml, s.body, s.shape), "---\n---\nbody\n");
}

#[test]
fn bom_is_recognised_and_preserved() {
    let s = split("\u{feff}---\ntitle: hi\n---\nbody\n");
    assert!(s.shape.bom, "BOM not recognised");
    assert_eq!(s.yaml, Some("title: hi"), "BOM must not leak into the yaml");
    assert_eq!(&split("---\ntitle: hi\n---\nbody\n").yaml, &s.yaml);
    // A BOM anywhere but byte zero is ordinary content, not framing.
    let mid = split("---\ntitle: a\u{feff}b\n---\nbody\n");
    assert!(!mid.shape.bom);
    assert_eq!(mid.yaml, Some("title: a\u{feff}b"));
}

#[test]
fn crlf_fences_survive_a_value_swap() {
    // Simulate an edit: keep the shape and pass `compose` new YAML text. The
    // fences must come back as CRLF, not LF.
    let s = split("---\r\ntitle: old\r\n---\r\nbody\r\n");
    let out = compose(Some("title: new\r"), s.body, s.shape);
    assert_eq!(out, "---\r\ntitle: new\r\n---\r\nbody\r\n");
    assert!(!out.contains("---\n"), "an LF fence leaked in: {out:?}");
}

#[test]
fn an_unterminated_or_empty_block_yields_body() {
    // Unterminated: the whole thing is body, no yaml.
    let unterminated = split("---\ntitle: hi\nstill going\n");
    assert_eq!(unterminated.yaml, None);
    assert_eq!(unterminated.body, "---\ntitle: hi\nstill going\n");

    // Empty file: no yaml, empty body, round-trips.
    let empty = split("");
    assert_eq!(empty.yaml, None);
    assert_eq!(empty.body, "");
    assert_eq!(compose(empty.yaml, empty.body, empty.shape), "");
}
