//! `load_contract` — compile a declarative YAML contract document into a runtime
//! [`Contract`], the same object the programmatic builders produce. A
//! YAML-authored contract is therefore indistinguishable downstream: same findings,
//! same ids, same positions.
//!
//! `mcVersion: 2` is the only supported version (v1 is retired — the envelope
//! gate in [`super::parse`] names the migrate command). Compiles both planes: the
//! **frontmatter** schema (the JSON-Schema-subset node, [`super::schema_v2`]) and the
//! **body grammar** (the v2 vocabulary, [`super::body_v2`]), plus the contract-root
//! `description:` carried for `Finding.hint` and the body root's `requires:` /
//! `forbids:` as one document-scoped text rule. Cross-cutting custom rules and the
//! `$ref` code escape hatch are deferred and not part of v2.

use serde_yaml::Value;

use super::body_v2::compile_body_v2;
use super::errors::DeclarativeError;
use super::parse::{DeclarativeKind, parse_declarative_doc};
use super::schema_v2::compile_frontmatter_v2;
use super::text::compile_body_text_rule;
use crate::contract::{Contract, DocRule, FrontmatterSpec};
use crate::finding::Finding;
use crate::registry::Ctx;
use crate::tree::DocTree;

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

/// Build a [`Contract`] from a raw `{ description?, frontmatter?, body? }` mapping (no
/// envelope needed — used by inline config contracts): the v2 compiler set —
/// the frontmatter block is itself a JSON-Schema-subset node, the body grammar uses the
/// v2 spelling, and `description:` on the contract root / body root is carried for
/// `Finding.hint`.
pub fn compile_contract_object(raw: &serde_yaml::Mapping) -> Result<Contract, DeclarativeError> {
    let mut contract = Contract::new();

    if let Some(d) = raw.get(Value::String("description".into())) {
        let Some(d) = d.as_str() else {
            return Err(DeclarativeError::InvalidDocument(
                "description must be a string".into(),
            ));
        };
        contract.description = Some(d.to_string());
    }

    if let Some(fm) = raw.get(Value::String("frontmatter".into())) {
        contract.frontmatter = Some(FrontmatterSpec {
            schema: compile_frontmatter_v2(fm)?,
        });
    }

    if let Some(body) = raw.get(Value::String("body".into())) {
        let seq = compile_body_v2(body, "body")?;
        let body_hint = seq.description.clone();
        contract.body = Some(seq);
        // The body root's `requires:` / `forbids:` → one document-scoped text rule
        // attached at the contract level ; its
        // findings inherit the body root's `description` as their hint.
        if let Value::Mapping(body_map) = body
            && let Some(doc_rule) = compile_body_text_rule(body_map, "body")?
        {
            contract.rules.push(match body_hint {
                Some(hint) => Box::new(HintedDocRule {
                    inner: doc_rule,
                    hint,
                }),
                None => doc_rule,
            });
        }
    }

    Ok(contract)
}

/// A doc-rule decorator stamping the bound scope's `description` onto findings that
/// carry no nearer hint — the body root's effective hint for document-scoped text
/// constraints (the contract-root fallback stays `validate`'s).
struct HintedDocRule {
    inner: Box<dyn DocRule>,
    hint: String,
}

impl DocRule for HintedDocRule {
    fn id(&self) -> &str {
        self.inner.id()
    }
    fn run(&self, tree: &DocTree, ctx: &Ctx) -> Vec<Finding> {
        let mut findings = self.inner.run(tree, ctx);
        for finding in &mut findings {
            if finding.hint.is_none() {
                finding.hint = Some(self.hint.clone());
            }
        }
        findings
    }
}

/// Read a `*.contract.yaml` file and compile it into a runtime [`Contract`] (fs — the
/// thin native layer).
#[cfg(feature = "native")]
pub fn load_contract_file(path: &std::path::Path) -> Result<Contract, DeclarativeError> {
    let text = std::fs::read_to_string(path).map_err(|e| DeclarativeError::ContractRefRead {
        target: path.display().to_string(),
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

    // Contract first: v2 loads, the retired v1 names the codemod, v3 is rejected.
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

    #[test]
    fn body_root_text_rule_carries_the_body_description() {
        let contract = load_contract(
            "mcVersion: 2\nkind: contract\nbody:\n  description: no script paths\n  sections:\n    - section: Summary\n  forbids:\n    - pattern: '}scripts/'\n      normalize: false\n",
        )
        .unwrap();
        let out = validate("## Summary\n\nreaches }scripts/x.sh\n", &contract, "d.md");
        assert_eq!(
            hints(&out),
            vec![("text/forbids/doc/o9pijh", Some("no script paths"))]
        );
    }
}
