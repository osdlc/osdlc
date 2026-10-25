//! Turning a [`Argument`] list into what a rendered file actually shows: a
//! single hint string, and a body section.
//!
//! Three functions, three destinations on the rendered file:
//!
//! * [`derive_argument_hint`] — a single line for a dialect that has one
//!   field for it (Claude Code's `argument-hint`). Never called
//!   automatically: [`crate::render::render_skill_md`] and
//!   [`crate::render::render_command_md`] emit whatever
//!   [`crate::Skill::argument_hint`] / [`crate::Command::argument_hint`]
//!   already holds, hand-written or derived, because a caller that derived
//!   one and a caller that wrote one by hand must not be told apart here —
//!   see those fields' own documentation.
//! * [`derive_argument_names`] — the plain list of names, for Claude Code's
//!   own `arguments:` key. Same non-automatic contract as the hint, and the
//!   same field pair to read: [`crate::Skill::argument_names`] /
//!   [`crate::Command::argument_names`].
//! * [`render_arguments_section`] — the whole list, written into the body.
//!   Every render impl calls this one directly, appending what it returns
//!   after the rest of the body.
//!
//! # Why the body section is not optional the way the hint is
//!
//! `argument-hint` is Claude Code's own field, so a dialect that omits it
//! (every dialect but Claude Code's, via
//! [`crate::AGENT_SKILLS_EXTENSION_FIELDS`]) legitimately has nowhere to put
//! it. The body has no such closed vocabulary — every runtime reads
//! Markdown prose — so the section is written everywhere the skill or
//! command declares arguments, in the target's own passing syntax where one
//! exists and as a plain description where none does.
//!
//! # Skill site vs command site
//!
//! [`ArgumentSite`] exists because the same runtime can have an argument
//! mechanism for one artifact kind and none for the other. Codex CLI,
//! OpenCode, and GitHub Copilot each define an argument-passing
//! syntax for a *command* (typed by a person) but document no such thing for
//! a *skill* (loaded by the model on its own judgement) — see each runtime's
//! module doc for the source line. Claude Code is the one runtime whose
//! skills and commands share one mechanism, so it names its placeholders at
//! both sites identically.

use crate::model::Argument;
use crate::runtime::RuntimeId;

/// Folds `arguments` into a single hint string, in declaration order.
///
/// `None` for an empty list — nothing to hint at. Otherwise one token per
/// argument, space-joined:
///
/// | Shape | Token |
/// |---|---|
/// | required | `<name>` |
/// | optional | `[name]` |
/// | required, enum | `<name: a\|b>` |
/// | optional, enum | `[name: a\|b]` |
/// | with a default | the above, `=default` appended before the closing bracket |
///
/// Angle brackets for required and square brackets for optional is the
/// convention Claude Code's and Codex's own examples use; the enum and
/// default forms extend it rather than inventing a second one.
///
/// # Examples
///
/// ```
/// use agent_adapt::{Argument, render::derive_argument_hint};
///
/// let hint = derive_argument_hint(&[
///     Argument::required("pr-number", "Pull request to review"),
///     Argument {
///         name: "format".into(),
///         description: None,
///         required: false,
///         values: Some(vec!["markdown".into(), "json".into()]),
///         default: Some("markdown".into()),
///     },
/// ]);
/// assert_eq!(hint.as_deref(), Some("<pr-number> [format: markdown|json=markdown]"));
/// ```
pub fn derive_argument_hint(arguments: &[Argument]) -> Option<String> {
    if arguments.is_empty() {
        return None;
    }
    Some(
        arguments
            .iter()
            .map(hint_token)
            .collect::<Vec<_>>()
            .join(" "),
    )
}

fn hint_token(arg: &Argument) -> String {
    let (open, close) = if arg.required { ('<', '>') } else { ('[', ']') };
    let mut body = arg.name.clone();
    if let Some(values) = &arg.values {
        body = format!("{body}: {}", values.join("|"));
    }
    if let Some(default) = &arg.default {
        body = format!("{body}={default}");
    }
    format!("{open}{body}{close}")
}

/// Folds `arguments` into the plain name list Claude Code's own
/// `arguments:` frontmatter key wants, in declaration order — the order its
/// `$0`, `$1`, … positional references count from (Claude Code's
/// `$ARGUMENTS[N]`/`$N` are 0-based: `$0` is the first argument), and the
/// order `$name` binds each name to a position. `None` for an empty list.
///
/// # Examples
///
/// ```
/// use agent_adapt::{Argument, render::derive_argument_names};
///
/// let names = derive_argument_names(&[
///     Argument::required("issue", "The issue to fix"),
///     Argument::optional("branch", "Target branch"),
/// ]);
/// assert_eq!(names, Some(vec!["issue".to_owned(), "branch".to_owned()]));
/// ```
pub fn derive_argument_names(arguments: &[Argument]) -> Option<Vec<String>> {
    if arguments.is_empty() {
        return None;
    }
    Some(arguments.iter().map(|arg| arg.name.clone()).collect())
}

/// Which artifact [`render_arguments_section`] is writing into.
///
/// A skill is loaded by the model when it judges the description relevant;
/// a command is typed by a person as `/name`. The same runtime's argument
/// mechanism can apply to one and not the other — see the module doc.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArgumentSite {
    /// Writing into a `SKILL.md` body.
    Skill,
    /// Writing into a command file's body.
    Command,
}

/// Renders `arguments` into a Markdown "Arguments" section for `runtime` at
/// `site`, `None` for an empty list.
///
/// Claude Code gets a lead-in naming its own substitution mechanism at
/// either site — `$ARGUMENTS` for the full invocation text, `$0`/`$1`/…
/// positional (0-based, matching Claude Code's own `$ARGUMENTS[N]`/`$N`)
/// and `$name` named per declaration order, which is how that order is
/// decided and the same order [`derive_argument_names`] emits into
/// `arguments:`.
///
/// At [`ArgumentSite::Command`], three more runtimes name their own
/// mechanism, each documented for a *command* invocation and nowhere for a
/// skill:
///
/// | Runtime | Mechanism named |
/// |---|---|
/// | [`RuntimeId::CodexCli`] | `$ARGUMENTS`; positional `$1`.. (1-based); named `$KEY` set at invocation as `KEY=value` |
/// | [`RuntimeId::OpenCode`] | `$ARGUMENTS`; positional `$1`.. (1-based) |
/// | [`RuntimeId::GithubCopilot`] | `${input:name}` per declared argument |
///
/// Every other (runtime, site) pair — including all of these runtimes at
/// [`ArgumentSite::Skill`] — gets the bullet list alone: a prose-only
/// section, because no harness surveyed documents an argument mechanism for
/// a skill besides Claude Code's own.
///
/// # Examples
///
/// ```
/// use agent_adapt::{Argument, RuntimeId, render::{ArgumentSite, render_arguments_section}};
///
/// let section = render_arguments_section(
///     &[Argument::required("pr-number", "Pull request to review")],
///     RuntimeId::Antigravity,
///     ArgumentSite::Skill,
/// )
/// .unwrap();
/// assert!(section.contains("## Arguments"));
/// assert!(section.contains("`pr-number` (required): Pull request to review"));
/// assert!(!section.contains('$'), "Antigravity skills have no mechanism to name");
/// ```
pub fn render_arguments_section(
    arguments: &[Argument],
    runtime: RuntimeId,
    site: ArgumentSite,
) -> Option<String> {
    if arguments.is_empty() {
        return None;
    }
    let mut out = String::from("## Arguments\n\n");
    match (runtime, site) {
        (RuntimeId::ClaudeCode, _) => claude_code_lead_in(&mut out, arguments),
        (RuntimeId::CodexCli, ArgumentSite::Command) => codex_cli_lead_in(&mut out, arguments),
        (RuntimeId::OpenCode, ArgumentSite::Command) => opencode_lead_in(&mut out, arguments),
        (RuntimeId::GithubCopilot, ArgumentSite::Command) => copilot_lead_in(&mut out, arguments),
        _ => {}
    }
    for arg in arguments {
        out.push_str("- ");
        out.push_str(&describe_argument(arg));
        out.push('\n');
    }
    Some(out)
}

fn claude_code_lead_in(out: &mut String, arguments: &[Argument]) {
    out.push_str(
        "The full invocation text is available as `$ARGUMENTS`. Each argument below is \
         also available by position and by name, counting from `$0` in declaration order: ",
    );
    let refs: Vec<String> = arguments
        .iter()
        .enumerate()
        .map(|(i, arg)| format!("`${i}`/`${}`", arg.name))
        .collect();
    out.push_str(&refs.join(", "));
    out.push_str(".\n\n");
}

/// Codex custom prompts: `$1`..`$9` positional (1-based, per
/// <https://learn.chatgpt.com/docs/custom-prompts> — "Positional placeholders:
/// `$1` through `$9` expand from space-separated arguments"), `$ARGUMENTS`
/// for the full tail, and a named `$KEY` set at invocation as `KEY=value`
/// (same source: "Named placeholders: Use uppercase names like `$FILE` or
/// `$TICKET_ID` and supply values as `KEY=value`"). An `ap-arguments` name
/// is a lowercase slug, so the named form is derived by upper-casing it and
/// turning hyphens into underscores — `pr-number` becomes `$PR_NUMBER`.
fn codex_cli_lead_in(out: &mut String, arguments: &[Argument]) {
    out.push_str(
        "The full invocation text is available as `$ARGUMENTS`. Each argument below is also \
         available by position, counting from `$1` in declaration order, and by a named \
         variable set at invocation as `KEY=value` (`$$` escapes a literal `$`): ",
    );
    let refs: Vec<String> = arguments
        .iter()
        .enumerate()
        .map(|(i, arg)| format!("`${}`/`${}`", i + 1, codex_named_variable(&arg.name)))
        .collect();
    out.push_str(&refs.join(", "));
    out.push_str(".\n\n");
}

/// `pr-number` -> `PR_NUMBER`, matching Codex's own uppercase-with-underscores
/// convention for a named prompt variable.
fn codex_named_variable(name: &str) -> String {
    name.to_ascii_uppercase().replace('-', "_")
}

/// OpenCode commands: `$ARGUMENTS` for the full tail, `$1`/`$2`/`$3`… for
/// individual arguments (1-based — <https://opencode.ai/docs/commands/>:
/// "`$1` - First argument", "`$2` - Second argument"). No named-variable
/// form is documented.
fn opencode_lead_in(out: &mut String, arguments: &[Argument]) {
    out.push_str(
        "The full invocation text is available as `$ARGUMENTS`. Each argument below is also \
         available by position, counting from `$1` in declaration order: ",
    );
    let refs: Vec<String> = (1..=arguments.len()).map(|i| format!("`${i}`")).collect();
    out.push_str(&refs.join(", "));
    out.push_str(".\n\n");
}

/// GitHub Copilot prompt files: each declared argument is available as
/// `${input:name}` (optionally `${input:name:placeholder}`), and the chat
/// UI prompts the user for it before the prompt runs
/// (<https://code.visualstudio.com/docs/agent-customization/prompt-files>).
fn copilot_lead_in(out: &mut String, arguments: &[Argument]) {
    out.push_str("Each argument below is available as an input variable: ");
    let refs: Vec<String> = arguments
        .iter()
        .map(|arg| format!("`${{input:{}}}`", arg.name))
        .collect();
    out.push_str(&refs.join(", "));
    out.push_str(".\n\n");
}

/// Appends [`render_arguments_section`]'s output to `body`, separated by a
/// blank line, trimming trailing whitespace off both halves first so the
/// blank line is exactly one line and the result carries no trailing
/// newline of its own — each caller's existing trailing-newline rule
/// (`skill_md` tops up to one if none, `command_md` appends exactly one)
/// still decides the final byte.
///
/// Returns `body` unchanged, not even re-trimmed, when `arguments` is
/// empty — a note with no arguments must render byte-identically to how it
/// rendered before this module existed.
///
/// `pub(crate)`: [`crate::render::skill_md`] and every per-runtime command
/// renderer call this rather than each composing the blank line themselves.
pub(crate) fn append_arguments_section(
    body: &str,
    arguments: &[Argument],
    runtime: RuntimeId,
    site: ArgumentSite,
) -> String {
    let Some(section) = render_arguments_section(arguments, runtime, site) else {
        return body.to_owned();
    };
    let trimmed = body.trim_end();
    let section = section.trim_end();
    if trimmed.is_empty() {
        section.to_owned()
    } else {
        format!("{trimmed}\n\n{section}")
    }
}

/// One bullet's worth of prose for `arg`: name, requiredness, its enum and
/// default when it has them, and its description when it has one.
fn describe_argument(arg: &Argument) -> String {
    let mut meta = vec![if arg.required { "required" } else { "optional" }.to_owned()];
    if let Some(values) = &arg.values {
        let quoted: Vec<String> = values.iter().map(|v| format!("`{v}`")).collect();
        meta.push(format!("one of {}", quoted.join(", ")));
    }
    if let Some(default) = &arg.default {
        meta.push(format!("default `{default}`"));
    }
    let meta = format!("({})", meta.join(", "));
    match arg.description.as_deref().map(str::trim) {
        Some(desc) if !desc.is_empty() => format!("`{}` {meta}: {desc}", arg.name),
        _ => format!("`{}` {meta}", arg.name),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn required(name: &str) -> Argument {
        Argument::required(name, "desc")
    }

    #[test]
    fn no_arguments_derives_no_hint_and_no_section() {
        assert_eq!(derive_argument_hint(&[]), None);
        assert_eq!(
            render_arguments_section(&[], RuntimeId::ClaudeCode, ArgumentSite::Command),
            None
        );
    }

    #[test]
    fn hint_wraps_required_in_angle_brackets_and_optional_in_square() {
        let hint =
            derive_argument_hint(&[required("pr-number"), Argument::optional("verbose", "desc")])
                .unwrap();
        assert_eq!(hint, "<pr-number> [verbose]");
    }

    #[test]
    fn hint_renders_an_enum_pipe_separated_inside_the_bracket() {
        let mut arg = required("mode");
        arg.values = Some(vec!["fast".into(), "thorough".into()]);
        let hint = derive_argument_hint(&[arg]).unwrap();
        assert_eq!(hint, "<mode: fast|thorough>");
    }

    #[test]
    fn hint_appends_the_default_before_the_closing_bracket() {
        let mut arg = Argument::optional("format", "desc");
        arg.values = Some(vec!["markdown".into(), "json".into()]);
        arg.default = Some("markdown".into());
        let hint = derive_argument_hint(&[arg]).unwrap();
        assert_eq!(hint, "[format: markdown|json=markdown]");
    }

    #[test]
    fn hint_joins_multiple_arguments_in_declaration_order_space_separated() {
        let hint = derive_argument_hint(&[required("first"), Argument::optional("second", "desc")])
            .unwrap();
        assert_eq!(hint, "<first> [second]");
    }

    #[test]
    fn claude_code_section_names_arguments_positional_and_named_refs() {
        for site in [ArgumentSite::Skill, ArgumentSite::Command] {
            let section = render_arguments_section(
                &[required("first"), Argument::optional("second", "desc")],
                RuntimeId::ClaudeCode,
                site,
            )
            .unwrap();
            assert!(section.starts_with("## Arguments\n\n"), "{site:?}");
            assert!(section.contains("$ARGUMENTS"), "{site:?}");
            // 0-based: Claude Code's own `$ARGUMENTS[N]`/`$N` count from `$0`.
            assert!(section.contains("`$0`/`$first`"), "{site:?}");
            assert!(section.contains("`$1`/`$second`"), "{site:?}");
            assert!(section.contains("- `first` (required): desc"), "{site:?}");
            assert!(section.contains("- `second` (optional): desc"), "{site:?}");
        }
    }

    #[test]
    fn no_arguments_derives_no_names() {
        assert_eq!(derive_argument_names(&[]), None);
    }

    #[test]
    fn names_are_the_bare_argument_names_in_declaration_order() {
        let names = derive_argument_names(&[required("first"), required("second")]).unwrap();
        assert_eq!(names, vec!["first".to_owned(), "second".to_owned()]);
    }

    #[test]
    fn every_runtime_at_skill_site_gets_a_prose_only_section() {
        // No harness surveyed documents an argument mechanism for a *skill*
        // besides Claude Code's own, so every other runtime is prose-only
        // here — including the three that gain a command-site mechanism
        // below.
        for runtime in [
            RuntimeId::Antigravity,
            RuntimeId::CodexCli,
            RuntimeId::OpenCode,
            RuntimeId::GithubCopilot,
            RuntimeId::Amp,
            RuntimeId::NpmPackage,
            RuntimeId::Portable,
        ] {
            let section =
                render_arguments_section(&[required("pr-number")], runtime, ArgumentSite::Skill)
                    .unwrap();
            assert!(
                section.starts_with("## Arguments\n\n- `pr-number`"),
                "{runtime:?}: {section}"
            );
            assert!(
                !section.contains('$'),
                "{runtime:?} has no skill mechanism to name: {section}"
            );
        }
    }

    #[test]
    fn amp_and_the_packaging_targets_stay_prose_only_at_command_site_too() {
        // These three implement no `CommandCapability`, so a command site
        // for them is unreachable in practice — but the function still owes
        // a deterministic, mechanism-free answer if asked.
        for runtime in [RuntimeId::Amp, RuntimeId::NpmPackage, RuntimeId::Portable] {
            let section =
                render_arguments_section(&[required("pr-number")], runtime, ArgumentSite::Command)
                    .unwrap();
            assert!(!section.contains('$'), "{runtime:?}: {section}");
        }
    }

    #[test]
    fn codex_cli_command_site_names_positional_and_named_variables() {
        let section = render_arguments_section(
            &[required("pr-number"), Argument::optional("dry-run", "desc")],
            RuntimeId::CodexCli,
            ArgumentSite::Command,
        )
        .unwrap();
        assert!(section.contains("$ARGUMENTS"), "{section}");
        // 1-based positional, per Codex's own docs.
        assert!(section.contains("`$1`/`$PR_NUMBER`"), "{section}");
        assert!(section.contains("`$2`/`$DRY_RUN`"), "{section}");
        assert!(section.contains("KEY=value"), "{section}");
    }

    #[test]
    fn opencode_command_site_names_one_based_positional_refs() {
        let section = render_arguments_section(
            &[required("first"), Argument::optional("second", "desc")],
            RuntimeId::OpenCode,
            ArgumentSite::Command,
        )
        .unwrap();
        assert!(section.contains("$ARGUMENTS"), "{section}");
        assert!(section.contains("`$1`"), "{section}");
        assert!(section.contains("`$2`"), "{section}");
        // OpenCode's docs name no named-variable form — unlike Codex's.
        assert!(!section.contains("$FIRST"), "{section}");
    }

    #[test]
    fn copilot_command_site_names_each_input_variable() {
        let section = render_arguments_section(
            &[required("pr-number"), Argument::optional("channel", "desc")],
            RuntimeId::GithubCopilot,
            ArgumentSite::Command,
        )
        .unwrap();
        assert!(section.contains("${input:pr-number}"), "{section}");
        assert!(section.contains("${input:channel}"), "{section}");
    }

    #[test]
    fn a_bullet_names_the_enum_and_the_default() {
        let mut arg = Argument::optional("format", "Output format.");
        arg.values = Some(vec!["markdown".into(), "json".into()]);
        arg.default = Some("markdown".into());
        let section =
            render_arguments_section(&[arg], RuntimeId::Antigravity, ArgumentSite::Skill).unwrap();
        assert!(
            section.contains(
                "- `format` (optional, one of `markdown`, `json`, default `markdown`): Output format."
            ),
            "{section}"
        );
    }

    #[test]
    fn a_bullet_with_no_description_omits_the_colon() {
        let mut arg = Argument::optional("verbose", "");
        arg.description = None;
        let section =
            render_arguments_section(&[arg], RuntimeId::Antigravity, ArgumentSite::Skill).unwrap();
        assert!(section.contains("- `verbose` (optional)\n"), "{section}");
        assert!(!section.contains("`verbose` (optional):"), "{section}");
    }
}
