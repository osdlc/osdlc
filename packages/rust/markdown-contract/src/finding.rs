//! The `Finding` model: the JSON shape both engines emit,
//! `{"id","level","path","pos":{"line","col"?}?,"message","hint"?,"fix"?}`. Optional
//! fields are omitted, never `null`; `pos.line` and `pos.col` are 1-based; `level` is
//! `"error" | "warn" | "report"`. A `Finding` serialized here reads back from the TS
//! engine's `--format json` output and the other way round.

use serde::{Deserialize, Serialize};

/// A finding's severity. Each id has a default level in the registry; a rule or a text
/// constraint's `level:` can set another.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FindingLevel {
    /// Fails the document.
    Error,
    /// Reported, and does not fail the document.
    Warn,
    /// Informational, and does not fail the document.
    Report,
}

/// A single source point. 1-based `line`; `col` (1-based) rides along when known and is
/// omitted from JSON when absent — matching the TS `SourcePos`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourcePos {
    /// 1-based line
    pub line: u32,
    /// 1-based column, when known
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub col: Option<u32>,
}

impl SourcePos {
    /// A line-only position (no column) — the shape absence-adjacent findings pin.
    pub fn line(line: u32) -> Self {
        Self { line, col: None }
    }

    /// A full line + column position.
    pub fn at(line: u32, col: u32) -> Self {
        Self {
            line,
            col: Some(col),
        }
    }
}

/// A start–end source range for a [`TextEdit`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct EditRange {
    /// where the edit starts
    pub start: SourcePos,
    /// where the edit ends
    pub end: SourcePos,
}

/// A machine-applicable repair an external tool could apply. **Provisional** — a
/// `Finding.fix` only *describes* a remedy; this engine never edits documents.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TextEdit {
    /// the range to replace
    pub range: EditRange,
    /// the text that replaces the range
    #[serde(rename = "newText")]
    pub new_text: String,
}

/// The `fix` slot on a finding: a description, optionally with a concrete edit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fix {
    /// what the repair does
    pub description: String,
    /// the concrete edit, when there is one
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub edit: Option<TextEdit>,
}

/// One validation finding — the unit of the interchange format.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Finding {
    /// namespaced `area/.../name`, e.g. `"structure/section-missing"`
    pub id: String,
    /// the id's default level from the registry, unless the rule or text constraint
    /// sets one
    pub level: FindingLevel,
    /// the source document's file path (`ctx.path`), for `<path>:<line>` — not a structural path
    pub path: String,
    /// omitted for whole-document absence findings
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pos: Option<SourcePos>,
    /// what is wrong, in a sentence
    pub message: String,
    /// the nearest enclosing `description:` in the contract; omitted when none is in
    /// scope
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    /// describes only; applying is a separate repair pass
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fix: Option<Fix>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // The exact JSON a positioned finding serializes to: the shape the TS engine emits.
    #[test]
    fn positioned_finding_serializes_to_the_interchange_shape() {
        let f = Finding {
            id: "structure/section-missing".into(),
            level: FindingLevel::Error,
            path: "notes/rollout.md".into(),
            pos: Some(SourcePos::at(1, 1)),
            message: "required section ‘Overview’ is missing".into(),
            hint: None,
            fix: None,
        };
        assert_eq!(
            serde_json::to_string(&f).unwrap(),
            r#"{"id":"structure/section-missing","level":"error","path":"notes/rollout.md","pos":{"line":1,"col":1},"message":"required section ‘Overview’ is missing"}"#
        );
    }

    #[test]
    fn absence_finding_omits_pos_entirely() {
        let f = Finding {
            id: "structure/section-missing".into(),
            level: FindingLevel::Error,
            path: "doc.md".into(),
            pos: None,
            message: "m".into(),
            hint: None,
            fix: None,
        };
        let json = serde_json::to_string(&f).unwrap();
        assert!(!json.contains("pos"));
        assert!(!json.contains("hint"));
        assert!(!json.contains("fix"));
    }

    // `hint` serializes under the TS field name when present, and is omitted when absent.
    #[test]
    fn hint_serializes_when_present() {
        let f = Finding {
            id: "structure/section-missing".into(),
            level: FindingLevel::Error,
            path: "doc.md".into(),
            pos: None,
            message: "m".into(),
            hint: Some("One paragraph naming the outcome.".into()),
            fix: None,
        };
        assert_eq!(
            serde_json::to_string(&f).unwrap(),
            r#"{"id":"structure/section-missing","level":"error","path":"doc.md","message":"m","hint":"One paragraph naming the outcome."}"#
        );
    }

    #[test]
    fn line_only_pos_omits_col() {
        let json = serde_json::to_string(&SourcePos::line(7)).unwrap();
        assert_eq!(json, r#"{"line":7}"#);
    }

    #[test]
    fn levels_serialize_lowercase() {
        assert_eq!(
            serde_json::to_string(&FindingLevel::Error).unwrap(),
            "\"error\""
        );
        assert_eq!(
            serde_json::to_string(&FindingLevel::Warn).unwrap(),
            "\"warn\""
        );
        assert_eq!(
            serde_json::to_string(&FindingLevel::Report).unwrap(),
            "\"report\""
        );
    }

    #[test]
    fn deserializes_ts_engine_output() {
        let f: Finding = serde_json::from_str(
            r#"{"id":"structure/heading-depth-jump","level":"warn","path":"a.md","pos":{"line":5},"message":"skip"}"#,
        )
        .unwrap();
        assert_eq!(f.level, FindingLevel::Warn);
        assert_eq!(f.pos, Some(SourcePos::line(5)));
        assert_eq!(f.fix, None);
    }

    #[test]
    fn fix_round_trips_with_camel_case_new_text() {
        let f = Fix {
            description: "add the heading".into(),
            edit: Some(TextEdit {
                range: EditRange {
                    start: SourcePos::at(1, 1),
                    end: SourcePos::at(1, 1),
                },
                new_text: "## Overview\n".into(),
            }),
        };
        let json = serde_json::to_string(&f).unwrap();
        assert!(json.contains("\"newText\":\"## Overview\\n\""));
        assert_eq!(serde_json::from_str::<Fix>(&json).unwrap(), f);
    }
}
