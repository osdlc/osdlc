//! How each runtime spells a user's invocation of a skill.
//!
//! A skill that names another skill renders that runtime's own call, the way
//! it renders that runtime's own tool names. [`RuntimeId::skill_call`] is the
//! renderer and [`RuntimeId::skill_call_syntax`] the sourced answer behind it.
//! A runtime with no documented explicit invocation gets the bare name.

use thiserror::Error as ThisError;

use crate::RuntimeId;
use crate::capabilities::{AGENT_SKILLS_SPEC, Evidence, UNVERSIONED};

/// The date the call syntaxes below were read. Pi's syntax carries
/// `runtimes::pi::OBSERVED`, the date of the one Pi source reading.
pub(crate) const SKILL_CALL_OBSERVED: &str = "2026-10-01";

/// One runtime's call syntax.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SkillCallSyntax {
    /// Written before the name: `/`, `$`, `/skill:`, or empty where the
    /// runtime documents no explicit invocation.
    pub prefix: &'static str,
    /// Whether a plugin namespace is written as `<ns>:` before the name.
    /// `false` means the runtime has no plugin namespace, and
    /// [`RuntimeId::skill_call`] refuses one.
    pub namespaced: bool,
    /// Where the syntax was read, or where its absence was.
    pub evidence: Evidence,
    /// What the syntax does not say on its own.
    pub note: &'static str,
}

/// Why [`RuntimeId::skill_call`] refused to render a call.
#[derive(Debug, Clone, PartialEq, Eq, ThisError)]
#[non_exhaustive]
pub enum SkillCallError {
    /// A namespace was passed to a runtime with no plugin namespace. Pass the
    /// name the skill is published under on that runtime (for example
    /// `example-task-work`) and no namespace.
    #[error(
        "{} has no plugin namespace; pass the published name and no namespace (got {namespace:?})",
        runtime.as_str()
    )]
    NamespaceUnsupported {
        /// The runtime the call was for.
        runtime: RuntimeId,
        /// The namespace that was passed.
        namespace: String,
    },
    /// The name or the namespace is empty or holds a character outside
    /// `[A-Za-z0-9_.-]`.
    #[error("invalid skill-call {part} {value:?}: {reason}")]
    InvalidPart {
        /// `"name"` or `"namespace"`.
        part: &'static str,
        /// The value, as passed.
        value: String,
        /// What is wrong with it.
        reason: &'static str,
    },
}

const CLAUDE_CODE: Evidence = Evidence {
    url: "https://code.claude.com/docs/en/skills",
    observed_on: SKILL_CALL_OBSERVED,
    version: UNVERSIONED,
};

const CODEX_CLI: Evidence = Evidence {
    url: "https://github.com/openai/codex/blob/57ac6f51639f7cad705a48ac4bd8073034a2f150/codex-rs/ext/skills/src/loader/environment.rs#L259",
    observed_on: SKILL_CALL_OBSERVED,
    version: "openai/codex@57ac6f51639f7cad705a48ac4bd8073034a2f150",
};

const CURSOR: Evidence = Evidence {
    url: "https://cursor.com/docs/skills",
    observed_on: SKILL_CALL_OBSERVED,
    version: UNVERSIONED,
};

const PI: Evidence = Evidence {
    url: crate::runtimes::pi::pi_source!("packages/coding-agent/src/core/agent-session.ts#L3330"),
    observed_on: crate::runtimes::pi::OBSERVED,
    version: crate::runtimes::pi::PI_COMMIT,
};

const ANTIGRAVITY: Evidence = Evidence {
    url: "https://antigravity.google/docs/cli/gcli-migration",
    observed_on: SKILL_CALL_OBSERVED,
    version: UNVERSIONED,
};

const OPENCODE: Evidence = Evidence {
    url: "https://opencode.ai/docs/skills/",
    observed_on: SKILL_CALL_OBSERVED,
    version: UNVERSIONED,
};

const AMP: Evidence = Evidence {
    url: "https://ampcode.com/docs/customize/skills",
    observed_on: SKILL_CALL_OBSERVED,
    version: UNVERSIONED,
};

const GITHUB_COPILOT: Evidence = Evidence {
    url: "https://docs.github.com/en/copilot/concepts/agents/about-agent-skills",
    observed_on: SKILL_CALL_OBSERVED,
    version: UNVERSIONED,
};

/// The specification, read again on [`SKILL_CALL_OBSERVED`] for this
/// question. It defines no invocation syntax.
const AGENT_SKILLS: Evidence = Evidence {
    observed_on: SKILL_CALL_OBSERVED,
    ..AGENT_SKILLS_SPEC
};

/// A runtime whose skills page documents no call a user types.
const fn undocumented(evidence: Evidence) -> SkillCallSyntax {
    SkillCallSyntax {
        prefix: "",
        namespaced: false,
        evidence,
        note: "no explicit skill invocation documented; the bare name is what the model matches on",
    }
}

impl RuntimeId {
    /// This runtime's skill-call syntax and where it was read.
    pub fn skill_call_syntax(self) -> SkillCallSyntax {
        match self {
            RuntimeId::ClaudeCode => SkillCallSyntax {
                prefix: "/",
                namespaced: true,
                evidence: CLAUDE_CODE,
                note: "plugin skills are `/plugin-name:skill-name`",
            },
            RuntimeId::CodexCli => SkillCallSyntax {
                prefix: "$",
                namespaced: true,
                evidence: CODEX_CLI,
                note: "plugin skills load as `{namespace}:{base_name}`; `$skill-name` mentions select one (https://github.com/openai/codex/blob/57ac6f51639f7cad705a48ac4bd8073034a2f150/codex-rs/skills/src/selection.rs#L31-L37)",
            },
            RuntimeId::Cursor => SkillCallSyntax {
                prefix: "/",
                namespaced: false,
                evidence: CURSOR,
                note: "\"Type / in Agent chat and search for the skill name\"; no plugin namespace documented",
            },
            RuntimeId::Pi => SkillCallSyntax {
                prefix: "/skill:",
                namespaced: false,
                evidence: PI,
                note: "each skill registers the command `skill:${skill.name}`; Pi has no plugin namespace",
            },
            RuntimeId::Antigravity => undocumented(ANTIGRAVITY),
            RuntimeId::OpenCode => undocumented(OPENCODE),
            RuntimeId::Amp => undocumented(AMP),
            RuntimeId::GithubCopilot => undocumented(GITHUB_COPILOT),
            RuntimeId::NpmPackage | RuntimeId::Portable => undocumented(AGENT_SKILLS),
        }
    }

    /// The token a user types to invoke skill `name`, without backticks.
    ///
    /// `name` is the name the skill is published under on this runtime.
    /// `namespace` is the owning plugin, and only a runtime whose syntax is
    /// [`SkillCallSyntax::namespaced`] takes one. For any other runtime the
    /// caller folds the plugin into `name` at publish time and passes `None`:
    ///
    /// ```
    /// use agent_adapt::RuntimeId;
    ///
    /// assert_eq!(
    ///     RuntimeId::ClaudeCode.skill_call(Some("example"), "task-work").unwrap(),
    ///     "/example:task-work"
    /// );
    /// assert_eq!(
    ///     RuntimeId::Pi.skill_call(None, "example-task-work").unwrap(),
    ///     "/skill:example-task-work"
    /// );
    /// assert!(RuntimeId::Pi.skill_call(Some("example"), "task-work").is_err());
    /// ```
    ///
    /// # Errors
    ///
    /// [`SkillCallError::NamespaceUnsupported`] when a namespace is passed to
    /// a runtime without one, and [`SkillCallError::InvalidPart`] when the
    /// name or the namespace is empty or holds a character outside
    /// `[A-Za-z0-9_.-]`.
    pub fn skill_call(self, namespace: Option<&str>, name: &str) -> Result<String, SkillCallError> {
        check_part("name", name)?;
        let syntax = self.skill_call_syntax();
        let Some(ns) = namespace else {
            return Ok(format!("{}{name}", syntax.prefix));
        };
        check_part("namespace", ns)?;
        if !syntax.namespaced {
            return Err(SkillCallError::NamespaceUnsupported {
                runtime: self,
                namespace: ns.to_owned(),
            });
        }
        Ok(format!("{}{ns}:{name}", syntax.prefix))
    }
}

fn check_part(part: &'static str, value: &str) -> Result<(), SkillCallError> {
    let reason = if value.is_empty() {
        "empty"
    } else if value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
    {
        return Ok(());
    } else {
        "only `[A-Za-z0-9_.-]` is allowed"
    };
    Err(SkillCallError::InvalidPart {
        part,
        value: value.to_owned(),
        reason,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_runtime_renders_its_call() {
        // (runtime, the call for namespace `example` where the runtime has
        // namespaces, the call for the bare published name)
        let cases: &[(RuntimeId, Option<&str>, &str)] = &[
            (
                RuntimeId::ClaudeCode,
                Some("/example:task-work"),
                "/task-work",
            ),
            (
                RuntimeId::CodexCli,
                Some("$example:task-work"),
                "$task-work",
            ),
            (RuntimeId::Cursor, None, "/task-work"),
            (RuntimeId::Pi, None, "/skill:task-work"),
            (RuntimeId::Antigravity, None, "task-work"),
            (RuntimeId::OpenCode, None, "task-work"),
            (RuntimeId::Amp, None, "task-work"),
            (RuntimeId::GithubCopilot, None, "task-work"),
            (RuntimeId::NpmPackage, None, "task-work"),
            (RuntimeId::Portable, None, "task-work"),
        ];
        assert_eq!(cases.len(), RuntimeId::ALL.len(), "every runtime covered");
        for (id, with, without) in cases {
            let namespaced = id.skill_call(Some("example"), "task-work");
            match with {
                Some(call) => assert_eq!(namespaced.as_deref(), Ok(*call), "{id:?}"),
                None => assert!(
                    matches!(namespaced, Err(SkillCallError::NamespaceUnsupported { .. })),
                    "{id:?}: {namespaced:?}"
                ),
            }
            assert_eq!(
                id.skill_call(None, "task-work").as_deref(),
                Ok(*without),
                "{id:?}"
            );
        }
    }

    #[test]
    fn a_non_namespaced_runtime_takes_the_published_name() {
        assert_eq!(
            RuntimeId::Pi
                .skill_call(None, "example-task-work")
                .as_deref(),
            Ok("/skill:example-task-work")
        );
    }

    #[test]
    fn malformed_parts_are_refused() {
        for (namespace, name) in [
            (None, ""),
            (None, "example:task-work"),
            (None, "task work"),
            (Some(""), "task-work"),
            (Some("sd:lc"), "task-work"),
            (Some("sd lc"), "task-work"),
            (None, "a/b`$"),
            (None, "a`b"),
            (None, "a/b"),
            (None, "a$b"),
            (Some("a`b"), "task-work"),
        ] {
            let result = RuntimeId::ClaudeCode.skill_call(namespace, name);
            assert!(
                matches!(result, Err(SkillCallError::InvalidPart { .. })),
                "{namespace:?} {name:?}: {result:?}"
            );
        }
    }

    #[test]
    fn allowlisted_characters_are_accepted() {
        for name in ["example-task-work", "a_b", "a.b", "A1"] {
            assert!(
                RuntimeId::ClaudeCode.skill_call(None, name).is_ok(),
                "{name}"
            );
        }
    }

    #[test]
    fn every_syntax_is_sourced() {
        for id in RuntimeId::ALL.iter().copied() {
            let syntax = id.skill_call_syntax();
            assert!(!syntax.evidence.url.is_empty(), "{id:?} evidence");
            assert!(!syntax.note.is_empty(), "{id:?} note");
            if syntax.prefix.is_empty() {
                assert!(!syntax.namespaced, "{id:?}: a bare name has no namespace");
            }
        }
    }
}
