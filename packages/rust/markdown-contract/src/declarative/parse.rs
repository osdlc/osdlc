//! Parse a declarative YAML document and check its envelope (`mcVersion` and `kind`),
//! mirroring the TS `parseDeclarativeDoc`. `mcVersion: 2` is the only supported
//! version; `mcVersion: 1` gets an error naming the migrate command.

use serde_yaml::Value;

use super::errors::DeclarativeError;
use super::yaml::render;

/// The supported format versions. A YAML `2.0` is the number 2, as in JS.
const SUPPORTED_VERSIONS: &[f64] = &[2.0];

/// The document kind a declarative envelope declares.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum DeclarativeKind {
    /// A contract document.
    Contract,
    /// A config document that maps globs to contracts.
    Config,
}

/// A parsed declarative document with a valid envelope.
pub(super) struct DeclarativeDoc {
    pub(super) kind: DeclarativeKind,
    pub(super) raw: serde_yaml::Mapping,
}

/// Parse YAML text into a validated declarative envelope. Errors on invalid YAML, a
/// non-mapping document, an unsupported `mcVersion`, or a `kind` that is neither
/// `contract` nor `config`. `mcVersion: 1` gets its dedicated retirement error, which
/// names the migrate command. An unknown version is never best-effort parsed.
pub(super) fn parse_declarative_doc(yaml_text: &str) -> Result<DeclarativeDoc, DeclarativeError> {
    let raw: Value = serde_yaml::from_str(yaml_text)
        .map_err(|e| DeclarativeError::InvalidYaml(e.to_string()))?;
    let Value::Mapping(map) = raw else {
        return Err(DeclarativeError::InvalidDocument(
            "a declarative document must be a YAML mapping with mcVersion and kind".into(),
        ));
    };

    let version = map.get(Value::String("mcVersion".into()));
    match version.and_then(Value::as_f64) {
        Some(1.0) => return Err(DeclarativeError::RetiredVersion),
        Some(v) if SUPPORTED_VERSIONS.contains(&v) => {}
        _ => return Err(DeclarativeError::UnsupportedVersion(render(version))),
    }

    let kind_val = map.get(Value::String("kind".into()));
    let kind = match kind_val.and_then(Value::as_str) {
        Some("contract") => DeclarativeKind::Contract,
        Some("config") => DeclarativeKind::Config,
        _ => return Err(DeclarativeError::InvalidKind(render(kind_val))),
    };

    Ok(DeclarativeDoc { kind, raw: map })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Contract first: a well-formed envelope parses at the supported version; each
    // gate rejects.
    #[test]
    fn valid_envelope_parses() {
        let doc =
            parse_declarative_doc("mcVersion: 2\nkind: contract\nbody:\n  sections: []\n").unwrap();
        assert_eq!(doc.kind, DeclarativeKind::Contract);
        // YAML `2.0` is the number 2, as in JS.
        let doc = parse_declarative_doc("mcVersion: 2.0\nkind: config\n").unwrap();
        assert_eq!(doc.kind, DeclarativeKind::Config);
    }

    fn expect_err(r: Result<DeclarativeDoc, DeclarativeError>) -> DeclarativeError {
        match r {
            Err(e) => e,
            Ok(_) => panic!("expected a DeclarativeError"),
        }
    }

    #[test]
    fn the_retired_mc_version_1_names_the_migrate_command() {
        let err = expect_err(parse_declarative_doc("mcVersion: 1\nkind: contract\n"));
        assert!(matches!(err, DeclarativeError::RetiredVersion));
        assert_eq!(
            err.to_string(),
            "mcVersion 1 is no longer supported; rewrite the file as mcVersion 2 with `markdown-contract migrate --write <file>` (the CLI of @osdlc/markdown-contract)"
        );
    }

    #[test]
    fn unsupported_version_is_rejected_not_best_effort_parsed() {
        let err = expect_err(parse_declarative_doc("mcVersion: 3\nkind: contract\n"));
        assert!(matches!(err, DeclarativeError::UnsupportedVersion(_)));
        assert_eq!(
            err.to_string(),
            "unsupported mcVersion: 3 (this build supports 2)"
        );
    }

    #[test]
    fn missing_version_bad_kind_and_non_mapping_are_rejected() {
        assert!(matches!(
            expect_err(parse_declarative_doc("kind: contract\n")),
            DeclarativeError::UnsupportedVersion(_)
        ));
        assert!(matches!(
            expect_err(parse_declarative_doc("mcVersion: 2\nkind: recipe\n")),
            DeclarativeError::InvalidKind(_)
        ));
        assert!(matches!(
            expect_err(parse_declarative_doc("- a\n- b\n")),
            DeclarativeError::InvalidDocument(_)
        ));
        assert!(matches!(
            expect_err(parse_declarative_doc(": {{")),
            DeclarativeError::InvalidYaml(_)
        ));
    }
}
