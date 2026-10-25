//! `load_config` — compile a declarative YAML meta-config (`kind: config`) into the
//! runner's [`CorpusConfig`], mirroring the TS `loadConfig`: a
//! `rules` list mapping `include` / `exclude` globs to a contract, plus an optional
//! `contracts` name map.
//!
//! A contract ref is a `.yaml` contract file or an inline contract object. Referencing
//! a code-authored `.js` / `.ts` contract module is the deferred code escape and is
//! rejected with the typed [`DeclarativeError::CodeContractRef`] (the "vault needs the
//! TS engine" hook).
//!
//! The core loader is fs-free: file-backed contract refs resolve through a caller
//! `resolver` (`target ref → yaml text`); the native layer's [`load_config_file`]
//! supplies the std::fs resolver anchored at the config file's directory.

use serde_yaml::Value;

use super::errors::DeclarativeError;
use super::load::{compile_contract_object, load_contract};
use super::parse::{DeclarativeKind, parse_declarative_doc};
use crate::contract::Contract;
use crate::runner::{CorpusConfig, CorpusRule};

/// Resolves a contract-file ref (a `.yaml` path, possibly relative) to its YAML text.
pub type ContractResolver<'a> = dyn FnMut(&str) -> Result<String, String> + 'a;

fn get<'a>(map: &'a serde_yaml::Mapping, key: &str) -> Option<&'a Value> {
    map.get(Value::String(key.into()))
}

fn err(msg: String) -> DeclarativeError {
    DeclarativeError::InvalidConfig(msg)
}

/// Compile a declarative YAML config (text) into a [`CorpusConfig`]. `resolver` reads a
/// referenced `.yaml` contract file's text (the fs seam).
pub fn load_config(
    yaml_text: &str,
    resolver: &mut ContractResolver<'_>,
) -> Result<CorpusConfig, DeclarativeError> {
    let doc = parse_declarative_doc(yaml_text)?;
    if doc.kind != DeclarativeKind::Config {
        return Err(DeclarativeError::InvalidDocument(
            "expected a config document (kind: config), got kind: contract".into(),
        ));
    }
    compile_config(&doc.raw, resolver)
}

fn compile_config(
    raw: &serde_yaml::Mapping,
    resolver: &mut ContractResolver<'_>,
) -> Result<CorpusConfig, DeclarativeError> {
    let contracts = match get(raw, "contracts") {
        Some(Value::Mapping(m)) => m.clone(),
        _ => serde_yaml::Mapping::new(),
    };
    let Some(Value::Sequence(rules)) = get(raw, "rules") else {
        return Err(err(
            "config.rules must be a list of { include, exclude?, contract }".into(),
        ));
    };
    let rules = rules
        .iter()
        .enumerate()
        .map(|(i, r)| compile_rule(r, &format!("rules[{i}]"), &contracts, resolver))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(CorpusConfig { rules })
}

fn glob_list(v: Option<&Value>) -> Option<Vec<String>> {
    v.and_then(Value::as_sequence)
        .map(|seq| seq.iter().map(|g| g.as_str().map(str::to_string)).collect())
        .unwrap_or(None)
}

fn compile_rule(
    rule: &Value,
    path: &str,
    contracts: &serde_yaml::Mapping,
    resolver: &mut ContractResolver<'_>,
) -> Result<CorpusRule, DeclarativeError> {
    let Value::Mapping(map) = rule else {
        return Err(err(format!("{path}: a rule must be a mapping")));
    };
    let include = match glob_list(get(map, "include")) {
        Some(globs) if !globs.is_empty() => globs,
        _ => {
            return Err(err(format!(
                "{path}.include must be a non-empty list of globs"
            )));
        }
    };
    let exclude = match get(map, "exclude") {
        None => Vec::new(),
        some => {
            glob_list(some).ok_or_else(|| err(format!("{path}.exclude must be a list of globs")))?
        }
    };
    let contract_ref = get(map, "contract");
    let contract = resolve_contract(
        contract_ref,
        &format!("{path}.contract"),
        contracts,
        resolver,
    )?;
    // A string contract ref IS the human contract name — carried as the rule's label.
    let name = contract_ref.and_then(Value::as_str).map(str::to_string);
    Ok(CorpusRule {
        include,
        exclude,
        contract,
        name,
    })
}

fn resolve_contract(
    reference: Option<&Value>,
    path: &str,
    contracts: &serde_yaml::Mapping,
    resolver: &mut ContractResolver<'_>,
) -> Result<Contract, DeclarativeError> {
    let Some(reference) = reference else {
        return Err(err(format!(
            "{path}: a rule needs a contract (a name, a .yaml path, or an inline contract)"
        )));
    };
    if let Value::Mapping(inline) = reference {
        // An inline contract object (frontmatter? / body?) — no envelope needed here;
        // it compiles with the v2 compiler set like everything else.
        return compile_contract_object(inline);
    }
    let Some(name) = reference.as_str() else {
        return Err(err(format!(
            "{path}: contract must be a name, a .yaml path, or an inline contract"
        )));
    };
    // A name resolves through the `contracts` map; otherwise the string is itself a path.
    let target = contracts
        .get(Value::String(name.into()))
        .and_then(Value::as_str)
        .unwrap_or(name);
    let lower = target.to_ascii_lowercase();
    if !(lower.ends_with(".yaml") || lower.ends_with(".yml")) {
        return Err(DeclarativeError::CodeContractRef {
            path: path.into(),
            target: target.into(),
        });
    }
    let text = resolver(target).map_err(|reason| DeclarativeError::ContractRefRead {
        target: target.into(),
        reason,
    })?;
    load_contract(&text)
}

/// Read a YAML config file and compile it; contract refs resolve relative to the config
/// file's directory (fs — the thin native layer).
#[cfg(feature = "native")]
pub fn load_config_file(path: &std::path::Path) -> Result<CorpusConfig, DeclarativeError> {
    let abs = path
        .canonicalize()
        .map_err(|e| DeclarativeError::ContractRefRead {
            target: path.display().to_string(),
            reason: e.to_string(),
        })?;
    let text = std::fs::read_to_string(&abs).map_err(|e| DeclarativeError::ContractRefRead {
        target: abs.display().to_string(),
        reason: e.to_string(),
    })?;
    let base = abs
        .parent()
        .map(std::path::Path::to_path_buf)
        .unwrap_or_default();
    let mut resolver = move |target: &str| -> Result<String, String> {
        let target_path = std::path::Path::new(target);
        let resolved = if target_path.is_absolute() {
            target_path.to_path_buf()
        } else {
            base.join(target_path)
        };
        std::fs::read_to_string(&resolved).map_err(|e| e.to_string())
    };
    load_config(&text, &mut resolver)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_files(target: &str) -> Result<String, String> {
        Err(format!("no such contract: {target}"))
    }

    // Contract first: an inline contract compiles and routes.
    #[test]
    fn inline_contract_rules_compile() {
        let cfg = load_config(
            "mcVersion: 2\nkind: config\nrules:\n  - include: ['**/*.md']\n    contract:\n      body:\n        sections:\n          - section: Overview\n",
            &mut no_files,
        )
        .unwrap();
        assert_eq!(cfg.rules.len(), 1);
        assert_eq!(cfg.rules[0].include, vec!["**/*.md"]);
        assert_eq!(cfg.rules[0].name, None); // inline contracts carry no name
        assert!(cfg.rules[0].contract.body.is_some());
    }

    // Inline contracts compile through the v2 compilers: v2 spellings bind
    // and v1 spellings are migration-hint errors.
    #[test]
    fn inline_contracts_compile_as_v2() {
        let cfg = load_config(
            "mcVersion: 2\nkind: config\nrules:\n  - include: ['**/*.md']\n    contract:\n      body:\n        additionalSections: false\n        sections:\n          - section: Overview\n",
            &mut no_files,
        )
        .unwrap();
        assert!(
            !cfg.rules[0]
                .contract
                .body
                .as_ref()
                .unwrap()
                .opts
                .allow_unknown
        );

        // A v1 spelling inside a v2 config's inline contract gets the migration hint.
        let Err(e) = load_config(
            "mcVersion: 2\nkind: config\nrules:\n  - include: ['**/*.md']\n    contract:\n      body:\n        allowUnknown: false\n        sections:\n          - section: Overview\n",
            &mut no_files,
        ) else {
            panic!("expected a DeclarativeError")
        };
        assert!(e.to_string().contains("'allowUnknown' is the v1 spelling"));
    }

    #[test]
    fn a_name_resolves_through_the_contracts_map() {
        let mut resolver = |target: &str| -> Result<String, String> {
            assert_eq!(target, "decision.contract.yaml");
            Ok("mcVersion: 2\nkind: contract\nbody:\n  sections:\n    - section: Summary\n".into())
        };
        let cfg = load_config(
            "mcVersion: 2\nkind: config\ncontracts:\n  decision: decision.contract.yaml\nrules:\n  - include: ['**/D-*.md']\n    contract: decision\n",
            &mut resolver,
        )
        .unwrap();
        assert_eq!(cfg.rules[0].name.as_deref(), Some("decision"));
    }

    // The typed hooks: a .ts ref and a missing contract are distinguishable errors.
    #[test]
    fn code_refs_and_shape_violations_are_rejected() {
        let Err(e) = load_config(
            "mcVersion: 2\nkind: config\nrules:\n  - include: ['**/*.md']\n    contract: ./task.contract.ts\n",
            &mut no_files,
        ) else {
            panic!("expected a DeclarativeError")
        };
        assert!(matches!(e, DeclarativeError::CodeContractRef { .. }));

        assert!(load_config("mcVersion: 2\nkind: config\n", &mut no_files).is_err());
        assert!(
            load_config(
                "mcVersion: 2\nkind: config\nrules:\n  - include: []\n    contract: {}\n",
                &mut no_files
            )
            .is_err()
        );
        assert!(
            load_config(
                "mcVersion: 2\nkind: config\nrules:\n  - include: ['**/*.md']\n",
                &mut no_files
            )
            .is_err()
        );
        let Err(e) = load_config("mcVersion: 2\nkind: contract\n", &mut no_files) else {
            panic!("expected a DeclarativeError")
        };
        assert!(e.to_string().contains("expected a config document"));
    }
}
