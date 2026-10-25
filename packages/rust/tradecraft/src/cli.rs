//! `tradecraft <verb> [options]` — argv parsing and dispatch only.
//!
//! Fifteen verbs so far. Thirteen are wired end to end through the core:
//! `build` and `check` ([`crate::commands::marketplace`], one path in two
//! modes — `build --watch` layers [`crate::commands::watch`] over the same
//! path, re-running it on every debounced vault change), `list`
//! ([`crate::commands::list`]), `status`
//! ([`crate::commands::status`]), `bump` ([`crate::commands::bump`]),
//! `adopt` ([`crate::commands::adopt`]), `publish`
//! ([`crate::commands::publish`]), `harness install|update|uninstall`
//! ([`crate::commands::harness`]) and `new`, `rename`, `move`, `delete`,
//! `convert` ([`crate::commands::authoring`]). `init` and `unpublish` have a
//! real argv surface but exit honestly `not implemented` rather than fake a
//! result — see `WAITS_ON_CORE`. Their `--help` says so too, from the
//! same sentence the exit prints.
//!
//! Global flags (`--vault --config --namespace --json --dry-run --yes
//! --quiet`) are declared on each subcommand rather than once on the root —
//! the CLI spec's worked transcripts show them interspersed with a verb's
//! own flags AFTER the verb token, which is the position a subcommand's own
//! declaration accepts.
//!
//! `--namespace` joins the global set rather than one verb's own because it
//! is a configuration override in the same sense `--vault` is — a fact about
//! the vault, not about one verb's work.

use std::io::Write;
use std::path::PathBuf;

use clap::error::ErrorKind;
use clap::{Args, Parser, Subcommand};
use tradecraft_core::BumpLevel;

use crate::commands::adopt::{AdoptFlags, run_adopt};
use crate::commands::authoring::{
    ConvertFlags, DeleteFlags, MoveFlags, NewMarketplaceFlags, NewPluginFlags, NewSkillFlags,
    RenameFlags, run_convert, run_delete, run_move, run_new_marketplace, run_new_plugin,
    run_new_skill, run_rename,
};
use crate::commands::bump::{BumpFlags, run_bump};
use crate::commands::harness::adapter::{CLAUDE, CODEX, CURSOR, HarnessAdapter, Scope};
use crate::commands::harness::{HarnessFlags, HarnessVerb, run_harness};
use crate::commands::list::{ListFlags, run_list};
use crate::commands::marketplace::{ExportFlags, ExportVerb, run_export};
use crate::commands::publish::{PublishFlags, run_publish};
use crate::commands::status::{StatusFlags, run_status};
use crate::commands::watch::run_watch;
use crate::ctx::CommandContext;
use crate::exit::{EXIT_BLOCKED, EXIT_OK, EXIT_USAGE, not_implemented, usage_error};
use crate::resolve::CommonFlags;

const PROG: &str = "tradecraft";
const DESCRIPTION: &str = "Publish Obsidian-vault skill notes to every major coding-agent harness. \
                           A thin CLI over the one Rust core.";

/// The verbs this binary declares, in the order the usage line prints
/// them.
const VERBS: [&str; 9] = [
    "publish",
    "build",
    "check",
    "list",
    "init",
    "adopt",
    "status",
    "unpublish",
    "harness",
];

/// One sentence per stubbed verb, said once here and printed by both the
/// `not implemented` exit and that verb's `--help`, so the two cannot drift.
///
/// What remains waits on a capability the core does not have — a wizard, a
/// removal path — rather than on a binding nobody wrote.
const WAITS_ON_CORE: [(&str, &str); 2] = [
    (
        "init",
        "needs the wizard's vault-detection and prompt flow, plus a config-writing capability. tradecraft-core has neither, and this package never writes configuration.",
    ),
    (
        "unpublish",
        "needs removal logic: PublishStatus is written/unchanged/refused with no `removed`, and nothing in tradecraft-core deletes a published file.",
    ),
];

fn waits_on(verb: &str) -> &'static str {
    WAITS_ON_CORE
        .iter()
        .find(|(name, _)| *name == verb)
        .map(|(_, sentence)| *sentence)
        .expect("every stubbed verb has an entry")
}

/// The sentence a stubbed verb's `--help` carries, read off
/// [`WAITS_ON_CORE`] — so a verb that ships loses its marker by losing its
/// entry there.
fn stub_help(verb: &str) -> String {
    format!(
        "not implemented: {verb} — running this writes the sentence below to stderr and exits {EXIT_BLOCKED}.\n{}\n",
        waits_on(verb)
    )
}

/// The old spellings, by verb, and what replaced each.
///
/// A hard rename with no aliases and no deprecation window: the old flag is
/// an unknown flag (exit 3), and this table is what makes stderr name the new
/// one instead of leaving the user to guess. `--skills` is retired on both
/// `build`/`check` (to `--skills-root`) and `adopt` (to `--into`) with two
/// different replacements, which is why the table is keyed by verb rather
/// than shared flat.
const RETIRED: [(&str, &[(&str, &str)]); 3] = [
    ("build", &[("--skills", "--skills-root")]),
    ("check", &[("--skills", "--skills-root")]),
    (
        "adopt",
        &[
            ("--skills", "--into"),
            ("--skill", "--only"),
            ("--target", "--set-targets"),
        ],
    ),
];

/// The message for a retired flag on this argv, or `None` when there is
/// none.
///
/// The verb is the first token that is not a flag, because a retired
/// spelling is only retired on the verb that had it.
fn retired_spelling(argv: &[String]) -> Option<String> {
    let verb = argv.iter().find(|token| !token.starts_with('-'))?;
    let (_, table) = RETIRED.iter().find(|(name, _)| name == verb)?;
    for token in argv {
        let spelled = token.split('=').next().unwrap_or(token);
        if let Some((_, replacement)) = table.iter().find(|(old, _)| *old == spelled) {
            return Some(format!(
                "{spelled} is no longer a flag on `{verb}`; it is now {replacement}"
            ));
        }
    }
    None
}

/// The five globals that mean something to a verb writing nothing.
///
/// A verb that writes has no separate copy: [`Globals`] flattens this one and
/// adds the two below it, so the five cannot drift between the two surfaces.
///
/// Each help string is spelled out rather than taken from a doc comment,
/// because clap strips a doc comment's trailing period and [`root_help`]
/// reads these back as whole sentences.
#[derive(Args, Debug, Clone)]
struct ReadOnlyGlobals {
    #[arg(
        long,
        value_name = "path",
        help = "Vault root. Overrides the configuration for this run."
    )]
    vault: Option<String>,
    #[arg(
        long,
        value_name = "path",
        help = "Read this project file instead of the nearest `agent-pants.yaml` above the working directory."
    )]
    config: Option<String>,
    #[arg(
        long,
        value_name = "stem",
        help = "Frontmatter namespace stem — the `ap` of `ap-kind`. Overrides the configuration for this run."
    )]
    namespace: Option<String>,
    #[arg(long, help = "Emit the report on stdout as one JSON document.")]
    json: bool,
    #[arg(long, help = "Drop progress and the tally from stderr.")]
    quiet: bool,
}

impl ReadOnlyGlobals {
    fn common(&self) -> CommonFlags {
        CommonFlags {
            vault: self.vault.clone(),
            config: self.config.clone(),
            namespace: self.namespace.clone(),
        }
    }
}

/// The seven globals a verb that writes declares.
///
/// `--dry-run` and `--yes` are here and not in [`ReadOnlyGlobals`] because a
/// verb that writes nothing has no plan to preview and nothing to accept;
/// declaring them there would make `list --yes` look like it did something.
#[derive(Args, Debug, Clone)]
struct Globals {
    #[command(flatten)]
    read_only: ReadOnlyGlobals,
    #[arg(long, help = "Classify and report; write nothing.")]
    dry_run: bool,
    #[arg(long, help = "Accept the plan without prompting.")]
    yes: bool,
}

/// The globals in the order the root `--help` lists them.
const GLOBAL_OPTIONS: [&str; 7] = [
    "vault",
    "config",
    "namespace",
    "json",
    "dry-run",
    "yes",
    "quiet",
];

/// The globals a verb that never writes does not declare.
const WRITE_ONLY_GLOBALS: [&str; 2] = ["dry-run", "yes"];

/// What the root `--help` adds under the verb list: the seven globals, and
/// the three nouns every verb takes.
///
/// The globals are declared per verb, not on the root — see the module note —
/// and that is a parsing constraint, not a documentation one. A user reading
/// `tradecraft --help` has to be able to learn `--vault` exists without
/// guessing which verb to ask. The wording is read back off [`Globals`]'s own
/// declarations, so it is the same sentence the verb prints, and
/// [`WRITE_ONLY_GLOBALS`] are marked because a read-only verb does not
/// declare them.
fn root_help() -> String {
    let declared = Globals::augment_args(clap::Command::new(PROG));
    let rows: Vec<(String, String)> = GLOBAL_OPTIONS
        .iter()
        .map(|long| {
            let arg = declared
                .get_arguments()
                .find(|a| a.get_long() == Some(long))
                .expect("every global is declared on Globals");
            // A boolean global takes no value, and clap still hands back a
            // placeholder value name for one — so the action decides the
            // spelling, not the presence of a name.
            let flag_only = matches!(
                arg.get_action(),
                clap::ArgAction::SetTrue | clap::ArgAction::SetFalse
            );
            let spelling = match arg.get_value_names() {
                Some([name]) if !flag_only => format!("--{long} <{name}>"),
                _ => format!("--{long}"),
            };
            let mut describe = arg.get_help().map(ToString::to_string).unwrap_or_default();
            if WRITE_ONLY_GLOBALS.contains(long) {
                describe.push_str(" Only on a verb that writes.");
            }
            (spelling, describe)
        })
        .collect();
    let width = rows.iter().map(|(f, _)| f.len()).max().unwrap_or(0);
    let globals: Vec<String> = rows
        .iter()
        .map(|(flags, describe)| format!("  {flags:width$}  {describe}"))
        .collect();
    [
        "",
        "Global options (accepted after the verb, e.g. `build --vault ~/notes`):",
        &globals.join("\n"),
        "",
        "The three nouns:",
        "  vault        The Obsidian vault holding the notes. Its skills root is what a scan walks.",
        "  destination  A directory a harness reads its skills from, e.g. `~/.claude`. Publishing writes there.",
        "  target       A harness layout a note renders into, e.g. `claude-code`. `tradecraft list` prints each note's own.",
        "",
    ]
    .join("\n")
}

#[derive(Parser, Debug)]
#[command(name = PROG, version, about = DESCRIPTION, after_help = root_help(), disable_help_subcommand = true)]
struct Cli {
    #[command(subcommand)]
    verb: Verb,
}

#[derive(Subcommand, Debug)]
enum Verb {
    /// Publish notes to their destinations.
    Publish(PublishArgs),
    /// Render the vault into its standalone marketplaces and swap them into place.
    Build(BuildArgs),
    /// Report the marketplace's drift against the vault. Writes nothing; exits 1 on drift.
    Check(ExportArgs),
    /// List every publishable note in the vault. Writes nothing.
    List(ListArgs),
    /// Set up a vault: config, folders, an example skill, destinations.
    #[command(before_help = stub_help("init"))]
    Init(StubArgs),
    /// Bring skills already on disk into the vault as notes.
    Adopt(AdoptArgs),
    /// Report each skill's state at each destination.
    Status(StatusArgs),
    /// Remove a note's files from a destination.
    #[command(before_help = stub_help("unpublish"))]
    Unpublish(UnpublishArgs),
    /// Raise a plugin's `ap-version` by one semver level: `--major`, `--minor`, or `--patch` (default).
    Bump(BumpArgs),
    /// Author a new marketplace, plugin, or skill note.
    New {
        #[command(subcommand)]
        what: NewVerb,
    },
    /// Rename a component, plugin, or marketplace, rewriting every inbound link.
    Rename(RenameArgs),
    /// Move a component to a new plugin, and marketplace when named.
    Move(MoveArgs),
    /// Trash a component's note; `--force` also trashes a non-empty container's members.
    Delete(DeleteArgs),
    /// Change a note's kind, relocating it into the new kind's folder.
    Convert(ConvertArgs),
    /// Wire this vault's built marketplace into a coding-agent harness.
    Harness(HarnessArgs),
}

/// `new`'s three children: which kind of note to author.
#[derive(Subcommand, Debug)]
enum NewVerb {
    /// Author a new marketplace note.
    Marketplace(NewMarketplaceArgs),
    /// Author a new plugin note inside a marketplace.
    Plugin(NewPluginArgs),
    /// Author a new skill note.
    Skill(NewSkillArgs),
}

/// `publish`'s surface.
#[derive(Args, Debug)]
struct PublishArgs {
    /// Vault-relative paths to the notes to publish.
    #[arg(value_name = "note")]
    notes: Vec<String>,
    /// Repeatable. Destination roots. Defaults to every configured destination.
    #[arg(long = "to", value_name = "root")]
    to: Vec<String>,
    /// Narrow to one target across the destinations selected.
    #[arg(long, value_name = "target")]
    target: Option<String>,
    /// Every publishable unit in the vault — every skill note and every plugin note. The default when no note is named.
    #[arg(long)]
    all: bool,
    /// Repeatable. Resolves exactly one conflicted file, by its destination-relative path — the spelling the refusal printed, not an absolute one.
    #[arg(long = "overwrite", value_name = "path")]
    overwrite: Vec<String>,
    #[command(flatten)]
    globals: Globals,
}

/// `build` and `check` take the same flags because they take the same inputs:
/// one render, compared once, two things to do with the comparison.
#[derive(Args, Debug)]
struct ExportArgs {
    /// Where the marketplace roots land. Overrides `marketplace.out`.
    #[arg(long, value_name = "path")]
    out: Option<String>,
    /// The skills root to scan. Overrides the configured one.
    #[arg(long, value_name = "path")]
    skills_root: Option<String>,
    /// The marketplace's name. Overrides `marketplace.name`.
    #[arg(long, value_name = "name")]
    marketplace: Option<String>,
    /// The plugin a note with no `ap-plugin` belongs to. Overrides `marketplace.default_plugin`.
    #[arg(long, value_name = "name")]
    default_plugin: Option<String>,
    #[command(flatten)]
    globals: Globals,
}

/// `build`'s own args, layered over the shared [`ExportArgs`]: everything
/// `build` and `check` have in common, plus the one flag that is `build`-only
/// because it has no meaning for a verb that writes nothing. `check --watch`
/// is refused as an unknown flag rather than silently ignored, which is why
/// this is a separate struct instead of one more field on `ExportArgs`.
#[derive(Args, Debug)]
struct BuildArgs {
    #[command(flatten)]
    export: ExportArgs,
    /// Watch the vault for changes and rebuild on save. Runs the same
    /// render/write path as a plain `build`, once per debounced batch of
    /// filesystem events, printing one status line per rebuild. Never
    /// prompts — each rebuild proceeds as if `--yes` were given, since there
    /// is nobody at a keyboard between saves to answer it. Runs until
    /// interrupted (Ctrl-C).
    #[arg(long)]
    watch: bool,
}

#[derive(Args, Debug)]
struct ListArgs {
    /// The content root to scan. Overrides the configured one.
    #[arg(long, value_name = "path")]
    skills_root: Option<String>,
    #[command(flatten)]
    globals: ReadOnlyGlobals,
}

#[derive(Args, Debug)]
struct StatusArgs {
    /// One note to report on; omitted means every skill.
    #[arg(value_name = "note")]
    note: Option<String>,
    /// Exit non-zero when anything is stale, conflicted, or unknown.
    #[arg(long)]
    check: bool,
    #[command(flatten)]
    globals: ReadOnlyGlobals,
}

/// `adopt`'s surface. Two flags — `--as` and `--promote` — parse and are
/// then answered `not implemented`; see [`crate::commands::adopt`].
#[derive(Args, Debug)]
struct AdoptArgs {
    /// Source paths: a skill directory, a plugin directory, or a directory of either.
    #[arg(value_name = "source")]
    sources: Vec<String>,
    /// Repeatable. Defaults to every registered scan location.
    #[arg(long = "from", value_name = "location")]
    from: Vec<String>,
    /// Repeatable. A repository to read: owner/repo[/path][@ref], or a URL.
    #[arg(long = "from-git", value_name = "ref")]
    from_git: Vec<String>,
    /// The plugin group adopted skills are stamped with. Defaults to the core's own.
    #[arg(long, value_name = "name")]
    plugin: Option<String>,
    /// The skills root adopted notes are written under. Overrides the configured one.
    #[arg(long, value_name = "path")]
    into: Option<String>,
    /// Repeatable. Written into the note's targets key. Absent means every destination.
    #[arg(long = "set-targets", value_name = "target")]
    set_targets: Vec<String>,
    /// Repeatable. Adopt only these, by name or source-relative path. One source at a time.
    #[arg(long = "only", value_name = "name")]
    only: Vec<String>,
    /// Repeatable. Replace this vault note, naming it. There is no run-wide force.
    #[arg(long = "overwrite", value_name = "path")]
    overwrite: Vec<String>,
    /// Adopt one source under a chosen name.
    #[arg(long = "as", value_name = "name")]
    r#as: Option<String>,
    /// Offer to convert the source path from scan location to destination.
    #[arg(long)]
    promote: bool,
    #[command(flatten)]
    globals: Globals,
}

/// A stubbed verb whose only flags are the globals.
///
/// Parsed and then dropped: the argv surface exists so the invocation is
/// accepted and refused honestly, and nothing reads a value until the verb
/// is implemented.
#[allow(dead_code)]
#[derive(Args, Debug)]
struct StubArgs {
    #[command(flatten)]
    globals: Globals,
}

/// `unpublish`'s surface, parsed and then dropped — see [`StubArgs`].
#[allow(dead_code)]
#[derive(Args, Debug)]
struct UnpublishArgs {
    /// The note to unpublish.
    #[arg(value_name = "note")]
    note: String,
    /// Repeatable. Destination roots to remove the note's files from.
    #[arg(long = "to", value_name = "root")]
    to: Vec<String>,
    /// The target/runtime layout to remove.
    #[arg(long, value_name = "target")]
    target: Option<String>,
    /// Repeatable. Acknowledges removal of exactly one drifted file, by its destination-relative path.
    #[arg(long = "overwrite", value_name = "path")]
    overwrite: Vec<String>,
    #[command(flatten)]
    globals: Globals,
}

/// `bump`'s surface: the plugin to raise, and which semver level — mutually
/// exclusive, `--patch` the default when none is given.
#[derive(Args, Debug)]
struct BumpArgs {
    /// The plugin to bump, by its frontmatter `name`.
    #[arg(value_name = "plugin")]
    plugin: String,
    /// Bump the major version.
    #[arg(long, conflicts_with_all = ["minor", "patch"])]
    major: bool,
    /// Bump the minor version.
    #[arg(long, conflicts_with_all = ["major", "patch"])]
    minor: bool,
    /// Bump the patch version. The default when none of the three is given.
    #[arg(long, conflicts_with_all = ["major", "minor"])]
    patch: bool,
    #[command(flatten)]
    globals: Globals,
}

/// `new marketplace`'s surface: its name, and the manifest fields only a
/// marketplace's own note carries.
#[derive(Args, Debug)]
struct NewMarketplaceArgs {
    /// The marketplace's name; its filename is slugged from it.
    #[arg(value_name = "name")]
    name: String,
    /// The marketplace's description.
    #[arg(long, value_name = "text")]
    description: String,
    /// The marketplace's owner.
    #[arg(long, value_name = "text")]
    owner: Option<String>,
    /// The marketplace's author.
    #[arg(long, value_name = "text")]
    author: Option<String>,
    #[command(flatten)]
    globals: Globals,
}

/// `new plugin`'s surface: its name and the marketplace it joins.
#[derive(Args, Debug)]
struct NewPluginArgs {
    /// The plugin's name; its filename is slugged from it.
    #[arg(value_name = "name")]
    name: String,
    /// The marketplace this plugin is authored inside.
    #[arg(long, value_name = "name")]
    marketplace: String,
    /// The plugin's description.
    #[arg(long, value_name = "text")]
    description: String,
    #[command(flatten)]
    globals: Globals,
}

/// `new skill`'s surface: its name, an optional placement, and the harness
/// targets it publishes to.
#[derive(Args, Debug)]
struct NewSkillArgs {
    /// The skill's name; its filename is slugged from it.
    #[arg(value_name = "name")]
    name: String,
    /// The marketplace to place it in. Omitted with `--plugin` too picks the
    /// vault's default marketplace and plugin.
    #[arg(long, value_name = "name")]
    marketplace: Option<String>,
    /// The plugin to place it in.
    #[arg(long, value_name = "name")]
    plugin: Option<String>,
    /// The skill's description.
    #[arg(long, value_name = "text")]
    description: String,
    /// Repeatable. The harness targets this skill publishes to.
    #[arg(long = "targets", value_name = "target")]
    targets: Vec<String>,
    #[command(flatten)]
    globals: Globals,
}

/// `rename`'s surface: the entry and its new name.
#[derive(Args, Debug)]
struct RenameArgs {
    /// The component, plugin, or marketplace to rename, by its `name`.
    #[arg(value_name = "entry")]
    entry: String,
    /// The new name; the filename is slugged from it.
    #[arg(value_name = "new-name")]
    new_name: String,
    #[command(flatten)]
    globals: Globals,
}

/// `move`'s surface: the entry, and the plugin (and marketplace) it moves to.
#[derive(Args, Debug)]
struct MoveArgs {
    /// The component to move, by its `name`.
    #[arg(value_name = "entry")]
    entry: String,
    /// The plugin to move it into.
    #[arg(long = "to-plugin", value_name = "plugin")]
    to_plugin: String,
    /// The marketplace to move it into. Omitted keeps its current one.
    #[arg(long = "to-marketplace", value_name = "marketplace")]
    to_marketplace: Option<String>,
    #[command(flatten)]
    globals: Globals,
}

/// `delete`'s surface: the entry, and whether to cascade a container's members.
#[derive(Args, Debug)]
struct DeleteArgs {
    /// The entry to delete, by its `name`.
    #[arg(value_name = "entry")]
    entry: String,
    /// Also delete a non-empty container's members.
    #[arg(long)]
    force: bool,
    #[command(flatten)]
    globals: Globals,
}

/// `harness`'s children: `install`, `update` and `uninstall`. Nested
/// subcommands rather than flags, so `harness install <harness>` parses as
/// three literal tokens.
#[derive(Args, Debug)]
struct HarnessArgs {
    #[command(subcommand)]
    action: HarnessAction,
}

#[derive(Subcommand, Debug)]
enum HarnessAction {
    /// Register this vault's built marketplace with a harness.
    Install(HarnessVerbArgs),
    /// Install what is missing, then update plugins whose version differs
    /// from the built marketplace.
    Update(HarnessVerbArgs),
    /// Remove this marketplace's plugins from a harness.
    Uninstall(HarnessUninstallArgs),
}

#[derive(Args, Debug)]
struct HarnessVerbArgs {
    #[command(subcommand)]
    target: HarnessTarget<HarnessTargetArgs>,
}

#[derive(Args, Debug)]
struct HarnessUninstallArgs {
    #[command(subcommand)]
    target: HarnessTarget<HarnessUninstallTargetArgs>,
}

/// One variant per harness, each carrying the verb's args `A`.
#[derive(Subcommand, Debug)]
enum HarnessTarget<A: Args> {
    /// Claude Code, through `claude plugin`.
    Claude(A),
    /// Codex, through `codex plugin`. User scope only.
    Codex(A),
    /// Cursor, through `cursor-agent plugin`. User scope only; install and
    /// update need `--git-url`.
    Cursor(A),
}

impl<A: Args> HarnessTarget<A> {
    fn split(&self) -> (&'static HarnessAdapter, &A) {
        match self {
            Self::Claude(args) => (&CLAUDE, args),
            Self::Codex(args) => (&CODEX, args),
            Self::Cursor(args) => (&CURSOR, args),
        }
    }
}

/// `harness uninstall <harness>`'s flags: install's, plus `--marketplace`.
#[derive(Args, Debug)]
struct HarnessUninstallTargetArgs {
    /// Also remove the marketplace registration.
    #[arg(long)]
    marketplace: bool,
    #[command(flatten)]
    target: HarnessTargetArgs,
}

/// `harness <verb> <harness>`'s own flags, plus [`Globals`]: it changes the
/// harness's configuration, so it takes the full set, not [`ReadOnlyGlobals`].
#[derive(Args, Debug)]
struct HarnessTargetArgs {
    /// A plugin from the marketplace. Repeatable. Defaults to
    /// `marketplace.default_plugin`.
    #[arg(long = "plugin", value_name = "name")]
    plugin: Vec<String>,
    /// Where the harness records the install.
    #[arg(long, value_enum, default_value_t = Scope::User)]
    scope: Scope,
    /// The built marketplace directory. Overrides `marketplace.out`.
    #[arg(long, value_name = "path")]
    path: Option<String>,
    /// Register the marketplace from this git URL instead of the directory.
    #[arg(long, value_name = "url")]
    git_url: Option<String>,
    /// The branch, tag or commit of `--git-url` to register.
    #[arg(long, value_name = "ref", requires = "git_url")]
    git_ref: Option<String>,
    #[command(flatten)]
    globals: Globals,
}

/// `convert`'s surface: the entry and the kind to convert it to.
#[derive(Args, Debug)]
struct ConvertArgs {
    /// The entry to convert, by its `name`.
    #[arg(value_name = "entry")]
    entry: String,
    /// The kind to convert it to.
    #[arg(long = "kind", value_name = "kind")]
    kind: String,
    #[command(flatten)]
    globals: Globals,
}

impl HarnessTargetArgs {
    fn flags(&self, adapter: &'static HarnessAdapter) -> HarnessFlags {
        HarnessFlags {
            adapter,
            scope: self.scope,
            plugins: self.plugin.clone(),
            path: self.path.clone(),
            git_url: self.git_url.clone(),
            git_ref: self.git_ref.clone(),
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

impl PublishArgs {
    fn flags(&self) -> PublishFlags {
        PublishFlags {
            notes: self.notes.clone(),
            to: self.to.clone(),
            target: self.target.clone(),
            all: self.all,
            overwrite: self.overwrite.clone(),
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

impl ExportArgs {
    fn flags(&self) -> ExportFlags {
        ExportFlags {
            out: self.out.clone(),
            skills_root: self.skills_root.clone(),
            marketplace: self.marketplace.clone(),
            default_plugin: self.default_plugin.clone(),
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

impl BumpArgs {
    fn flags(&self) -> BumpFlags {
        BumpFlags {
            plugin: self.plugin.clone(),
            level: if self.major {
                BumpLevel::Major
            } else if self.minor {
                BumpLevel::Minor
            } else {
                BumpLevel::Patch
            },
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

impl NewMarketplaceArgs {
    fn flags(&self) -> NewMarketplaceFlags {
        NewMarketplaceFlags {
            name: self.name.clone(),
            description: Some(self.description.clone()),
            owner: self.owner.clone(),
            author: self.author.clone(),
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

impl NewPluginArgs {
    fn flags(&self) -> NewPluginFlags {
        NewPluginFlags {
            name: self.name.clone(),
            marketplace: self.marketplace.clone(),
            description: Some(self.description.clone()),
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

impl NewSkillArgs {
    fn flags(&self) -> NewSkillFlags {
        NewSkillFlags {
            name: self.name.clone(),
            marketplace: self.marketplace.clone(),
            plugin: self.plugin.clone(),
            description: Some(self.description.clone()),
            targets: self.targets.clone(),
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

impl RenameArgs {
    fn flags(&self) -> RenameFlags {
        RenameFlags {
            entry: self.entry.clone(),
            new_name: self.new_name.clone(),
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

impl MoveArgs {
    fn flags(&self) -> MoveFlags {
        MoveFlags {
            entry: self.entry.clone(),
            to_plugin: self.to_plugin.clone(),
            to_marketplace: self.to_marketplace.clone(),
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

impl DeleteArgs {
    fn flags(&self) -> DeleteFlags {
        DeleteFlags {
            entry: self.entry.clone(),
            force: self.force,
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

impl ConvertArgs {
    fn flags(&self) -> ConvertFlags {
        ConvertFlags {
            entry: self.entry.clone(),
            kind: self.kind.clone(),
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

impl AdoptArgs {
    fn flags(&self) -> AdoptFlags {
        AdoptFlags {
            sources: self.sources.clone(),
            from: self.from.clone(),
            from_git: self.from_git.clone(),
            plugin: self.plugin.clone(),
            set_targets: self.set_targets.clone(),
            only: self.only.clone(),
            into: self.into.clone(),
            overwrite: self.overwrite.clone(),
            r#as: self.r#as.clone(),
            promote: self.promote,
            common: self.globals.read_only.common(),
            json: self.globals.read_only.json,
            dry_run: self.globals.dry_run,
            yes: self.globals.yes,
            quiet: self.globals.read_only.quiet,
        }
    }
}

/// Parse `argv` (as in the process arguments after the program name) and run
/// the selected verb, returning the exit code.
///
/// `out` is the report and `err` is everything else; the working directory is
/// the process's own. [`run_with`] is the same entry with the context
/// supplied, which is how the tests drive a verb without a subprocess.
pub fn run(argv: &[String], out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut ctx = CommandContext::new(cwd, out, err);
    run_with(argv, &mut ctx)
}

/// Run `tradecraft with` and return the exit code.
pub fn run_with(argv: &[String], ctx: &mut CommandContext<'_>) -> i32 {
    if argv.is_empty() {
        let _ = writeln!(ctx.err, "usage: {PROG} <{}> [options]", VERBS.join("|"));
        return EXIT_USAGE;
    }

    if let Some(message) = retired_spelling(argv) {
        return usage_error(ctx.err, &message);
    }

    let from = std::iter::once(PROG.to_string()).chain(argv.iter().cloned());
    let cli = match Cli::try_parse_from(from) {
        Ok(cli) => cli,
        Err(error) => return report_parse_error(&error, ctx),
    };

    match &cli.verb {
        Verb::Publish(args) => run_publish(&args.flags(), ctx),
        Verb::Build(args) if args.watch => run_watch(&args.export.flags(), ctx),
        Verb::Build(args) => run_export(ExportVerb::Build, &args.export.flags(), ctx),
        Verb::Check(args) => run_export(ExportVerb::Check, &args.flags(), ctx),
        Verb::List(args) => run_list(
            &ListFlags {
                skills_root: args.skills_root.clone(),
                common: args.globals.common(),
                json: args.globals.json,
                quiet: args.globals.quiet,
            },
            ctx,
        ),
        Verb::Status(args) => run_status(
            &StatusFlags {
                note: args.note.clone(),
                check: args.check,
                common: args.globals.common(),
                json: args.globals.json,
                quiet: args.globals.quiet,
            },
            ctx,
        ),
        Verb::Init(_) => not_implemented(ctx.err, "init", waits_on("init")),
        Verb::Adopt(args) => run_adopt(&args.flags(), ctx),
        Verb::Unpublish(_) => not_implemented(ctx.err, "unpublish", waits_on("unpublish")),
        Verb::Bump(args) => run_bump(&args.flags(), ctx),
        Verb::New { what } => match what {
            NewVerb::Marketplace(args) => run_new_marketplace(&args.flags(), ctx),
            NewVerb::Plugin(args) => run_new_plugin(&args.flags(), ctx),
            NewVerb::Skill(args) => run_new_skill(&args.flags(), ctx),
        },
        Verb::Rename(args) => run_rename(&args.flags(), ctx),
        Verb::Move(args) => run_move(&args.flags(), ctx),
        Verb::Delete(args) => run_delete(&args.flags(), ctx),
        Verb::Convert(args) => run_convert(&args.flags(), ctx),
        Verb::Harness(args) => dispatch_harness(args, ctx),
    }
}

/// Dispatch over `harness`'s nested `<verb> <harness>` shape.
fn dispatch_harness(args: &HarnessArgs, ctx: &mut CommandContext<'_>) -> i32 {
    let (verb, adapter, target) = match &args.action {
        HarnessAction::Install(verb_args) | HarnessAction::Update(verb_args) => {
            let (adapter, target) = verb_args.target.split();
            let verb = match args.action {
                HarnessAction::Install(_) => HarnessVerb::Install,
                _ => HarnessVerb::Update,
            };
            (verb, adapter, target)
        }
        HarnessAction::Uninstall(uninstall) => {
            let (adapter, args) = uninstall.target.split();
            let verb = HarnessVerb::Uninstall {
                marketplace: args.marketplace,
            };
            (verb, adapter, &args.target)
        }
    };
    run_harness(verb, &target.flags(adapter), ctx)
}

/// clap's own error taxonomy, projected onto the CLI spec's exit codes: a help or
/// version request is the run completing, and everything else is a usage
/// error. Help goes to the report sink because it is what the user asked
/// for; an error does not.
fn report_parse_error(error: &clap::Error, ctx: &mut CommandContext<'_>) -> i32 {
    let rendered = error.render().to_string();
    match error.kind() {
        ErrorKind::DisplayHelp | ErrorKind::DisplayVersion => {
            let _ = writeln!(ctx.out, "{rendered}");
            EXIT_OK
        }
        _ => {
            let _ = writeln!(ctx.err, "{rendered}");
            EXIT_USAGE
        }
    }
}
