//! The loader's error: a declarative document that is malformed or uses a feature
//! outside `mcVersion: 2`. The variants a host may act on are separate:
//! [`DeclarativeError::UnsupportedVersion`], [`DeclarativeError::RetiredVersion`]
//! (`mcVersion: 1`, which `markdown-contract migrate` rewrites) and
//! [`DeclarativeError::CodeContractRef`].

/// A declarative document that could not be compiled into a contract / config.
#[derive(Debug, thiserror::Error)]
pub enum DeclarativeError {
    /// the YAML text itself does not parse
    #[error("invalid YAML: {0}")]
    InvalidYaml(String),

    /// the document parses but is not a mapping with the required envelope
    #[error("{0}")]
    InvalidDocument(String),

    /// an `mcVersion` outside the supported set — never best-effort parsed
    #[error("unsupported mcVersion: {0} (this build supports 2)")]
    UnsupportedVersion(String),

    /// `mcVersion: 1` — retired; `markdown-contract migrate` rewrites a v1 document
    #[error(
        "mcVersion 1 is no longer supported; rewrite the file as mcVersion 2 with `markdown-contract migrate --write <file>` (the CLI of @osdlc/markdown-contract)"
    )]
    RetiredVersion,

    /// a `kind` that is neither `contract` nor `config`
    #[error("kind must be \"contract\" or \"config\" (got {0})")]
    InvalidKind(String),

    /// a schema node outside the closed v2 vocabulary
    #[error("{0}")]
    InvalidSchema(String),

    /// a body-grammar node outside the v2 DSL (or a build-time grammar violation)
    #[error("{0}")]
    InvalidBody(String),

    /// a `requires:` / `forbids:` match spec outside the closed vocabulary (or a
    /// duplicate / contradiction)
    #[error("{0}")]
    InvalidTextSpec(String),

    /// a config document outside the v2 DSL
    #[error("{0}")]
    InvalidConfig(String),

    /// a config contract ref that is not a `.yaml` / `.yml` file, such as a `.ts` module
    #[error(
        "{path}: a contract ref must be a .yaml file (got '{target}'); referencing a code-authored .js/.ts contract is not supported"
    )]
    CodeContractRef {
        /// where the ref sits in the config, such as `rules[0].contract`
        path: String,
        /// the file the ref resolves to, after the `contracts` name lookup
        target: String,
    },

    /// a referenced contract file could not be read
    #[error("failed to read contract ref '{target}': {reason}")]
    ContractRefRead {
        /// the file the ref resolves to
        target: String,
        /// why the read failed
        reason: String,
    },

    /// a config or contract file passed to a `*_file` loader could not be read
    #[error("failed to read '{path}': {reason}")]
    FileRead {
        /// the file
        path: String,
        /// why the read failed
        reason: String,
    },
}

#[cfg(test)]
mod tests {
    use super::DeclarativeError;

    // The variants a host may act on render their messages verbatim.
    #[test]
    fn hook_variants_render_their_messages() {
        let e = DeclarativeError::UnsupportedVersion("3".into());
        assert_eq!(
            e.to_string(),
            "unsupported mcVersion: 3 (this build supports 2)"
        );
        let e = DeclarativeError::RetiredVersion;
        assert_eq!(
            e.to_string(),
            "mcVersion 1 is no longer supported; rewrite the file as mcVersion 2 with `markdown-contract migrate --write <file>` (the CLI of @osdlc/markdown-contract)"
        );
        let e = DeclarativeError::CodeContractRef {
            path: "rules[0].contract".into(),
            target: "./task.contract.ts".into(),
        };
        assert!(e.to_string().contains(".js/.ts contract is not supported"));
    }
}
