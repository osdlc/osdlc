//! The single diagnostic channel every read-time, render-time and
//! publish-time problem reports through.
//!
//! A [`Diagnostic`] is one shape with a [`DiagnosticScope`] saying which part
//! of the pipeline it is about: a source note, one runtime's mapping of one
//! canonical concept, or one file at a destination. Read-time problems
//! (skipped notes, unknown `ap-` keys, dangling wikilinks, a non-semver
//! version), render-time problems (a tool with no counterpart on a runtime,
//! a redundant override) and publish-time problems all report through this
//! one type rather than three separate ones.
//!
//! This module only defines the shape. Later phases connect it to the read
//! path, the render path, and the run policy (`on-unmapped`) that decides
//! whether a diagnostic is ignored, kept as a warning, or promoted to a
//! refusal.

use serde::{Deserialize, Serialize};

use crate::capabilities::ConceptKind;
use crate::runtime::RuntimeId;

/// How serious a [`Diagnostic`] is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Severity {
    /// Worth surfacing; nothing failed.
    Warning,
    /// A run under a strict policy refuses on this.
    Error,
}

impl Severity {
    /// The wire spelling, which prose never varies from.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Warning => "warning",
            Self::Error => "error",
        }
    }
}

impl std::fmt::Display for Severity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// The closed set of reasons a [`Diagnostic`] can carry.
///
/// Seeded with the codes render diagnostics need; the read-scope codes join
/// them as the read path moves onto this channel.
///
/// **Experimental.** New codes will be added, and existing ones may change,
/// in a minor release.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiagnosticCode {
    /// A canonical tool name has no counterpart on this runtime.
    ToolUnmapped,
    /// An `ap-overrides` key repeats what the projection already writes.
    RedundantOverride,
}

impl DiagnosticCode {
    /// The wire spelling, which prose never varies from.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ToolUnmapped => "tool-unmapped",
            Self::RedundantOverride => "redundant-override",
        }
    }
}

impl std::fmt::Display for DiagnosticCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Which part of the pipeline a [`Diagnostic`] is about.
///
/// Internally tagged on `scope`, so the wire carries exactly one object per
/// diagnostic rather than a scope key alongside a separately-shaped payload.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "scope", rename_all = "kebab-case")]
pub enum DiagnosticScope {
    /// A source note, read-time.
    Source {
        /// Root-relative path.
        note: String,
    },
    /// One runtime's mapping of one canonical concept, render-time.
    Render {
        /// Which runtime is rendering.
        runtime: RuntimeId,
        /// Which kind of concept this is about.
        concept: ConceptKind,
        /// The canonical name or key the runtime was asked to render.
        canonical: String,
    },
    /// One file at one destination, publish-time.
    Destination {
        /// The destination root's name.
        root: String,
        /// Path within the destination.
        path: String,
    },
}

/// One problem, wherever in the pipeline it was found.
///
/// The single channel read-time, render-time and publish-time problems all
/// report through.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Diagnostic {
    /// How serious the problem is.
    pub severity: Severity,
    /// What kind of problem it is.
    pub code: DiagnosticCode,
    /// Flattened onto the wire, so a `Diagnostic` is one flat object with a
    /// `scope` tag rather than a `scope` key nesting a second one.
    #[serde(flatten)]
    pub scope: DiagnosticScope,
    /// What the harness itself calls the thing named in `scope`, when it has
    /// a name of its own and this diagnostic is about the gap.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub harness_spelling: Option<String>,
    /// Prose for a human. Omitted from the wire when there is none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_scope_round_trips() {
        let diagnostic = Diagnostic {
            severity: Severity::Warning,
            code: DiagnosticCode::ToolUnmapped,
            scope: DiagnosticScope::Source {
                note: "skills/code-review.md".to_string(),
            },
            harness_spelling: None,
            detail: None,
        };
        let value = serde_json::to_value(&diagnostic).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "severity": "warning",
                "code": "tool-unmapped",
                "scope": "source",
                "note": "skills/code-review.md",
            })
        );
        let round_tripped: Diagnostic = serde_json::from_value(value).unwrap();
        assert_eq!(round_tripped, diagnostic);
    }

    #[test]
    fn render_scope_round_trips() {
        let diagnostic = Diagnostic {
            severity: Severity::Warning,
            code: DiagnosticCode::ToolUnmapped,
            scope: DiagnosticScope::Render {
                runtime: RuntimeId::CodexCli,
                concept: ConceptKind::Tool,
                canonical: "AskUserQuestion".to_string(),
            },
            harness_spelling: Some("ask_user".to_string()),
            detail: None,
        };
        let value = serde_json::to_value(&diagnostic).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "severity": "warning",
                "code": "tool-unmapped",
                "scope": "render",
                "runtime": "codex-cli",
                "concept": "tool",
                "canonical": "AskUserQuestion",
                "harness_spelling": "ask_user",
            })
        );
        let round_tripped: Diagnostic = serde_json::from_value(value).unwrap();
        assert_eq!(round_tripped, diagnostic);
    }

    #[test]
    fn destination_scope_round_trips() {
        let diagnostic = Diagnostic {
            severity: Severity::Error,
            code: DiagnosticCode::RedundantOverride,
            scope: DiagnosticScope::Destination {
                root: "example-owner".to_string(),
                path: "skills/code-review/SKILL.md".to_string(),
            },
            harness_spelling: None,
            detail: Some("already written by the projection".to_string()),
        };
        let value = serde_json::to_value(&diagnostic).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "severity": "error",
                "code": "redundant-override",
                "scope": "destination",
                "root": "example-owner",
                "path": "skills/code-review/SKILL.md",
                "detail": "already written by the projection",
            })
        );
        let round_tripped: Diagnostic = serde_json::from_value(value).unwrap();
        assert_eq!(round_tripped, diagnostic);
    }

    #[test]
    fn hook_event_concept_kind_is_kebab_case() {
        let value = serde_json::to_value(ConceptKind::HookEvent).unwrap();
        assert_eq!(value, serde_json::json!("hook-event"));
    }
}
