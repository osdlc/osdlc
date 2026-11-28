//! The `help` and `schema` commands a tool adds to its own subcommand enum.
//!
//! clap keeps `--help`; these two answer an agent. `help --json` is the
//! command tree as [`HelpEntry`] data, and `schema` is each command's input
//! and output JSON Schema. A tool sets `disable_help_subcommand = true`, so its
//! own `help` replaces clap's, and registers its commands' documents in a
//! [`CommandDocs`].

use clap::{Args, Command};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::cli::{CommandError, Report};
use crate::document::{SCHEMA_VERSION, envelope_json};
use crate::help::{HelpDepth, HelpEntry, help_entry, render_help};
use crate::schema::{CommandDoc, CommandDocs, SchemaEntry, payload_schema, schema_entries};

/// The width `help` text is wrapped to.
pub const HELP_WIDTH: usize = 80;

/// The arguments of `help`.
// `about = None` keeps this doc comment out of the help of the command it joins.
#[derive(Debug, Clone, Default, PartialEq, Eq, Args)]
#[command(about = None, long_about = None)]
pub struct HelpArgs {
    /// The words of a command, such as "context files"
    pub command: Vec<String>,
    /// Levels of subcommands to expand, or "all" (default 1)
    #[arg(long, value_name = "n")]
    pub depth: Option<String>,
    /// Include the long description, hidden items, exit codes and examples
    #[arg(long)]
    pub full: bool,
}

/// The arguments of `schema`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Args)]
#[command(about = None, long_about = None)]
pub struct SchemaArgs {
    /// The words of a command
    pub command: Vec<String>,
}

/// The tool a `help` or `schema` document describes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct ToolInfo {
    /// Its name.
    pub name: String,
    /// Its version.
    pub version: String,
}

/// What `help` prints: kind `help`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct HelpReport {
    /// The tool.
    pub tool: ToolInfo,
    /// The node the words named, expanded as asked.
    pub help: HelpEntry,
}

impl Report for HelpReport {
    fn kind(&self) -> &str {
        "help"
    }
    fn render_text(&self) -> String {
        render_help(&self.help, HELP_WIDTH, &self.tool.name)
    }
}

/// What `schema` prints: kind `schema`. Its text form is the same JSON
/// document.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct SchemaReport {
    /// The tool.
    pub tool: ToolInfo,
    /// The node the words named and every node under it; with no words, the
    /// `error` document's entry last.
    pub commands: Vec<SchemaEntry>,
}

impl Report for SchemaReport {
    fn kind(&self) -> &str {
        "schema"
    }
    fn render_text(&self) -> String {
        envelope_json(Report::schema_version(self), Report::kind(self), self)
            .map(|doc| doc + "\n")
            .expect("the report's fields are named apart from the envelope's, and plain data always serializes")
    }
}

/// The `help` report for `args` over `root`, the tool's whole command
/// (`Cli::command()`), at `version`.
///
/// # Errors
/// [`CommandError::Usage`] for a `--depth` that is neither a number nor
/// `all`, or words that name no command.
pub fn help_report(
    root: &Command,
    version: &str,
    args: &HelpArgs,
    docs: &CommandDocs,
) -> Result<HelpReport, CommandError> {
    let depth = match args.depth.as_deref() {
        None => 1,
        Some("all") => usize::MAX,
        Some(n) if !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) => {
            n.parse().unwrap_or(usize::MAX)
        }
        Some(_) => {
            return Err(CommandError::Usage(
                "--depth needs a number or \"all\"".into(),
            ));
        }
    };
    let help = help_entry(
        root,
        &args.command,
        HelpDepth {
            depth,
            full: args.full,
        },
        docs,
    )?;
    Ok(HelpReport {
        tool: tool_info(root, version),
        help,
    })
}

/// The `schema` report, as [`help_report`] builds `help`'s.
///
/// # Errors
/// Those of [`schema_entries`], such as [`CommandError::Usage`] for words
/// that name no command.
pub fn schema_report(
    root: &Command,
    version: &str,
    args: &SchemaArgs,
    docs: &CommandDocs,
) -> Result<SchemaReport, CommandError> {
    Ok(SchemaReport {
        tool: tool_info(root, version),
        commands: schema_entries(root, &args.command, docs)?,
    })
}

/// The doc of a `help` command at the root: kind `help`, read-only.
pub fn help_doc() -> CommandDoc {
    CommandDoc::new(
        &["help"],
        "help",
        SCHEMA_VERSION,
        payload_schema::<HelpReport>(),
    )
    .read_only()
}

/// The doc of a `schema` command at the root: kind `schema`, read-only.
pub fn schema_doc() -> CommandDoc {
    CommandDoc::new(
        &["schema"],
        "schema",
        SCHEMA_VERSION,
        payload_schema::<SchemaReport>(),
    )
    .read_only()
}

fn tool_info(root: &Command, version: &str) -> ToolInfo {
    ToolInfo {
        name: root.get_name().to_owned(),
        version: version.to_owned(),
    }
}
