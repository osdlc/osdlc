//! `load_contract`: compile a YAML contract into the same [`Contract`] the builders
//! produce, so a YAML contract gives the same findings as a built one.
//!
//! It compiles the frontmatter schema ([`super::schema_v2`]), the body grammar
//! ([`super::body_v2`]), the contract-root `description:` (for `Finding.hint`) and the
//! body root's `requires:` / `forbids:` as one document text rule. Custom rules cannot
//! be written in YAML.

use serde_yaml::Value;

use super::body_v2::compile_body_v2;
use super::errors::DeclarativeError;
use super::parse::{DeclarativeKind, parse_declarative_doc};
use super::schema_v2::compile_frontmatter_v2;
use super::text::compile_body_text_rule;
use super::yaml::render;
use crate::contract::{Contract, FrontmatterSpec};

/// The keys a contract mapping may hold.
const CONTRACT_KEYS: &[&str] = &["mcVersion", "kind", "frontmatter", "body", "description"];

/// Compile a declarative YAML contract (text) into a runtime [`Contract`].
pub fn load_contract(yaml_text: &str) -> Result<Contract, DeclarativeError> {
    let doc = parse_declarative_doc(yaml_text)?;
    if doc.kind != DeclarativeKind::Contract {
        return Err(DeclarativeError::InvalidDocument(
            "expected a contract document (kind: contract), got kind: config".into(),
        ));
    }
    compile_contract_object(&doc.raw)
}

/// Build a [`Contract`] from a `{ description?, frontmatter?, body? }` mapping with no
/// envelope, as an inline config contract is written. An `mcVersion` other than 2 and
/// any other key are rejected.
pub fn compile_contract_object(raw: &serde_yaml::Mapping) -> Result<Contract, DeclarativeError> {
    if let Some(v) = raw.get("mcVersion")
        && v.as_f64() != Some(2.0)
    {
        return Err(DeclarativeError::InvalidDocument(format!(
            "contract: unsupported mcVersion {} (only 2 is supported; rewrite a version 1 contract with `markdown-contract migrate`)",
            render(Some(v))
        )));
    }
    for key in raw.keys() {
        if !key.as_str().is_some_and(|k| CONTRACT_KEYS.contains(&k)) {
            return Err(DeclarativeError::InvalidDocument(format!(
                "contract: unknown key '{}'",
                super::yaml::scalar_string(key)
            )));
        }
    }

    let mut contract = Contract::new();

    if let Some(d) = raw.get("description") {
        let Some(d) = d.as_str() else {
            return Err(DeclarativeError::InvalidDocument(
                "contract: description must be a string".into(),
            ));
        };
        contract.description = Some(d.to_string());
    }

    if let Some(fm) = raw.get("frontmatter") {
        contract.frontmatter = Some(FrontmatterSpec {
            schema: compile_frontmatter_v2(fm)?,
        });
    }

    if let Some(body) = raw.get("body") {
        contract.body = Some(compile_body_v2(body, "body")?);
        // The body root's `requires:` / `forbids:` become one document rule. As in TS,
        // its findings take the contract's description as their hint, not the body's.
        if let Value::Mapping(body_map) = body
            && let Some(doc_rule) = compile_body_text_rule(body_map, "body")?
        {
            contract.rules.push(doc_rule);
        }
    }

    Ok(contract)
}

/// Read a `*.contract.yaml` file and compile it into a [`Contract`].
#[cfg(feature = "native")]
pub fn load_contract_file(path: &std::path::Path) -> Result<Contract, DeclarativeError> {
    let text = std::fs::read_to_string(path).map_err(|e| DeclarativeError::FileRead {
        path: path.display().to_string(),
        reason: e.to_string(),
    })?;
    load_contract(&text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::finding::FindingLevel;
    use crate::validate::validate;

    fn brief(findings: &[crate::finding::Finding]) -> Vec<(&str, FindingLevel, Option<u32>)> {
        findings
            .iter()
            .map(|f| (f.id.as_str(), f.level, f.pos.map(|p| p.line)))
            .collect()
    }

    // Contract first — one YAML contract, both planes, one pass.
    #[test]
    fn a_yaml_contract_validates_both_planes() {
        let contract = load_contract(
            "mcVersion: 2\nkind: contract\nfrontmatter:\n  type: object\n  additionalProperties: false\n  required: [id, status]\n  properties:\n    id:\n      type: string\n      pattern: '^D-[0-9A-Z]{4}$'\n    status:\n      enum: [open/proposed, open/accepted]\n\nbody:\n  order: none\n  additionalSections: true\n  sections:\n    - section: Summary\n    - section: Context\n",
        )
        .unwrap();
        let pass = "---\nid: D-0099\nstatus: open/proposed\n---\n\n## Summary\n\nA summary.\n\n## Context\n\nWhy.\n";
        assert_eq!(validate(pass, &contract, "d.md"), vec![]);
        let fail = "---\nid: D-0099\nstatus: open/draft\n---\n\n## Summary\n\nA summary.\n";
        assert_eq!(
            brief(&validate(fail, &contract, "d.md")),
            vec![
                ("frontmatter/enum", FindingLevel::Error, Some(3)),
                ("structure/section-missing", FindingLevel::Error, Some(6)),
            ]
        );
    }

    #[test]
    fn body_root_text_keys_attach_one_doc_rule() {
        let contract = load_contract(
            "mcVersion: 2\nkind: contract\nbody:\n  sections:\n    - section: Summary\n  forbids:\n    - pattern: '}scripts/'\n      normalize: false\n",
        )
        .unwrap();
        assert_eq!(contract.rules.len(), 1);
        let fail = "## Summary\n\nreaches }scripts/x.sh directly\n";
        assert_eq!(
            brief(&validate(fail, &contract, "d.md")),
            vec![("text/forbids/doc/o9pijh", FindingLevel::Error, Some(3))]
        );
    }

    #[test]
    fn a_config_document_is_not_a_contract() {
        let Err(e) = load_contract("mcVersion: 2\nkind: config\nrules: []\n") else {
            panic!("expected a DeclarativeError")
        };
        assert!(e.to_string().contains("expected a contract document"));
    }

    // ── The envelope gate ───────────────────────────────────────────────────

    // v2 loads, v1 names the migrate command, v3 is rejected.
    #[test]
    fn envelope_accepts_v2_and_rejects_v1_and_v3() {
        let v2 = load_contract(
            "mcVersion: 2\nkind: contract\nfrontmatter:\n  type: object\n  additionalProperties: false\n  properties:\n    id: { type: string }\n  required: [id]\nbody:\n  additionalSections: false\n  sections:\n    - section: Summary\n",
        )
        .unwrap();
        let doc = "---\nid: D-0001\n---\n\n## Summary\n\nfine\n";
        assert_eq!(validate(doc, &v2, "d.md"), vec![]);

        let Err(e) = load_contract("mcVersion: 1\nkind: contract\nbody:\n  sections: []\n") else {
            panic!("expected a DeclarativeError")
        };
        assert_eq!(
            e.to_string(),
            "mcVersion 1 is no longer supported; rewrite the file as mcVersion 2 with `markdown-contract migrate --write <file>` (the CLI of @osdlc/markdown-contract)"
        );

        let Err(e) = load_contract("mcVersion: 3\nkind: contract\nbody:\n  sections: []\n") else {
            panic!("expected a DeclarativeError")
        };
        assert_eq!(
            e.to_string(),
            "unsupported mcVersion: 3 (this build supports 2)"
        );
    }

    #[test]
    fn a_v1_spelling_is_a_migration_error() {
        let Err(e) = load_contract(
            "mcVersion: 2\nkind: contract\nbody:\n  sections:\n    - section: Entry\n      repeatable: true\n",
        ) else {
            panic!("expected a DeclarativeError")
        };
        assert!(e.to_string().contains("'repeatable' is the v1 spelling"));
    }

    // ── description → Finding.hint ─────────────────────────────────────────

    fn hints(findings: &[crate::finding::Finding]) -> Vec<(&str, Option<&str>)> {
        findings
            .iter()
            .map(|f| (f.id.as_str(), f.hint.as_deref()))
            .collect()
    }

    // Nearest enclosing description wins: leaf beats section beats body root beats
    // contract root; scopes with no nearer description fall outward.
    #[test]
    fn hint_resolves_to_the_nearest_enclosing_description() {
        let contract = load_contract(
            "mcVersion: 2\nkind: contract\ndescription: the decision record\nfrontmatter:\n  type: object\n  properties:\n    id:\n      type: string\n      description: the D-number\n    status: { type: string }\n  required: [id, status]\nbody:\n  description: the standard shape\n  additionalSections: false\n  sections:\n    - section: Summary\n      description: one paragraph, outcome first\n      content:\n        maxWords: 5\n      requires:\n        - pattern: outcome\n    - section: Files\n      content:\n        table:\n          columns: [Location]\n          minRows: 1\n          description: one row per touched file\n",
        )
        .unwrap();
        let doc = "---\nid: 7\n---\n\n## Summary\n\nSix words are in this paragraph.\n\n## Files\n\n| Location |\n| - |\n\n## Extras\n\nx\n";
        let out = validate(doc, &contract, "d.md");
        assert_eq!(
            hints(&out),
            vec![
                // a missing field with no description falls back to the contract root
                ("frontmatter/required", Some("the decision record")),
                // the failing field's own stored description
                ("frontmatter/type", Some("the D-number")),
                // text findings: the bound section's effective hint
                (
                    "text/requires/summary/1tc7itx",
                    Some("one paragraph, outcome first")
                ),
                // content findings: the section's description (maxWords carries none)
                ("content/max-words", Some("one paragraph, outcome first")),
                // the leaf's own description beats the section's absence
                ("content/table/min-rows", Some("one row per touched file")),
                // an unknown section: the body root's description
                ("structure/section-order", Some("the standard shape")),
            ]
        );
    }

    #[test]
    fn hint_is_absent_when_no_description_is_in_scope() {
        // A description-free contract produces findings with no hint slot at all —
        // the `hint` key never serializes.
        let contract = load_contract(
            "mcVersion: 2\nkind: contract\nbody:\n  sections:\n    - section: Summary\n",
        )
        .unwrap();
        let out = validate("## Wrong\n\nprose\n", &contract, "d.md");
        assert!(!out.is_empty());
        assert!(out.iter().all(|f| f.hint.is_none()));
        assert!(!serde_json::to_string(&out).unwrap().contains("hint"));
    }

    // As in TS, the body root's text rule is a document rule, so its findings take the
    // contract's description, not the body's.
    #[test]
    fn body_root_text_rule_takes_the_contract_description() {
        let yaml = |contract_description: &str| {
            format!(
                "mcVersion: 2\nkind: contract\n{contract_description}body:\n  description: no script paths\n  sections:\n    - section: Summary\n  forbids:\n    - pattern: '}}scripts/'\n      normalize: false\n"
            )
        };
        let doc = "## Summary\n\nreaches }scripts/x.sh\n";
        let with = load_contract(&yaml("description: the record\n")).unwrap();
        assert_eq!(
            hints(&validate(doc, &with, "d.md")),
            vec![("text/forbids/doc/o9pijh", Some("the record"))]
        );
        let without = load_contract(&yaml("")).unwrap();
        assert_eq!(
            hints(&validate(doc, &without, "d.md")),
            vec![("text/forbids/doc/o9pijh", None)]
        );
    }

    #[test]
    fn a_contract_mapping_is_closed_and_inline_versions_must_be_2() {
        let msg = |yaml: &str| {
            let raw: serde_yaml::Mapping = serde_yaml::from_str(yaml).unwrap();
            match compile_contract_object(&raw) {
                Err(e) => e.to_string(),
                Ok(_) => panic!("expected a DeclarativeError for {yaml}"),
            }
        };
        assert_eq!(msg("bodyy: {}\n"), "contract: unknown key 'bodyy'");
        assert!(msg("mcVersion: 1\n").starts_with("contract: unsupported mcVersion 1"));
        assert_eq!(
            msg("description: 3\n"),
            "contract: description must be a string"
        );
        let raw: serde_yaml::Mapping =
            serde_yaml::from_str("mcVersion: 2.0\nbody:\n  sections: []\n").unwrap();
        assert!(compile_contract_object(&raw).is_ok());
    }
}
