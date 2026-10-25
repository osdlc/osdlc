//! The finding-id → default `FindingLevel` registry plus the `Ctx` factory.
//!
//! `level` is **contract data**, not a call-site choice: a finding id has one
//! default severity wherever it fires. The tables mirror the TS engine's `registry.ts`
//! verbatim — the structure, content, text, and rule planes' defaults — and an
//! unregistered id defaults to `"error"`.
//!
//! [`Ctx`] is the rule-author finding factory: `ctx.finding(spec)` stamps the document
//! `path`, fills `level` from the registry when the caller does not supply one, and
//! carries `pos` only when supplied (omitted for absence findings).

use std::collections::HashMap;

use crate::finding::{Finding, FindingLevel, SourcePos};

/// The default severity for every structure-plane finding id.
pub const STRUCTURE_LEVELS: &[(&str, FindingLevel)] = &[
    ("structure/section-missing", FindingLevel::Error),
    ("structure/section-order", FindingLevel::Error),
    ("structure/duplicate-section", FindingLevel::Error),
    ("structure/key-collision", FindingLevel::Error),
    ("structure/anchor-missing", FindingLevel::Error),
    ("structure/block-missing", FindingLevel::Error),
    ("structure/block-kind", FindingLevel::Error),
    ("structure/gap-count", FindingLevel::Error),
    ("structure/repeat-count", FindingLevel::Error),
    ("structure/heading-depth-jump", FindingLevel::Warn),
];

/// The default severity for every content- and frontmatter-plane finding id.
pub const CONTENT_LEVELS: &[(&str, FindingLevel)] = &[
    ("content/table/column-missing", FindingLevel::Error),
    ("content/table/column-extra", FindingLevel::Error),
    ("content/table/min-rows", FindingLevel::Error),
    ("content/table/cell", FindingLevel::Error),
    ("content/list/item-kind", FindingLevel::Error),
    ("content/list/min-items", FindingLevel::Error),
    ("content/code/lang", FindingLevel::Error),
    ("content/max-words", FindingLevel::Error),
    ("frontmatter/enum", FindingLevel::Error),
    ("frontmatter/unknown-key", FindingLevel::Error),
    ("frontmatter/type", FindingLevel::Error),
    ("frontmatter/required", FindingLevel::Error),
    ("frontmatter/refine", FindingLevel::Error),
];

/// Default severities for the declarative text plane (`text/*`).
pub const TEXT_LEVELS: &[(&str, FindingLevel)] = &[
    ("text/requires", FindingLevel::Error),
    ("text/forbids", FindingLevel::Error),
    ("text/count", FindingLevel::Error),
];

/// Default severities for the rule plane — the contract-chosen namespaces the corpus
/// contracts use. An unregistered rule id still defaults to `"error"`, so this table is
/// the documented, not the load-bearing, source.
pub const RULE_LEVELS: &[(&str, FindingLevel)] = &[
    ("task/post-mortem-when-worked", FindingLevel::Error),
    ("task/completion-note-when-closed", FindingLevel::Error),
    ("summary/mentions-outcome", FindingLevel::Error),
    ("summary/names-contract", FindingLevel::Warn),
];

/// The id → default-level registry, seeded with every plane's defaults.
#[derive(Debug, Clone)]
pub struct Registry {
    levels: HashMap<&'static str, FindingLevel>,
}

impl Default for Registry {
    fn default() -> Self {
        let levels = STRUCTURE_LEVELS
            .iter()
            .chain(CONTENT_LEVELS)
            .chain(TEXT_LEVELS)
            .chain(RULE_LEVELS)
            .copied()
            .collect();
        Self { levels }
    }
}

impl Registry {
    /// The default level for `id`; an unregistered id defaults to `"error"`.
    pub fn level_for(&self, id: &str) -> FindingLevel {
        self.levels.get(id).copied().unwrap_or(FindingLevel::Error)
    }
}

/// The input to [`Ctx::finding`] — id and message required, level/pos/hint optional.
#[derive(Debug, Clone)]
pub struct FindingSpec {
    /// the finding id, `area/.../name`
    pub id: String,
    /// what is wrong, in a sentence
    pub message: String,
    /// overrides the registry's default level for the id
    pub level: Option<FindingLevel>,
    /// where in the document, if anywhere
    pub pos: Option<SourcePos>,
    /// the nearest `description:` in scope
    pub hint: Option<String>,
}

impl FindingSpec {
    /// A spec with an id and a message, and no level, position or hint.
    pub fn new(id: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            message: message.into(),
            level: None,
            pos: None,
            hint: None,
        }
    }

    /// Override the registry default level.
    pub fn level(mut self, level: FindingLevel) -> Self {
        self.level = Some(level);
        self
    }

    /// Pin the finding to a source position (omit for whole-document absence findings).
    pub fn pos(mut self, pos: SourcePos) -> Self {
        self.pos = Some(pos);
        self
    }

    /// Attach the nearest enclosing `description:` as the finding's hint —
    /// `None` leaves the slot absent, so v1 contracts stay byte-identical.
    pub fn hint_opt(mut self, hint: Option<&str>) -> Self {
        self.hint = hint.map(str::to_string);
        self
    }
}

/// The rule author's finding factory — the engine fills `path` and the id's default level.
pub struct Ctx<'a> {
    /// the document path stamped on every finding
    pub path: &'a str,
    registry: &'a Registry,
}

impl<'a> Ctx<'a> {
    /// A factory for findings of the document at `path`, with levels from `registry`.
    pub fn new(path: &'a str, registry: &'a Registry) -> Self {
        Self { path, registry }
    }

    /// Build a [`Finding`]: stamps `path`, fills `level` from the registry (defaulting to
    /// `"error"` for an unregistered id), carries `pos` only when supplied.
    pub fn finding(&self, spec: FindingSpec) -> Finding {
        let level = spec
            .level
            .unwrap_or_else(|| self.registry.level_for(&spec.id));
        Finding {
            id: spec.id,
            level,
            path: self.path.to_string(),
            pos: spec.pos,
            message: spec.message,
            hint: spec.hint,
            fix: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Contract first: a structure id resolves to its registered default; heading-depth-jump
    // is the one warn-level structure default; an unregistered id falls back to error.
    #[test]
    fn registry_defaults_match_the_ts_tables() {
        let r = Registry::default();
        assert_eq!(
            r.level_for("structure/section-missing"),
            FindingLevel::Error
        );
        assert_eq!(
            r.level_for("structure/heading-depth-jump"),
            FindingLevel::Warn
        );
        assert_eq!(r.level_for("summary/names-contract"), FindingLevel::Warn);
        assert_eq!(r.level_for("text/requires"), FindingLevel::Error);
        assert_eq!(r.level_for("totally/unregistered"), FindingLevel::Error);
    }

    #[test]
    fn ctx_finding_stamps_path_and_default_level() {
        let r = Registry::default();
        let ctx = Ctx::new("docs/note.md", &r);
        let f = ctx.finding(
            FindingSpec::new("structure/heading-depth-jump", "skip").pos(SourcePos::at(5, 1)),
        );
        assert_eq!(f.level, FindingLevel::Warn);
        assert_eq!(f.path, "docs/note.md");
        assert_eq!(f.pos, Some(SourcePos::at(5, 1)));
    }

    #[test]
    fn explicit_level_overrides_the_registry() {
        let r = Registry::default();
        let ctx = Ctx::new("a.md", &r);
        let f = ctx.finding(
            FindingSpec::new("structure/section-missing", "m").level(FindingLevel::Report),
        );
        assert_eq!(f.level, FindingLevel::Report);
    }

    #[test]
    fn pos_is_absent_unless_supplied() {
        let r = Registry::default();
        let ctx = Ctx::new("a.md", &r);
        assert_eq!(ctx.finding(FindingSpec::new("x/y", "m")).pos, None);
    }
}
