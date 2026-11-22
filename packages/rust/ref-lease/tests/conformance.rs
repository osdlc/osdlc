//! Runs the ref-lease conformance suite, `packages/conformance/ref-lease/suite.json`.
//!
//! The suite holds the cases this crate and the TypeScript `@osdlc/ref-lease`
//! package must agree on: same input, same result. The TypeScript package is
//! the family's reference: its generator writes every `expect`. A case added
//! on either side goes in the suite, never in one package's own tests. The
//! suite's sections must be exactly the ones run here, and a case key or input
//! key this test does not know fails it.
//!
//! An integration test, not a unit test, so it uses only the public API.

use std::collections::BTreeMap;

use ref_lease::{FetchFailure, PushFlag, PushOutcome, canonical_json, fetch_failure, push_outcome};
use serde::Deserialize;
use serde_json::{Value, json};

/// Compiled in rather than read at runtime: a moved or deleted suite is a
/// build error, not a late panic.
const SUITE_JSON: &str = include_str!("../../../conformance/ref-lease/suite.json");

const SECTIONS: [&str; 3] = ["canonical_json", "fetch_failure", "push_outcome"];

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Suite {
    family: String,
    reference: String,
    #[serde(rename = "referenceVersion")]
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
    input: Value,
    expect: Value,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PushInput {
    flag: String,
    rejection: Option<String>,
    keeps_sha: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FetchInput {
    stderr: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct JsonInput {
    value: Value,
}

fn input<T: serde::de::DeserializeOwned>(case: &Case) -> T {
    serde_json::from_value(case.input.clone())
        .unwrap_or_else(|err| panic!("{}: input: {err}", case.name))
}

fn run(section: &str, case: &Case) -> Value {
    match section {
        "push_outcome" => {
            let i: PushInput = input(case);
            let mut chars = i.flag.chars();
            let flag = chars.next().expect("a flag is one character");
            assert!(
                chars.next().is_none(),
                "{}: a flag is one character",
                case.name
            );
            let outcome = push_outcome(
                PushFlag {
                    flag,
                    rejection: i.rejection.as_deref(),
                },
                i.keeps_sha,
            );
            json!({ "outcome": match outcome {
                PushOutcome::Ok => "ok",
                PushOutcome::CasFailed => "cas-failed",
                PushOutcome::GitFailed => "git-failed",
            } })
        }
        "fetch_failure" => {
            let i: FetchInput = input(case);
            json!({ "failure": match fetch_failure(&i.stderr) {
                FetchFailure::RefNotFound => "ref-not-found",
                FetchFailure::LockContention => "lock-contention",
                FetchFailure::GitFailed => "git-failed",
            } })
        }
        "canonical_json" => {
            let i: JsonInput = input(case);
            json!({ "json": canonical_json(&i.value) })
        }
        other => panic!("unknown section {other}"),
    }
}

#[test]
fn the_suite_is_the_ref_lease_suite_with_the_ts_package_as_reference() {
    let suite: Suite = serde_json::from_str(SUITE_JSON).expect("the suite parses");
    assert_eq!(
        (suite.family.as_str(), suite.reference.as_str()),
        ("ref-lease", "ts")
    );
}

#[test]
fn the_suite_has_exactly_the_sections_this_crate_runs() {
    let suite: Suite = serde_json::from_str(SUITE_JSON).expect("the suite parses");
    let names: Vec<&str> = suite.sections.keys().map(String::as_str).collect();
    assert_eq!(names, SECTIONS);
}

#[test]
fn every_case_gives_what_the_reference_wrote() {
    let suite: Suite = serde_json::from_str(SUITE_JSON).expect("the suite parses");
    for (name, section) in &suite.sections {
        assert!(!section.cases.is_empty(), "{name}: no cases");
        for case in &section.cases {
            assert_eq!(run(name, case), case.expect, "{name}: {}", case.name);
        }
    }
}
