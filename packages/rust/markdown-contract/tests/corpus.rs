//! The shared corpus harness: the parity gate with the TS engine.
//!
//! Reads `corpus-manifest.json` from the `@osdlc/markdown-contract` corpus
//! (`packages/ts/markdown-contract/corpus/`, read in place). For every entry marked
//! `"shared": true`, it loads the `.contract.yaml`, validates each case's `.md` (bytes
//! verbatim), and checks the `.expected.json` golden as the TS harness's
//! `assertFindings` does: the finding count, each `id` in order, and `level` / `line` /
//! `hint` only when the golden pins them. The ts-only entries (custom `rule` /
//! `docRule` fixtures that YAML cannot express) are skipped with a printed line.
//!
//! It needs no `native` feature, so it also runs under `--no-default-features`.

use std::path::{Path, PathBuf};

use markdown_contract::{Finding, FindingLevel, load_contract, validate};

#[derive(serde::Deserialize)]
struct ManifestEntry {
    id: String,
    contract: Option<String>,
    shared: bool,
    cases: Vec<ManifestCase>,
}

#[derive(serde::Deserialize)]
struct ManifestCase {
    source: String,
    expected: String,
}

/// An expected finding — `id` required; `level` / `line` / `hint` asserted only when pinned.
#[derive(serde::Deserialize)]
struct ExpectedFinding {
    id: String,
    level: Option<FindingLevel>,
    line: Option<u32>,
    hint: Option<String>,
}

fn fixtures_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ts/markdown-contract/corpus")
}

fn brief(findings: &[Finding]) -> String {
    findings
        .iter()
        .map(|f| {
            format!(
                "{{id: {}, level: {:?}, line: {:?}, hint: {:?}}}",
                f.id,
                f.level,
                f.pos.map(|p| p.line),
                f.hint
            )
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// The TS harness's `assertFindings`: the count, then each id, and the level, line and
/// hint where pinned.
fn assert_findings(actual: &[Finding], expected: &[ExpectedFinding], label: &str) {
    assert_eq!(
        actual.len(),
        expected.len(),
        "{label}: finding count — actual: [{}]",
        brief(actual)
    );
    for (i, e) in expected.iter().enumerate() {
        let a = &actual[i];
        assert_eq!(
            a.id,
            e.id,
            "{label}: finding[{i}].id — actual: [{}]",
            brief(actual)
        );
        if let Some(level) = e.level {
            assert_eq!(a.level, level, "{label}: finding[{i}].level");
        }
        if let Some(line) = e.line {
            assert_eq!(
                a.pos.map(|p| p.line),
                Some(line),
                "{label}: finding[{i}].line — actual: [{}]",
                brief(actual)
            );
        }
        if let Some(hint) = &e.hint {
            assert_eq!(
                a.hint.as_deref(),
                Some(hint.as_str()),
                "{label}: finding[{i}].hint — actual: [{}]",
                brief(actual)
            );
        }
    }
}

#[test]
fn shared_corpus_fixtures_match_the_goldens() {
    let dir = fixtures_dir();
    let manifest: Vec<ManifestEntry> = serde_json::from_str(
        &std::fs::read_to_string(dir.join("corpus-manifest.json")).expect("manifest readable"),
    )
    .expect("manifest parses");

    let mut shared = 0usize;
    let mut skipped = 0usize;
    let mut cases_run = 0usize;

    for entry in &manifest {
        if !entry.shared {
            println!(
                "skip (ts-only): {} — {}",
                entry.id,
                entry.contract.as_deref().unwrap_or("(no contract)")
            );
            skipped += 1;
            continue;
        }
        shared += 1;
        let contract_file = entry
            .contract
            .as_deref()
            .unwrap_or_else(|| panic!("{}: a shared fixture needs a contract", entry.id));
        let contract_yaml = std::fs::read_to_string(dir.join(contract_file))
            .unwrap_or_else(|e| panic!("{}: cannot read {contract_file}: {e}", entry.id));
        let contract = load_contract(&contract_yaml)
            .unwrap_or_else(|e| panic!("{}: {contract_file} does not compile: {e}", entry.id));

        for case in &entry.cases {
            // Bytes verbatim (no trailing-newline normalization) so positions stay exact.
            let source = std::fs::read_to_string(dir.join(&case.source))
                .unwrap_or_else(|e| panic!("{}: cannot read {}: {e}", entry.id, case.source));
            let expected: Vec<ExpectedFinding> = serde_json::from_str(
                &std::fs::read_to_string(dir.join(&case.expected))
                    .unwrap_or_else(|e| panic!("{}: cannot read {}: {e}", entry.id, case.expected)),
            )
            .unwrap_or_else(|e| panic!("{}: {} does not parse: {e}", entry.id, case.expected));

            let findings = validate(&source, &contract, "fixture.md");
            assert_findings(
                &findings,
                &expected,
                &format!("[{}] {}", entry.id, case.source),
            );
            cases_run += 1;
        }
    }

    println!(
        "corpus: {shared} shared fixtures ({cases_run} cases) green, {skipped} ts-only skipped"
    );
    assert!(cases_run > 0, "no corpus case ran");
    assert_eq!(
        shared, 65,
        "the corpus holds 65 shared fixtures; update this count when it changes"
    );
    assert_eq!(
        skipped, 8,
        "the corpus holds 8 ts-only fixtures; update this count when it changes"
    );
}
