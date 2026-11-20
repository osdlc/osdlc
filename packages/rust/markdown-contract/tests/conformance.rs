//! Runs the markdown-contract conformance suite,
//! `packages/conformance/markdown-contract/suite.json`.
//!
//! The suite holds the cases this crate and the TypeScript
//! `@osdlc/markdown-contract` package must agree on: same contract, same
//! document, same findings. The TypeScript package is the family's reference:
//! its generator writes every `expect`. A case added on either side goes in
//! the suite, never in one package's own tests. Every section and every case
//! runs here, unless the case names another platform or skips Rust with a
//! reason. The suite's sections must be exactly [`SECTIONS`], and a case key or
//! input key this test does not know fails it, whether or not the case runs.
//!
//! A case compiles its `contract` text, validates its `source` with the path
//! `fixture.md`, and compares every finding's `id`, `level`, `line` and `hint`,
//! in order. Message text, columns and `fix` edits are not compared.
//!
//! It needs no `native` feature, so it also runs under `--no-default-features`.

use std::collections::BTreeMap;

use markdown_contract::{Finding, FindingLevel, load_contract, validate};
use serde::Deserialize;
use serde_json::{Value, json};

/// Compiled in rather than read at runtime: the test binary then carries the
/// suite, and a moved or deleted suite is a build error, not a late panic.
const SUITE_JSON: &str = include_str!("../../../conformance/markdown-contract/suite.json");

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Suite {
    family: String,
    reference: String,
    #[allow(
        dead_code,
        reason = "the suite format carries it; this test reads none"
    )]
    reference_version: String,
    sections: BTreeMap<String, Section>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Section {
    #[allow(dead_code, reason = "prose for the reader")]
    description: String,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Case {
    name: String,
    input: ValidateInput,
    expect: Expect,
    #[serde(default)]
    platforms: Option<Vec<String>>,
    #[serde(default)]
    skip: BTreeMap<String, String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ValidateInput {
    contract: String,
    source: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Expect {
    findings: Vec<Value>,
}

const HOST: &str = if cfg!(windows) { "windows" } else { "unix" };

/// Every section this test runs.
const SECTIONS: [&str; 1] = ["validate"];

/// The path every case validates with.
const PATH: &str = "fixture.md";

impl Case {
    /// Whether the case names this host, or names no platform.
    fn for_this_host(&self) -> bool {
        self.platforms
            .as_ref()
            .is_none_or(|platforms| platforms.iter().any(|p| p == HOST))
    }
}

/// One finding as the suite spells it: `line` and `hint` are left out when the
/// finding has none.
fn spell(finding: &Finding) -> Value {
    let level = match finding.level {
        FindingLevel::Error => "error",
        FindingLevel::Warn => "warn",
        FindingLevel::Report => "report",
    };
    let mut out = json!({ "id": finding.id, "level": level });
    if let Some(pos) = finding.pos {
        out["line"] = json!(pos.line);
    }
    if let Some(hint) = &finding.hint {
        out["hint"] = json!(hint);
    }
    out
}

fn run(case: &Case) -> Vec<Value> {
    let contract = load_contract(&case.input.contract)
        .unwrap_or_else(|err| panic!("{}: the contract does not compile: {err}", case.name));
    validate(&case.input.source, &contract, PATH)
        .iter()
        .map(spell)
        .collect()
}

fn suite() -> Suite {
    serde_json::from_str(SUITE_JSON).expect("the suite parses, with only keys this test knows")
}

#[test]
fn the_suite_is_this_family_with_the_typescript_package_as_reference() {
    let suite = suite();
    assert_eq!(suite.family, "markdown-contract");
    assert_eq!(suite.reference, "ts");
}

#[test]
fn the_suite_has_exactly_the_sections_this_test_runs() {
    let suite = suite();
    let names: Vec<&str> = suite.sections.keys().map(String::as_str).collect();
    assert_eq!(names, SECTIONS);
}

#[test]
fn case_names_are_unique() {
    let suite = suite();
    let mut seen = std::collections::BTreeSet::new();
    for section in suite.sections.values() {
        for case in &section.cases {
            assert!(seen.insert(&case.name), "{}: named twice", case.name);
        }
    }
}

#[test]
fn every_case_gives_the_findings_the_suite_expects() {
    let suite = suite();
    let mut run_count = 0usize;
    for (name, section) in &suite.sections {
        assert!(!section.cases.is_empty(), "{name}: no cases");
        for case in &section.cases {
            if let Some(reason) = case.skip.get("rust") {
                assert!(!reason.is_empty(), "{}: a skip needs a reason", case.name);
                continue;
            }
            if !case.for_this_host() {
                continue;
            }
            let got = run(case);
            assert_eq!(
                got, case.expect.findings,
                "{name}: {}: findings differ",
                case.name
            );
            run_count += 1;
        }
    }
    assert!(run_count > 0, "no case ran");
}
