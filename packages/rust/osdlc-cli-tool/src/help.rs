//! Help as data first: one [`HelpEntry`] per node of a clap command tree, and
//! one text renderer over it, so `help` and `help --json` say the same things.
//!
//! The Rust twin of `@osdlc/cli-tool`'s `command/help.ts`. The tree is clap's,
//! read after [`clap::Command::build`], so a global flag shows on every
//! command it reaches.

use clap::{Arg, ArgAction, Command};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::cli::CommandError;
use crate::exit::{EXIT_MISSING_TOOL, EXIT_REPOSITORY, EXIT_SERVICE, EXIT_UNREACHABLE, Exit};
use crate::schema::CommandDocs;

/// One node of the command tree, as help shows it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct HelpEntry {
    /// The subcommand's name, or the tool's at the root.
    pub name: String,
    /// The subcommand words from the root: empty at the root.
    pub path: Vec<String>,
    /// The full command: `mytool context files`.
    pub command: String,
    /// The one-line summary (clap's `about`).
    pub summary: String,
    /// Whether the node has subcommands.
    pub group: bool,
    /// Whether the node runs something: false for a group that needs a subcommand.
    pub runs: bool,
    /// Whether the command asks a person for input. Always false: clap has no
    /// interactive commands.
    pub interactive: bool,
    /// The usage line.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<String>,
    /// The long description (clap's `long_about`), with `--full`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// The flags the node takes, its own first, then the global ones. Hidden
    /// flags only with `--full`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flags: Option<Vec<HelpFlag>>,
    /// The positional arguments, for a node that runs. Hidden ones only with
    /// `--full`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub positionals: Option<Vec<HelpPositional>>,
    /// The exit codes, with `--full`: the universal ones the tool has, then the
    /// command's own. An own code that is universal replaces that row in place.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exits: Option<Vec<HelpExit>>,
    /// Example command lines. With `--full`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub examples: Option<Vec<String>>,
    /// The child nodes, when expanded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commands: Option<Vec<HelpEntry>>,
    /// How many child nodes there are when they are not expanded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub more: Option<usize>,
}

/// One flag, as help shows it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct HelpFlag {
    /// clap's id for the argument.
    pub name: String,
    /// How it is typed: `-C, --dir <path>`.
    pub spelling: String,
    /// What it takes.
    pub kind: FlagKind,
    /// Its help line.
    pub help: String,
    /// True for a flag every command under the one that declares it takes.
    pub global: bool,
    /// True for a flag help lists only with `--full`.
    pub hidden: bool,
    /// True when the command cannot run without it.
    pub required: bool,
    /// The values an `enum` flag accepts. Hidden ones only with `--full`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub choices: Option<Vec<String>>,
    /// Its default: a string for a `string` or `enum` flag, an array for a `list`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_json::Value>,
}

/// What a flag takes, from its clap action.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum FlagKind {
    /// On or off, with no value (`SetTrue`, `SetFalse`).
    Boolean,
    /// One value (`Set`).
    String,
    /// One value of a fixed set (`Set` with possible values).
    Enum,
    /// A value each time it is given (`Append`).
    List,
    /// How many times it is given (`Count`).
    Count,
}

/// One positional argument, as help shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct HelpPositional {
    /// clap's id for the argument.
    pub name: String,
    /// Its help line.
    pub help: String,
    /// True when the command cannot run without it.
    pub required: bool,
    /// True when it takes more than one value.
    pub variadic: bool,
}

/// One exit code and its meaning.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct HelpExit {
    /// The exit code.
    pub code: i32,
    /// What it means.
    pub meaning: String,
}

impl HelpExit {
    /// The exit `code`, meaning `meaning`.
    pub fn new(code: i32, meaning: impl Into<String>) -> Self {
        Self {
            code,
            meaning: meaning.into(),
        }
    }
}

/// The universal exit codes, in order, with the words of `@osdlc/cli-tool`.
/// Every tool has 0, 1 and 2; a tool lists only the failure-class codes (22
/// to 25) it can return ([`CommandDocs::failure_exits`]).
pub const UNIVERSAL_EXITS: &[(i32, &str)] = &[
    (Exit::Ok.code(), "the command did what it was asked"),
    (
        Exit::Error.code(),
        "a well-formed command failed against the state it found",
    ),
    (
        Exit::Usage.code(),
        "the command cannot run as typed; fix the command line",
    ),
    (
        EXIT_MISSING_TOOL,
        "a program the run needs is not installed",
    ),
    (
        EXIT_SERVICE,
        "a service refused the caller or gave an unusable answer",
    ),
    (
        EXIT_REPOSITORY,
        "there is no repository or remote to work on",
    ),
    (
        EXIT_UNREACHABLE,
        "a service could not be reached; try again later",
    ),
];

/// How much of the tree [`help_entry`] includes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HelpDepth {
    /// How many levels of child nodes to expand: 0 counts them, 1 lists
    /// them. `usize::MAX` for all.
    pub depth: usize,
    /// Include long descriptions, hidden commands, flags, positionals and
    /// values, exit codes and examples.
    pub full: bool,
}

impl Default for HelpDepth {
    /// One level, not full: what `help` with no flags shows.
    fn default() -> Self {
        Self {
            depth: 1,
            full: false,
        }
    }
}

/// The help for the node at `path` under `root`, expanded to `depth`. `root`
/// is the tool's whole command (`Cli::command()`); it is cloned and built here.
/// `docs` supplies each command's exit codes and examples.
///
/// # Errors
/// [`CommandError::Usage`] when `path` names no command.
pub fn help_entry(
    root: &Command,
    path: &[String],
    depth: HelpDepth,
    docs: &CommandDocs,
) -> Result<HelpEntry, CommandError> {
    let tree = built(root);
    let (node, path) = locate(&tree, path)?;
    let app = tree.get_name();
    let name = path.last().map_or(app, String::as_str);
    Ok(entry(app, name, node, path.clone(), depth, docs))
}

fn entry(
    app: &str,
    name: &str,
    cmd: &Command,
    path: Vec<String>,
    depth: HelpDepth,
    docs: &CommandDocs,
) -> HelpEntry {
    let full = depth.full;
    let command = command_line(app, &path);
    let group = !children(cmd, true).is_empty();
    let runs = node_runs(cmd);
    let shown = children(cmd, full);
    let doc = docs.get(&path);

    let mut positionals = None;
    let usage = if runs {
        let listed: Vec<&Arg> = positional_args(cmd)
            .into_iter()
            .filter(|arg| full || !arg.is_hide_set())
            .collect();
        let mut words = vec![command.clone()];
        if !shown.is_empty() {
            words.push("[<command>]".to_owned());
        }
        words.push("[options]".to_owned());
        words.extend(listed.iter().map(|arg| positional_usage(arg)));
        positionals = Some(listed.iter().map(|arg| help_positional(arg)).collect());
        Some(words.join(" "))
    } else {
        Some(format!("{command} <command> [options]"))
    };

    let mut flags: Vec<HelpFlag> = flag_args(cmd).map(|arg| help_flag(arg, full)).collect();
    flags.sort_by_key(|flag| flag.global);
    if !full {
        flags.retain(|flag| !flag.hidden);
    }

    let mut exits = None;
    let mut examples = None;
    if full {
        let mut all: Vec<HelpExit> = docs.universal_exits().collect();
        if let Some(doc) = doc {
            for own in &doc.exits {
                match all.iter_mut().find(|exit| exit.code == own.code) {
                    Some(universal) => *universal = own.clone(),
                    None => all.push(own.clone()),
                }
            }
            if !doc.examples.is_empty() {
                examples = Some(
                    doc.examples
                        .iter()
                        .map(|example| format!("{app} {example}"))
                        .collect(),
                );
            }
        }
        exits = Some(all);
    }
    let description = if full {
        cmd.get_long_about().map(ToString::to_string)
    } else {
        None
    };

    let (mut commands, mut more) = (None, None);
    if !shown.is_empty() {
        if depth.depth > 0 {
            let next = HelpDepth {
                depth: depth.depth - 1,
                full,
            };
            commands = Some(
                shown
                    .iter()
                    .map(|child| {
                        let mut child_path = path.clone();
                        child_path.push(child.get_name().to_owned());
                        entry(app, child.get_name(), child, child_path, next, docs)
                    })
                    .collect(),
            );
        } else {
            more = Some(shown.len());
        }
    }

    HelpEntry {
        name: name.to_owned(),
        path,
        command,
        summary: about(cmd),
        group,
        runs,
        interactive: false,
        usage,
        description,
        flags: Some(flags),
        positionals,
        exits,
        examples,
        commands,
        more,
    }
}

/// A flag as help shows it; its hidden possible values only when `full`.
fn help_flag(arg: &Arg, full: bool) -> HelpFlag {
    let kind = flag_kind(arg);
    let choices = (kind == FlagKind::Enum).then(|| {
        arg.get_possible_values()
            .iter()
            .filter(|value| full || !value.is_hide_set())
            .map(|value| value.get_name().to_owned())
            .collect()
    });
    HelpFlag {
        name: arg.get_id().to_string(),
        spelling: spelling(arg, kind),
        kind,
        help: arg_help(arg),
        global: arg.is_global_set(),
        hidden: arg.is_hide_set(),
        required: arg.is_required_set(),
        choices,
        default: default_value(arg, kind),
    }
}

fn help_positional(arg: &Arg) -> HelpPositional {
    HelpPositional {
        name: arg.get_id().to_string(),
        help: arg_help(arg),
        required: arg.is_required_set(),
        variadic: is_variadic(arg),
    }
}

/// `-C, --dir <path>`; a boolean or a count has no value part.
fn spelling(arg: &Arg, kind: FlagKind) -> String {
    let mut names = Vec::new();
    if let Some(short) = arg.get_short() {
        names.push(format!("-{short}"));
    }
    if let Some(long) = arg.get_long() {
        names.push(format!("--{long}"));
    }
    let mut text = names.join(", ");
    if matches!(kind, FlagKind::String | FlagKind::Enum | FlagKind::List) {
        text.push_str(&format!(" <{}>", value_name(arg)));
    }
    text
}

fn positional_usage(arg: &Arg) -> String {
    let name = arg.get_id().as_str();
    let inner = if is_variadic(arg) {
        format!("{name}...")
    } else {
        name.to_owned()
    };
    if arg.is_required_set() {
        format!("<{inner}>")
    } else {
        format!("[{inner}]")
    }
}

/// `root` cloned and built, so every global argument reaches every
/// subcommand and every setting is final.
pub(crate) fn built(root: &Command) -> Command {
    let mut tree = root.clone();
    tree.build();
    tree
}

/// The node `path` names under the built `root`, and its path in the nodes'
/// own names: a word may be an alias.
pub(crate) fn locate<'c>(
    root: &'c Command,
    path: &[String],
) -> Result<(&'c Command, Vec<String>), CommandError> {
    let mut node = root;
    let mut names = Vec::with_capacity(path.len());
    for word in path {
        node = node
            .find_subcommand(word)
            .filter(|child| !is_clap_help(node, child))
            .ok_or_else(|| CommandError::Usage(format!("no command '{}'", path.join(" "))))?;
        names.push(node.get_name().to_owned());
    }
    Ok((node, names))
}

/// The subcommands of `cmd` that are nodes: not clap's own `help`, and hidden
/// ones only when `full`.
pub(crate) fn children(cmd: &Command, full: bool) -> Vec<&Command> {
    cmd.get_subcommands()
        .filter(|child| !is_clap_help(cmd, child))
        .filter(|child| full || !child.is_hide_set())
        .collect()
}

/// Whether `child` is clap's own `help` subcommand, which is not a node; a
/// tool's own `help` (with `disable_help_subcommand`) is one.
fn is_clap_help(parent: &Command, child: &Command) -> bool {
    child.get_name() == "help" && !parent.is_disable_help_subcommand_set()
}

/// Whether the node runs something: anything but a group that needs a
/// subcommand.
pub(crate) fn node_runs(cmd: &Command) -> bool {
    children(cmd, true).is_empty() || !cmd.is_subcommand_required_set()
}

pub(crate) fn command_line(app: &str, path: &[String]) -> String {
    std::iter::once(app)
        .chain(path.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) fn about(cmd: &Command) -> String {
    cmd.get_about().map(ToString::to_string).unwrap_or_default()
}

/// The flags of `cmd`, without clap's own `--help` and `--version`.
pub(crate) fn flag_args(cmd: &Command) -> impl Iterator<Item = &Arg> {
    cmd.get_arguments()
        .filter(|arg| !arg.is_positional() && !is_clap_builtin(arg))
}

/// The positional arguments of `cmd`, in order.
pub(crate) fn positional_args(cmd: &Command) -> Vec<&Arg> {
    let mut args: Vec<&Arg> = cmd.get_positionals().collect();
    args.sort_by_key(|arg| arg.get_index());
    args
}

fn is_clap_builtin(arg: &Arg) -> bool {
    matches!(
        arg.get_action(),
        ArgAction::Help | ArgAction::HelpShort | ArgAction::HelpLong | ArgAction::Version
    )
}

pub(crate) fn flag_kind(arg: &Arg) -> FlagKind {
    match arg.get_action() {
        ArgAction::SetTrue | ArgAction::SetFalse => FlagKind::Boolean,
        ArgAction::Count => FlagKind::Count,
        ArgAction::Append => FlagKind::List,
        _ if !choices(arg).is_empty() => FlagKind::Enum,
        _ => FlagKind::String,
    }
}

/// Every value an argument accepts, hidden ones included.
pub(crate) fn choices(arg: &Arg) -> Vec<String> {
    arg.get_possible_values()
        .iter()
        .map(|value| value.get_name().to_owned())
        .collect()
}

/// A `string` or `enum` flag's one default, or a `list` flag's defaults.
pub(crate) fn default_value(arg: &Arg, kind: FlagKind) -> Option<serde_json::Value> {
    let values: Vec<String> = arg
        .get_default_values()
        .iter()
        .map(|value| value.to_string_lossy().into_owned())
        .collect();
    match kind {
        FlagKind::List if !values.is_empty() => Some(values.into()),
        FlagKind::String | FlagKind::Enum if values.len() == 1 => {
            values.into_iter().next().map(Into::into)
        }
        _ => None,
    }
}

pub(crate) fn is_variadic(arg: &Arg) -> bool {
    matches!(arg.get_action(), ArgAction::Append)
        || arg
            .get_num_args()
            .is_some_and(|range| range.max_values() > 1)
}

/// The argument's help line, its long help when it has only that.
pub(crate) fn arg_help(arg: &Arg) -> String {
    arg.get_help()
        .or_else(|| arg.get_long_help())
        .map(ToString::to_string)
        .unwrap_or_default()
}

fn value_name(arg: &Arg) -> String {
    arg.get_value_names()
        .and_then(|names| names.first())
        .map_or_else(|| "value".to_owned(), ToString::to_string)
}

/// `entry` as help text wrapped to `width` columns, with a trailing newline.
/// `app` is the tool's name, for the closing line that says how to see more.
pub fn render_help(entry: &HelpEntry, width: usize, app: &str) -> String {
    let mut parts = vec![format!("{} — {}", entry.command, entry.summary)];
    if let Some(usage) = &entry.usage {
        parts.push(format!("usage: {usage}"));
    }
    if let Some(description) = &entry.description {
        parts.push(wrap_text(description.trim(), width));
    }
    if let Some(commands) = entry.commands.as_deref().filter(|c| !c.is_empty()) {
        let mut rows = Vec::new();
        command_rows(commands, "", &mut rows);
        parts.push(format!("commands:\n{}", columns(&rows, width)));
    }
    if let Some(positionals) = entry
        .positionals
        .as_deref()
        .filter(|ps| ps.iter().any(|p| !p.help.is_empty()))
    {
        let rows: Vec<(String, String)> = positionals
            .iter()
            .map(|p| (p.name.clone(), p.help.clone()))
            .collect();
        parts.push(format!("arguments:\n{}", columns(&rows, width)));
    }
    if let Some(flags) = entry.flags.as_deref().filter(|f| !f.is_empty()) {
        let (global, own): (Vec<&HelpFlag>, Vec<&HelpFlag>) =
            flags.iter().partition(|flag| flag.global);
        if !own.is_empty() {
            let rows: Vec<_> = own.into_iter().map(flag_row).collect();
            parts.push(format!("options:\n{}", columns(&rows, width)));
        }
        if !global.is_empty() {
            let rows: Vec<_> = global.into_iter().map(flag_row).collect();
            parts.push(format!("global options:\n{}", columns(&rows, width)));
        }
    }
    if let Some(exits) = &entry.exits {
        let rows: Vec<(String, String)> = exits
            .iter()
            .map(|exit| (exit.code.to_string(), exit.meaning.clone()))
            .collect();
        parts.push(format!("exit codes:\n{}", columns(&rows, width)));
    }
    if let Some(examples) = entry.examples.as_deref().filter(|e| !e.is_empty()) {
        let lines: Vec<String> = examples.iter().map(|e| format!("  {e}")).collect();
        parts.push(format!("examples:\n{}", lines.join("\n")));
    }
    if entry.description.is_none() && entry.exits.is_none() {
        let mut target = vec![app.to_owned(), "help".to_owned()];
        target.extend(entry.path.iter().cloned());
        let target = target.join(" ");
        parts.push(wrap_text(
            &format!(
                "More: \"{target} --depth all --full\" shows every command, flag and exit code."
            ),
            width,
        ));
    }
    format!("{}\n", parts.join("\n\n"))
}

fn command_rows(entries: &[HelpEntry], indent: &str, rows: &mut Vec<(String, String)>) {
    for entry in entries {
        let more = match entry.more {
            Some(1) => " (1 command)".to_owned(),
            Some(n) => format!(" ({n} commands)"),
            None => String::new(),
        };
        rows.push((
            format!("{indent}{}", entry.name),
            format!("{}{more}", entry.summary),
        ));
        if let Some(commands) = &entry.commands {
            command_rows(commands, &format!("{indent}  "), rows);
        }
    }
}

fn flag_row(flag: &HelpFlag) -> (String, String) {
    let mut extra = Vec::new();
    if let Some(choices) = &flag.choices {
        extra.push(format!("one of {}", choices.join(", ")));
    }
    if let Some(default) = &flag.default {
        extra.push(format!("default {default}"));
    }
    if flag.required {
        extra.push("required".to_owned());
    }
    let text = if extra.is_empty() {
        flag.help.clone()
    } else {
        format!("{} ({})", flag.help, extra.join("; "))
    };
    (flag.spelling.clone(), text)
}

fn text_width(text: &str) -> usize {
    text.chars().count()
}

/// Words joined into lines no wider than `width`. A wider word gets a line of
/// its own.
fn fill<'w>(words: impl IntoIterator<Item = &'w str>, width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();
    let mut used = 0;
    for word in words {
        let w = text_width(word);
        if line.is_empty() {
            line.push_str(word);
            used = w;
        } else if used + 1 + w <= width {
            line.push(' ');
            line.push_str(word);
            used += 1 + w;
        } else {
            lines.push(std::mem::take(&mut line));
            line.push_str(word);
            used = w;
        }
    }
    if !line.is_empty() {
        lines.push(line);
    }
    lines
}

/// Two columns: each term padded to the widest one, then its text wrapped in
/// the space left, later lines indented under the text. A term too wide for
/// half the width gets a line of its own.
fn columns(rows: &[(String, String)], width: usize) -> String {
    const INDENT: &str = "  ";
    let widest = rows
        .iter()
        .map(|(term, _)| text_width(term))
        .max()
        .unwrap_or(0);
    let term_width = widest.min((width / 2).saturating_sub(INDENT.len()));
    let lead = INDENT.len() + term_width + 2;
    rows.iter()
        .map(|(term, text)| {
            let body = fill(text.split_whitespace(), width.saturating_sub(lead).max(1));
            let pad = " ".repeat(lead);
            if text_width(term) > term_width {
                std::iter::once(format!("{INDENT}{term}"))
                    .chain(body.iter().map(|line| format!("{pad}{line}")))
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                let first = body.first().map_or("", String::as_str);
                let spaces = " ".repeat(term_width - text_width(term));
                let head = format!("{INDENT}{term}{spaces}  {first}");
                std::iter::once(head.trim_end().to_owned())
                    .chain(body.iter().skip(1).map(|line| format!("{pad}{line}")))
                    .collect::<Vec<_>>()
                    .join("\n")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The fence a line opens or closes: ``` or ~~~, indented or not.
fn fence_of(line: &str) -> Option<&'static str> {
    let trimmed = line.trim_start();
    ["```", "~~~"]
        .into_iter()
        .find(|fence| trimmed.starts_with(fence))
}

/// A line kept as written: indented, a list item, a shell example (`$ cmd`), a
/// table row, a heading or a quote.
fn is_kept(line: &str) -> bool {
    let mut chars = line.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    let rest = chars.as_str();
    if first.is_whitespace() || first == '|' || first == '>' {
        return true;
    }
    if matches!(first, '-' | '*' | '+' | '$') {
        return rest.starts_with(char::is_whitespace);
    }
    if first == '#' {
        let after = line.trim_start_matches('#');
        let hashes = line.len() - after.len();
        return hashes <= 6 && (after.is_empty() || after.starts_with(char::is_whitespace));
    }
    if first.is_ascii_digit() {
        let after = line.trim_start_matches(|c: char| c.is_ascii_digit());
        let mut after = after.chars();
        return matches!(after.next(), Some('.' | ')'))
            && after.next().is_some_and(char::is_whitespace);
    }
    false
}

/// `text` reflowed to `width` columns. Paragraphs are separated by blank
/// lines; a line ending in `:` ends its paragraph. Kept lines ([`is_kept`])
/// and every line of a fenced block stay as written.
fn wrap_text(text: &str, width: usize) -> String {
    let (body, trailing) = match text.strip_suffix('\n') {
        Some(body) => (body, true),
        None => (text, false),
    };
    let mut out: Vec<String> = Vec::new();
    let mut prose: Vec<&str> = Vec::new();
    let mut fence: Option<&str> = None;
    let flush = |prose: &mut Vec<&str>, out: &mut Vec<String>| {
        if !prose.is_empty() {
            out.extend(fill(prose.iter().flat_map(|l| l.split_whitespace()), width));
            prose.clear();
        }
    };
    for line in body.split('\n') {
        let opens = fence_of(line);
        if let Some(open) = fence {
            out.push(line.to_owned());
            if opens == Some(open) {
                fence = None;
            }
        } else if opens.is_some() {
            flush(&mut prose, &mut out);
            fence = opens;
            out.push(line.to_owned());
        } else if line.is_empty() || is_kept(line) {
            flush(&mut prose, &mut out);
            out.push(line.to_owned());
        } else {
            prose.push(line);
            if line.trim_end().ends_with(':') {
                flush(&mut prose, &mut out);
            }
        }
    }
    flush(&mut prose, &mut out);
    let mut text = out.join("\n");
    if trailing {
        text.push('\n');
    }
    text
}

#[cfg(test)]
pub(crate) mod tests {
    use clap::{Arg, ArgAction, Command};

    use super::*;
    use crate::schema::CommandDoc;

    /// The shared fixture; clap's own `help` subcommand stays on.
    pub(crate) fn tool() -> Command {
        Command::new("tool")
            .about("Does things.")
            .subcommand_required(true)
            .arg(
                Arg::new("json")
                    .long("json")
                    .global(true)
                    .action(ArgAction::SetTrue)
                    .help("Print a JSON document"),
            )
            .subcommand(
                Command::new("files")
                    .visible_alias("ls")
                    .about("List files.")
                    .long_about("List files.\n\nEvery file under the paths given.")
                    .arg(
                        Arg::new("verbose")
                            .short('v')
                            .long("verbose")
                            .action(ArgAction::Count)
                            .help("More detail"),
                    )
                    .arg(
                        Arg::new("format")
                            .long("format")
                            .value_name("style")
                            .value_parser(["text", "table"])
                            .default_value("text")
                            .help("How to print them"),
                    )
                    .arg(
                        Arg::new("trace")
                            .long("trace")
                            .hide(true)
                            .action(ArgAction::SetTrue)
                            .help("Trace the walk"),
                    )
                    .arg(
                        Arg::new("paths")
                            .num_args(1..)
                            .required(true)
                            .action(ArgAction::Append)
                            .help("Folders to list"),
                    )
                    .subcommand(Command::new("tree").about("Show them as a tree.")),
            )
            .subcommand(Command::new("secret").about("Not for people.").hide(true))
    }

    fn docs() -> CommandDocs {
        let mut docs = CommandDocs::default();
        docs.add(
            CommandDoc::new(&["files"], "files", 1, serde_json::json!({}))
                .exit(1, "no file matched")
                .example("files src"),
        );
        docs
    }

    fn at(depth: usize, full: bool) -> HelpDepth {
        HelpDepth { depth, full }
    }

    fn names(entries: &[HelpEntry]) -> Vec<&str> {
        entries.iter().map(|e| e.name.as_str()).collect()
    }

    #[test]
    fn help_entry_at_depth_0_counts_the_visible_children() {
        let root = help_entry(&tool(), &[], at(0, false), &docs()).unwrap();
        assert_eq!(root.name, "tool");
        assert_eq!(root.command, "tool");
        assert!(root.group && !root.runs);
        assert_eq!(root.usage.as_deref(), Some("tool <command> [options]"));
        assert_eq!((root.commands, root.more), (None, Some(1)));
    }

    #[test]
    fn help_entry_at_depth_1_lists_the_children_and_counts_theirs() {
        let root = help_entry(&tool(), &[], at(1, false), &docs()).unwrap();
        let commands = root.commands.unwrap();
        assert_eq!(names(&commands), ["files"]);
        let files = &commands[0];
        assert_eq!(files.path, ["files"]);
        assert_eq!(files.command, "tool files");
        assert!(files.group && files.runs);
        assert_eq!((files.commands.is_none(), files.more), (true, Some(1)));
    }

    #[test]
    fn help_entry_at_depth_all_expands_every_level() {
        let root = help_entry(&tool(), &[], at(usize::MAX, false), &docs()).unwrap();
        let files = &root.commands.unwrap()[0];
        let tree = &files.commands.as_ref().unwrap()[0];
        assert_eq!(tree.path, ["files", "tree"]);
        assert!(!tree.group && tree.runs);
        assert_eq!((tree.commands.is_none(), tree.more), (true, None));
    }

    #[test]
    fn help_entry_reads_flags_and_positionals() {
        let path = ["files".to_owned()];
        let files = help_entry(&tool(), &path, at(1, false), &docs()).unwrap();
        assert_eq!(
            files.usage.as_deref(),
            Some("tool files [<command>] [options] <paths...>")
        );
        let flags = files.flags.unwrap();
        let spelled: Vec<(&str, FlagKind, bool)> = flags
            .iter()
            .map(|f| (f.spelling.as_str(), f.kind, f.global))
            .collect();
        assert_eq!(
            spelled,
            [
                ("-v, --verbose", FlagKind::Count, false),
                ("--format <style>", FlagKind::Enum, false),
                ("--json", FlagKind::Boolean, true),
            ]
        );
        let format = &flags[1];
        assert_eq!(
            format.choices.as_deref(),
            Some(&["text".to_owned(), "table".to_owned()][..])
        );
        assert_eq!(format.default, Some("text".into()));
        assert_eq!(
            files.positionals.unwrap(),
            [HelpPositional {
                name: "paths".into(),
                help: "Folders to list".into(),
                required: true,
                variadic: true,
            }]
        );
        assert_eq!(
            (files.exits, files.examples, files.description),
            (None, None, None)
        );
    }

    #[test]
    fn hidden_items_and_the_long_parts_come_only_with_full() {
        let root = help_entry(&tool(), &[], at(1, true), &docs()).unwrap();
        let commands = root.commands.unwrap();
        assert_eq!(names(&commands), ["files", "secret"]);
        let files = &commands[0];
        let flags: Vec<&str> = files
            .flags
            .iter()
            .flatten()
            .map(|f| f.name.as_str())
            .collect();
        assert_eq!(flags, ["verbose", "format", "trace", "json"]);
        assert!(files.flags.as_ref().unwrap()[2].hidden);
        assert_eq!(
            files.description.as_deref(),
            Some("List files.\n\nEvery file under the paths given.")
        );
        let exits = files.exits.as_ref().unwrap();
        assert_eq!(exits.len(), UNIVERSAL_EXITS.len());
        assert_eq!(exits[1], HelpExit::new(1, "no file matched"));
        assert_eq!(
            files.examples.as_deref(),
            Some(&["tool files src".to_owned()][..])
        );
    }

    #[test]
    fn clap_s_own_help_subcommand_is_not_a_node() {
        let root = help_entry(&tool(), &[], at(1, true), &docs()).unwrap();
        assert!(!names(root.commands.as_deref().unwrap()).contains(&"help"));
        let error = help_entry(&tool(), &["help".to_owned()], at(1, false), &docs()).unwrap_err();
        assert_eq!(error.to_string(), "no command 'help'");
    }

    #[test]
    fn an_unknown_path_is_a_usage_error() {
        let path = ["files".to_owned(), "nope".to_owned()];
        let error = help_entry(&tool(), &path, at(1, false), &docs()).unwrap_err();
        assert!(matches!(error, CommandError::Usage(ref m) if m == "no command 'files nope'"));
    }

    #[test]
    fn a_command_named_by_its_alias_is_the_command() {
        let docs = docs();
        for depth in [at(1, false), at(1, true)] {
            let by_alias = help_entry(&tool(), &["ls".to_owned()], depth, &docs).unwrap();
            let by_name = help_entry(&tool(), &["files".to_owned()], depth, &docs).unwrap();
            assert_eq!(by_alias, by_name);
        }
        let full = help_entry(&tool(), &["ls".to_owned()], at(1, true), &docs).unwrap();
        assert_eq!(
            (full.name.as_str(), full.command.as_str()),
            ("files", "tool files")
        );
        assert!(full.examples.is_some());
        let by_alias = crate::schema::schema_entries(&tool(), &["ls".to_owned()], &docs).unwrap();
        let by_name = crate::schema::schema_entries(&tool(), &["files".to_owned()], &docs).unwrap();
        assert_eq!(by_alias, by_name);
        assert_eq!(by_alias[0].kind.as_deref(), Some("files"));
    }

    fn hiding() -> Command {
        Command::new("tool").subcommand(
            Command::new("cmd")
                .about("Run it.")
                .arg(
                    Arg::new("format")
                        .long("format")
                        .value_parser([
                            clap::builder::PossibleValue::new("text"),
                            clap::builder::PossibleValue::new("raw").hide(true),
                        ])
                        .help("How to print"),
                )
                .arg(Arg::new("target").help("What to run"))
                .arg(
                    Arg::new("debug_path")
                        .hide(true)
                        .help("Where to write a trace"),
                ),
        )
    }

    #[test]
    fn a_hidden_positional_is_shown_only_with_full() {
        let path = ["cmd".to_owned()];
        let none = CommandDocs::default();
        let short = help_entry(&hiding(), &path, at(1, false), &none).unwrap();
        assert_eq!(short.usage.as_deref(), Some("tool cmd [options] [target]"));
        let listed: Vec<String> = short
            .positionals
            .iter()
            .flatten()
            .map(|p| p.name.clone())
            .collect();
        assert_eq!(listed, ["target"]);
        assert!(!render_help(&short, 80, "tool").contains("debug_path"));

        let full = help_entry(&hiding(), &path, at(1, true), &none).unwrap();
        assert_eq!(
            full.usage.as_deref(),
            Some("tool cmd [options] [target] [debug_path]")
        );
        let listed: Vec<String> = full
            .positionals
            .iter()
            .flatten()
            .map(|p| p.name.clone())
            .collect();
        assert_eq!(listed, ["target", "debug_path"]);
        assert!(render_help(&full, 80, "tool").contains("debug_path  Where to write a trace"));
    }

    #[test]
    fn a_hidden_value_is_in_the_input_schema_and_in_help_only_with_full() {
        let tree = built(&hiding());
        let cmd = tree.find_subcommand("cmd").unwrap();
        let input = crate::schema::input_schema(cmd);
        assert_eq!(
            input["properties"]["format"]["enum"],
            serde_json::json!(["text", "raw"])
        );
        let validator = jsonschema::validator_for(&input).unwrap();
        assert!(validator.is_valid(&serde_json::json!({ "format": "raw" })));
        assert!(
            hiding()
                .try_get_matches_from(["tool", "cmd", "--format", "raw"])
                .is_ok()
        );

        let path = ["cmd".to_owned()];
        let none = CommandDocs::default();
        let choices = |full: bool| {
            let entry = help_entry(&hiding(), &path, at(1, full), &none).unwrap();
            entry.flags.unwrap()[0].choices.clone().unwrap()
        };
        assert_eq!(choices(false), ["text"]);
        assert_eq!(choices(true), ["text", "raw"]);
    }

    fn codes(exits: &[HelpExit]) -> Vec<i32> {
        exits.iter().map(|exit| exit.code).collect()
    }

    #[test]
    fn a_commands_own_exit_takes_the_place_of_the_universal_row_of_its_code() {
        let docs = CommandDocs::default().with(
            CommandDoc::new(&["files"], "files", 1, serde_json::json!({}))
                .exit(1, "no file matched")
                .exit(10, "a folder was missing"),
        );
        let path = ["files".to_owned()];
        let files = help_entry(&tool(), &path, at(1, true), &docs).unwrap();
        let exits = files.exits.unwrap();
        assert_eq!(codes(&exits), [0, 1, 2, 22, 23, 24, 25, 10]);
        assert_eq!(exits[1].meaning, "no file matched");
    }

    #[test]
    fn a_tool_lists_only_the_failure_exits_it_can_return() {
        let path = ["files".to_owned()];
        let none = docs().failure_exits(&[]);
        let files = help_entry(&tool(), &path, at(1, true), &none).unwrap();
        assert_eq!(codes(&files.exits.unwrap()), [0, 1, 2]);
        let one = docs().failure_exits(&[EXIT_MISSING_TOOL]);
        let files = help_entry(&tool(), &path, at(1, true), &one).unwrap();
        assert_eq!(codes(&files.exits.unwrap()), [0, 1, 2, 22]);
        let root = help_entry(&tool(), &[], at(0, true), &none).unwrap();
        assert_eq!(codes(&root.exits.unwrap()), [0, 1, 2]);
    }

    #[test]
    fn universal_exits_match_the_typescript_codes() {
        let codes: Vec<i32> = UNIVERSAL_EXITS.iter().map(|(code, _)| *code).collect();
        assert_eq!(codes, [0, 1, 2, 22, 23, 24, 25]);
    }

    #[test]
    fn render_help_of_the_root() {
        let root = help_entry(&tool(), &[], at(1, false), &docs()).unwrap();
        assert_eq!(
            render_help(&root, 80, "tool"),
            "\
tool — Does things.

usage: tool <command> [options]

commands:
  files  List files. (1 command)

global options:
  --json  Print a JSON document

More: \"tool help --depth all --full\" shows every command, flag and exit code.
"
        );
    }

    #[test]
    fn render_help_of_a_command_with_full() {
        let path = ["files".to_owned()];
        let files = help_entry(&tool(), &path, at(1, true), &docs()).unwrap();
        assert_eq!(
            render_help(&files, 60, "tool"),
            "\
tool files — List files.

usage: tool files [<command>] [options] <paths...>

List files.

Every file under the paths given.

commands:
  tree  Show them as a tree.

arguments:
  paths  Folders to list

options:
  -v, --verbose     More detail
  --format <style>  How to print them (one of text, table;
                    default \"text\")
  --trace           Trace the walk

global options:
  --json  Print a JSON document

exit codes:
  0   the command did what it was asked
  1   no file matched
  2   the command cannot run as typed; fix the command line
  22  a program the run needs is not installed
  23  a service refused the caller or gave an unusable
      answer
  24  there is no repository or remote to work on
  25  a service could not be reached; try again later

examples:
  tool files src
"
        );
    }

    #[test]
    fn wrap_text_fills_prose_and_keeps_lists_and_fences() {
        let text = "one two three four\nfive six:\n- a b c d e f\n```\nx y z w v\n```\n";
        assert_eq!(
            wrap_text(text, 9),
            "one two\nthree\nfour five\nsix:\n- a b c d e f\n```\nx y z w v\n```\n"
        );
    }
}
