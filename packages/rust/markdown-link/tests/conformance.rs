//! Runs the markdown-link conformance suite,
//! `packages/conformance/markdown-link/suite.json`.
//!
//! The suite holds the cases this crate and the TypeScript
//! `@osdlc/markdown-link` package must agree on: what counts as code, the
//! link parsers, the body scanner, `display_text` and `parse_typed_ref`. This
//! crate is the family's reference: its generator,
//! `tests/conformance/write.rs`, writes every `expect` from
//! `tests/conformance/run.rs`, which this test shares. Every section and case
//! runs here. A missing section, a case with no name, and a section, case key
//! or input key this test does not know all fail it.

use serde_json::Value;

#[path = "conformance/run.rs"]
#[allow(dead_code, reason = "shared with the generator, which uses all of it")]
mod run;

/// Compiled in rather than read at runtime: the test binary then carries the
/// suite, and a moved or deleted suite is a build error, not a late panic.
const SUITE_JSON: &str = include_str!("../../../conformance/markdown-link/suite.json");

/// Every case of the suite, one test. A failure lists every failing case by
/// name rather than stopping at the first, so a change shows everything it
/// breaks.
#[test]
fn conformance_suite() {
    let suite: Value = serde_json::from_str(SUITE_JSON).expect("suite.json is valid JSON");
    assert_eq!(suite["family"], "markdown-link");
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
    let mut total = 0;
    for (section, body) in sections {
        let cases = body["cases"].as_array().expect("cases is a list");
        for case in cases {
            total += 1;
            let Some(name) = case["name"].as_str() else {
                failures.push(format!("  {section}: a case has no string name"));
                continue;
            };
            match run_case(section, case) {
                Ok(()) => {}
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
    Ok(())
}
