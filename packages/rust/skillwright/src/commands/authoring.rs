//! `skillwright new|rename|move|delete|convert` — the five ways to author the
//! vault. Each verb resolves flags into an `tradecraft_core::authoring`
//! `plan_*` call, then runs the plan through [`crate::apply`]: preview for
//! `--dry-run`, a confirm gate, then a real write.
//!
//! The seven verbs (`new`'s three children plus the other four) share one
//! driver (`execute`) and one report shape (`path  status · reason`,
//! `Row`). What differs per verb is which core `plan_*` function it calls
//! and how it turns an [`Applied`] fact into a word — [`apply::Outcome`]
//! hands back raw facts on purpose, never a rendered line, so that wording
//! lives here, one `label_*` function per verb.
//!
//! `rename` and `delete` dispatch on the entry's discovered kind: a plugin
//! rewrites its members through [`plan_rename_plugin`], a marketplace through
//! [`plan_rename_marketplace`], anything else through
//! [`plan_rename_component`]; a container deletes its members with `--force`
//! ([`plan_delete_container`]) or refuses non-empty otherwise
//! ([`plan_delete_component`]).
//!
//! Every core refusal string is printed verbatim — never reworded here, and
//! never edited in the core.

use std::path::Path;

use serde::Serialize;
use tradecraft_core::authoring::{
    bundle_dir, move_destination, new_note_dir, rename_destination, slug_refusal,
};
use tradecraft_core::discover::slugify;
use tradecraft_core::{
    AuthoringOp, DiscoveredComponent, EntityKind, FieldEdit, Namespace, NativeVfs, NewNote,
    Placement, discover_components, plan_convert_kind, plan_create_note, plan_delete_component,
    plan_delete_container, plan_move_component, plan_rename_component, plan_rename_marketplace,
    plan_rename_plugin,
};
use yaml_splice::Value;

use crate::apply::{self, Applied, ApplyError, Outcome};
use crate::ctx::CommandContext;
use crate::exit::{EXIT_OK, EXIT_REFUSED, blocked, usage_error};
use crate::prompt::confirm_write;
use crate::report::normalize_thrown_reason;
use crate::resolve::{CommonFlags, resolve_run};

// ── Flags, one struct per verb — the command layer's own shape, resolved
// from `cli.rs`'s clap `Args` the way `BumpFlags` is. ─────────────────────────

/// The resolved flags of `skillwright new marketplace`.
pub struct NewMarketplaceFlags {
    /// The name of the new note.
    pub name: String,
    /// The description written into the new note.
    pub description: Option<String>,
    /// The marketplace owner.
    pub owner: Option<String>,
    /// The marketplace author.
    pub author: Option<String>,
    /// The global `--vault`, `--config` and `--namespace` flags.
    pub common: CommonFlags,
    /// `--json`: print the report as one JSON document.
    pub json: bool,
    /// `--dry-run`: classify and report; write nothing.
    pub dry_run: bool,
    /// `--yes`: accept the plan without prompting.
    pub yes: bool,
    /// `--quiet`: drop progress and the tally from stderr.
    pub quiet: bool,
}

/// The resolved flags of `skillwright new plugin`.
pub struct NewPluginFlags {
    /// The name of the new note.
    pub name: String,
    /// The marketplace the plugin goes into.
    pub marketplace: String,
    /// The description written into the new note.
    pub description: Option<String>,
    /// The global `--vault`, `--config` and `--namespace` flags.
    pub common: CommonFlags,
    /// `--json`: print the report as one JSON document.
    pub json: bool,
    /// `--dry-run`: classify and report; write nothing.
    pub dry_run: bool,
    /// `--yes`: accept the plan without prompting.
    pub yes: bool,
    /// `--quiet`: drop progress and the tally from stderr.
    pub quiet: bool,
}

/// The resolved flags of `skillwright new skill`.
pub struct NewSkillFlags {
    /// The name of the new note.
    pub name: String,
    /// The marketplace the note goes into.
    pub marketplace: Option<String>,
    /// The plugin the skill belongs to.
    pub plugin: Option<String>,
    /// The description written into the new note.
    pub description: Option<String>,
    /// Targets written to `sw-targets`.
    pub targets: Vec<String>,
    /// The global `--vault`, `--config` and `--namespace` flags.
    pub common: CommonFlags,
    /// `--json`: print the report as one JSON document.
    pub json: bool,
    /// `--dry-run`: classify and report; write nothing.
    pub dry_run: bool,
    /// `--yes`: accept the plan without prompting.
    pub yes: bool,
    /// `--quiet`: drop progress and the tally from stderr.
    pub quiet: bool,
}

/// The resolved flags of `skillwright rename`.
pub struct RenameFlags {
    /// The entry to act on, by its `name`.
    pub entry: String,
    /// The name to change it to.
    pub new_name: String,
    /// The global `--vault`, `--config` and `--namespace` flags.
    pub common: CommonFlags,
    /// `--json`: print the report as one JSON document.
    pub json: bool,
    /// `--dry-run`: classify and report; write nothing.
    pub dry_run: bool,
    /// `--yes`: accept the plan without prompting.
    pub yes: bool,
    /// `--quiet`: drop progress and the tally from stderr.
    pub quiet: bool,
}

/// The resolved flags of `skillwright move`.
pub struct MoveFlags {
    /// The entry to act on, by its `name`.
    pub entry: String,
    /// The plugin to move the entry into.
    pub to_plugin: String,
    /// The marketplace holding the destination plugin.
    pub to_marketplace: Option<String>,
    /// The global `--vault`, `--config` and `--namespace` flags.
    pub common: CommonFlags,
    /// `--json`: print the report as one JSON document.
    pub json: bool,
    /// `--dry-run`: classify and report; write nothing.
    pub dry_run: bool,
    /// `--yes`: accept the plan without prompting.
    pub yes: bool,
    /// `--quiet`: drop progress and the tally from stderr.
    pub quiet: bool,
}

/// The resolved flags of `skillwright delete`.
pub struct DeleteFlags {
    /// The entry to act on, by its `name`.
    pub entry: String,
    /// Also delete a non-empty container's members.
    pub force: bool,
    /// The global `--vault`, `--config` and `--namespace` flags.
    pub common: CommonFlags,
    /// `--json`: print the report as one JSON document.
    pub json: bool,
    /// `--dry-run`: classify and report; write nothing.
    pub dry_run: bool,
    /// `--yes`: accept the plan without prompting.
    pub yes: bool,
    /// `--quiet`: drop progress and the tally from stderr.
    pub quiet: bool,
}

/// The resolved flags of `skillwright convert`.
pub struct ConvertFlags {
    /// The entry to act on, by its `name`.
    pub entry: String,
    /// The kind to convert the entry to.
    pub kind: String,
    /// The global `--vault`, `--config` and `--namespace` flags.
    pub common: CommonFlags,
    /// `--json`: print the report as one JSON document.
    pub json: bool,
    /// `--dry-run`: classify and report; write nothing.
    pub dry_run: bool,
    /// `--yes`: accept the plan without prompting.
    pub yes: bool,
    /// `--quiet`: drop progress and the tally from stderr.
    pub quiet: bool,
}

// ── `new marketplace` / `new plugin` / `new skill` ─────────────────────────

/// Run `skillwright new marketplace` and return the exit code.
pub fn run_new_marketplace(flags: &NewMarketplaceFlags, ctx: &mut CommandContext<'_>) -> i32 {
    if let Some(reason) = bad_name(&flags.name, "marketplace name") {
        return usage_error(ctx.err, &reason);
    }
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let ns = run.core_namespace();

    let placement = Placement {
        marketplace: None,
        plugin: None,
        kind: Some(EntityKind::Marketplace.as_str().to_string()),
        folder: None,
    };
    let mut fields = Vec::new();
    if let Some(d) = &flags.description {
        fields.push(FieldEdit::set("description", Value::Str(d.clone())));
    }
    if let Some(o) = &flags.owner {
        fields.push(FieldEdit::set(ns.key("owner"), Value::Str(o.clone())));
    }
    if let Some(a) = &flags.author {
        fields.push(FieldEdit::set(ns.key("author"), Value::Str(a.clone())));
    }
    let note = NewNote {
        placement: Some(&placement),
        name: &flags.name,
        bundled: true,
        fields: &fields,
        body: "",
    };
    let op_result = plan_create_note(&NativeVfs, &run.vault, &ns, &note);
    let fallback = expected_create_path(Some(&placement), &flags.name, true);
    execute(
        op_result,
        &fallback,
        &run.vault,
        "new marketplace",
        &write_flags(flags.json, flags.dry_run, flags.yes, flags.quiet),
        &label_create,
        ctx,
    )
}

/// Run `skillwright new plugin` and return the exit code.
pub fn run_new_plugin(flags: &NewPluginFlags, ctx: &mut CommandContext<'_>) -> i32 {
    if let Some(reason) = bad_name(&flags.name, "plugin name") {
        return usage_error(ctx.err, &reason);
    }
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let ns = run.core_namespace();

    let placement = Placement {
        marketplace: Some(flags.marketplace.clone()),
        plugin: None,
        kind: Some(EntityKind::Plugin.as_str().to_string()),
        folder: None,
    };
    let mut fields = Vec::new();
    if let Some(d) = &flags.description {
        fields.push(FieldEdit::set("description", Value::Str(d.clone())));
    }
    let note = NewNote {
        placement: Some(&placement),
        name: &flags.name,
        bundled: true,
        fields: &fields,
        body: "",
    };
    let op_result = plan_create_note(&NativeVfs, &run.vault, &ns, &note);
    let fallback = expected_create_path(Some(&placement), &flags.name, true);
    execute(
        op_result,
        &fallback,
        &run.vault,
        "new plugin",
        &write_flags(flags.json, flags.dry_run, flags.yes, flags.quiet),
        &label_create,
        ctx,
    )
}

/// Run `skillwright new skill` and return the exit code.
pub fn run_new_skill(flags: &NewSkillFlags, ctx: &mut CommandContext<'_>) -> i32 {
    if let Some(reason) = bad_name(&flags.name, "component name") {
        return usage_error(ctx.err, &reason);
    }
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let ns = run.core_namespace();
    let components = match scan_components(&run.vault, &ns, ctx) {
        Ok(components) => components,
        Err(code) => return code,
    };

    // `--plugin` with no `--marketplace` joins the plugin's OWN marketplace
    // rather than leaving the level unnamed — a skill placed "in dev-agent"
    // means the marketplace `dev-agent` already sits in, not a bare
    // `plugins/dev-agent/skills` outside every marketplace. Only inferred
    // when the plugin resolves to exactly one component; anything else falls
    // through to the placement as given.
    let marketplace = flags.marketplace.clone().or_else(|| {
        flags.plugin.as_deref().and_then(|plugin| {
            let matches: Vec<&DiscoveredComponent> = components
                .iter()
                .filter(|c| c.kind == EntityKind::Plugin && c.name == plugin)
                .collect();
            match matches.as_slice() {
                [one] => one.marketplace.clone(),
                _ => None,
            }
        })
    });

    // No placement at all is the one shape `new_note_dir` treats specially —
    // the vault's own default marketplace and plugin. Naming either level
    // switches to an explicit placement, passed through as given.
    let placement = if marketplace.is_none() && flags.plugin.is_none() {
        None
    } else {
        Some(Placement {
            marketplace,
            plugin: flags.plugin.clone(),
            kind: Some(EntityKind::Skill.as_str().to_string()),
            folder: None,
        })
    };
    let mut fields = Vec::new();
    if let Some(d) = &flags.description {
        fields.push(FieldEdit::set("description", Value::Str(d.clone())));
    }
    if !flags.targets.is_empty() {
        fields.push(FieldEdit::set(
            ns.key("targets"),
            Value::Seq(flags.targets.iter().cloned().map(Value::Str).collect()),
        ));
    }
    let note = NewNote {
        placement: placement.as_ref(),
        name: &flags.name,
        bundled: true,
        fields: &fields,
        body: "",
    };
    let op_result = plan_create_note(&NativeVfs, &run.vault, &ns, &note);
    let fallback = expected_create_path(placement.as_ref(), &flags.name, true);
    execute(
        op_result,
        &fallback,
        &run.vault,
        "new skill",
        &write_flags(flags.json, flags.dry_run, flags.yes, flags.quiet),
        &label_create,
        ctx,
    )
}

// ── `rename` ────────────────────────────────────────────────────────────────

/// Run `skillwright rename` and return the exit code.
pub fn run_rename(flags: &RenameFlags, ctx: &mut CommandContext<'_>) -> i32 {
    let slug = slugify(&flags.new_name);
    if let Some(reason) = slug_refusal(&slug, "component name") {
        return usage_error(ctx.err, &reason);
    }
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let ns = run.core_namespace();
    let components = match scan_components(&run.vault, &ns, ctx) {
        Ok(components) => components,
        Err(code) => return code,
    };
    let component = match resolve_entry(&components, &flags.entry) {
        Ok(component) => component,
        Err(reason) => return usage_error(ctx.err, &reason),
    };
    let entry = component.vault_relative_path.as_str();

    let op_result = match component.kind {
        EntityKind::Plugin => {
            plan_rename_plugin(&NativeVfs, &run.vault, &ns, entry, &flags.new_name)
        }
        EntityKind::Marketplace => {
            plan_rename_marketplace(&NativeVfs, &run.vault, &ns, entry, &flags.new_name)
        }
        _ => plan_rename_component(&NativeVfs, &run.vault, &ns, entry, &flags.new_name),
    };
    let fallback = rename_destination(entry, &slug);
    execute(
        op_result,
        &fallback,
        &run.vault,
        "rename",
        &write_flags(flags.json, flags.dry_run, flags.yes, flags.quiet),
        &label_rename,
        ctx,
    )
}

// ── `move` ──────────────────────────────────────────────────────────────────

/// Run `skillwright move` and return the exit code.
pub fn run_move(flags: &MoveFlags, ctx: &mut CommandContext<'_>) -> i32 {
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let ns = run.core_namespace();
    let components = match scan_components(&run.vault, &ns, ctx) {
        Ok(components) => components,
        Err(code) => return code,
    };
    let component = match resolve_entry(&components, &flags.entry) {
        Ok(component) => component,
        Err(reason) => return usage_error(ctx.err, &reason),
    };
    let entry = component.vault_relative_path.as_str();

    // `--to-marketplace` omitted keeps the entry's current marketplace —
    // `plan_move_component`'s own `marketplace: None` means "no marketplace
    // at all", which is not what an omitted flag asks for here.
    let marketplace = flags
        .to_marketplace
        .clone()
        .or_else(|| component.marketplace.clone());
    let plugin = Some(flags.to_plugin.clone());

    let op_result = plan_move_component(
        &NativeVfs,
        &run.vault,
        &ns,
        entry,
        marketplace.as_deref(),
        plugin.as_deref(),
    );
    let fallback = move_destination(
        entry,
        component.kind,
        marketplace.as_deref(),
        plugin.as_deref(),
    )
    .unwrap_or_else(|_| entry.to_string());
    execute(
        op_result,
        &fallback,
        &run.vault,
        "move",
        &write_flags(flags.json, flags.dry_run, flags.yes, flags.quiet),
        &label_move,
        ctx,
    )
}

// ── `delete` ────────────────────────────────────────────────────────────────

/// Run `skillwright delete` and return the exit code.
pub fn run_delete(flags: &DeleteFlags, ctx: &mut CommandContext<'_>) -> i32 {
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let ns = run.core_namespace();
    let components = match scan_components(&run.vault, &ns, ctx) {
        Ok(components) => components,
        Err(code) => return code,
    };
    let component = match resolve_entry(&components, &flags.entry) {
        Ok(component) => component,
        Err(reason) => return usage_error(ctx.err, &reason),
    };
    let entry = component.vault_relative_path.as_str();

    let op_result = if flags.force && component.kind.holds_components() {
        plan_delete_container(&NativeVfs, &run.vault, &ns, entry, component.kind)
    } else {
        plan_delete_component(&NativeVfs, &run.vault, &ns, entry)
    };
    let fallback = bundle_dir(entry).unwrap_or(entry).to_string();
    execute(
        op_result,
        &fallback,
        &run.vault,
        "delete",
        &write_flags(flags.json, flags.dry_run, flags.yes, flags.quiet),
        &label_delete,
        ctx,
    )
}

// ── `convert` ───────────────────────────────────────────────────────────────

/// Run `skillwright convert` and return the exit code.
pub fn run_convert(flags: &ConvertFlags, ctx: &mut CommandContext<'_>) -> i32 {
    let to_kind = match flags.kind.parse::<EntityKind>() {
        Ok(kind) => kind,
        Err(err) => return usage_error(ctx.err, &err.to_string()),
    };
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let ns = run.core_namespace();
    let components = match scan_components(&run.vault, &ns, ctx) {
        Ok(components) => components,
        Err(code) => return code,
    };
    let component = match resolve_entry(&components, &flags.entry) {
        Ok(component) => component,
        Err(reason) => return usage_error(ctx.err, &reason),
    };
    let entry = component.vault_relative_path.as_str();

    let op_result = plan_convert_kind(&NativeVfs, &run.vault, &ns, entry, to_kind, &[]);
    let kind_key = ns.key("kind");
    let label = label_convert(kind_key, to_kind);
    execute(
        op_result,
        entry,
        &run.vault,
        "convert",
        &write_flags(flags.json, flags.dry_run, flags.yes, flags.quiet),
        &label,
        ctx,
    )
}

// ── The shared driver ───────────────────────────────────────────────────────

struct WriteFlags {
    json: bool,
    dry_run: bool,
    yes: bool,
    quiet: bool,
}

fn write_flags(json: bool, dry_run: bool, yes: bool, quiet: bool) -> WriteFlags {
    WriteFlags {
        json,
        dry_run,
        yes,
        quiet,
    }
}

/// Run one authoring op: refuse a plan the core would not make, preview and
/// stop for `--dry-run`, confirm interactively (showing the same rows a real
/// run would print), then apply — printing the report either way.
///
/// `fallback_path` is what a refusal row names when the op could not even be
/// planned, so there is no [`Outcome`] to read a path off yet.
fn execute(
    op_result: Result<AuthoringOp, String>,
    fallback_path: &str,
    vault: &Path,
    verb: &str,
    flags: &WriteFlags,
    label: &dyn Fn(&Applied) -> Option<String>,
    ctx: &mut CommandContext<'_>,
) -> i32 {
    let op = match op_result {
        Ok(op) => op,
        Err(reason) => return refuse_row(fallback_path, &reason, flags, ctx),
    };

    if flags.dry_run {
        return match apply::preview(vault, &op) {
            Ok(outcome) => report_success(&outcome, label, flags, ctx),
            Err(err) => refuse_row(fallback_path, &err.to_string(), flags, ctx),
        };
    }

    if !flags.yes {
        let preview = match apply::preview(vault, &op) {
            Ok(outcome) => outcome,
            Err(err) => return refuse_row(fallback_path, &err.to_string(), flags, ctx),
        };
        let plan = plan_lines(&preview, label);
        let gate = confirm_write(verb, &plan, ctx.err);
        if gate != EXIT_OK {
            return gate;
        }
    }

    match apply::apply(vault, &op) {
        Ok(outcome) => report_success(&outcome, label, flags, ctx),
        Err(ApplyError::Partial { outcome, source }) => report_partial(
            &outcome,
            &source.to_string(),
            fallback_path,
            label,
            flags,
            ctx,
        ),
        Err(err) => refuse_row(fallback_path, &err.to_string(), flags, ctx),
    }
}

fn refuse_row(path: &str, reason: &str, flags: &WriteFlags, ctx: &mut CommandContext<'_>) -> i32 {
    let rows = [Row {
        path,
        status: "refused",
        reason: Some(reason),
    }];
    if let Err(code) = write_rows(&rows, flags.json, ctx) {
        return code;
    }
    if !flags.quiet {
        let _ = writeln!(ctx.err, "1 refused");
    }
    EXIT_REFUSED
}

/// A later step failed after an earlier one in the same op had already
/// written. Reports the rows that landed exactly as [`report_success`]
/// would, plus one more `refused` row for what stopped the rest — so the
/// rows that did land are never discarded behind a bare "1 refused".
fn report_partial(
    outcome: &Outcome,
    reason: &str,
    fallback_path: &str,
    label: &dyn Fn(&Applied) -> Option<String>,
    flags: &WriteFlags,
    ctx: &mut CommandContext<'_>,
) -> i32 {
    let grouped = group_rows(outcome, label);
    let mut rows: Vec<Row<'_>> = grouped
        .iter()
        .map(|(path, status, reason)| Row {
            path,
            status,
            reason: Some(reason.as_str()),
        })
        .collect();
    rows.push(Row {
        path: fallback_path,
        status: "refused",
        reason: Some(reason),
    });
    if let Err(code) = write_rows(&rows, flags.json, ctx) {
        return code;
    }
    if !flags.quiet {
        let written = grouped.iter().filter(|(_, s, _)| *s == "written").count();
        let skipped = grouped.iter().filter(|(_, s, _)| *s == "skipped").count();
        let mut parts = Vec::new();
        if written > 0 {
            parts.push(format!("{written} written"));
        }
        if skipped > 0 {
            parts.push(format!("{skipped} skipped"));
        }
        parts.push("1 refused".to_string());
        let _ = writeln!(ctx.err, "{}", parts.join(", "));
    }
    EXIT_REFUSED
}

fn report_success(
    outcome: &Outcome,
    label: &dyn Fn(&Applied) -> Option<String>,
    flags: &WriteFlags,
    ctx: &mut CommandContext<'_>,
) -> i32 {
    let grouped = group_rows(outcome, label);
    let rows: Vec<Row<'_>> = grouped
        .iter()
        .map(|(path, status, reason)| Row {
            path,
            status,
            reason: Some(reason.as_str()),
        })
        .collect();
    if let Err(code) = write_rows(&rows, flags.json, ctx) {
        return code;
    }
    if flags.dry_run {
        let _ = writeln!(
            ctx.err,
            "dry run — reporting the write this run would make; nothing will be written"
        );
    }
    if !flags.quiet {
        let written = grouped.iter().filter(|(_, s, _)| *s == "written").count();
        let skipped = grouped.iter().filter(|(_, s, _)| *s == "skipped").count();
        let mut parts = Vec::new();
        if written > 0 {
            parts.push(format!("{written} written"));
        }
        if skipped > 0 {
            parts.push(format!("{skipped} skipped"));
        }
        let tally = if parts.is_empty() {
            "nothing to report".to_string()
        } else {
            parts.join(", ")
        };
        let _ = writeln!(ctx.err, "{tally}");
    }
    EXIT_OK
}

/// [`Outcome::entries`] grouped by path, in first-occurrence order, each
/// path's facts joined into one reason — so a rename's link rewrite and a
/// move's dropped `sw-plugin` land as one row each, exactly as
/// the CLI spec's transcripts show them.
///
/// A [`Applied::Skipped`] fact is the one status word this file adds beyond
/// `written`/`refused`: the op still succeeded, but `markdown_relink` left
/// one third note's link exactly as written. Not a run-level refusal — the
/// same reasoning [`crate::report::NOT_APPLICABLE`] states for a state a
/// publish cannot change.
fn group_rows(
    outcome: &Outcome,
    label: &dyn Fn(&Applied) -> Option<String>,
) -> Vec<(String, &'static str, String)> {
    let mut grouped: Vec<(String, &'static str, Vec<String>)> = Vec::new();
    for entry in &outcome.entries {
        let Some(fragment) = label(&entry.applied) else {
            continue;
        };
        let status = if matches!(entry.applied, Applied::Skipped { .. }) {
            "skipped"
        } else {
            "written"
        };
        // A `Trashed` fact reports against its trash destination, not the
        // pre-trash path `entry.path` still names — the row is about where
        // the entry now lives.
        let path = match &entry.applied {
            Applied::Trashed { to } => to.as_str(),
            _ => entry.path.as_str(),
        };
        match grouped.iter_mut().find(|(p, ..)| p == path) {
            Some((_, _, fragments)) => fragments.push(fragment),
            None => grouped.push((path.to_string(), status, vec![fragment])),
        }
    }
    grouped
        .into_iter()
        .map(|(path, status, fragments)| (path, status, fragments.join(", ")))
        .collect()
}

fn plan_lines(outcome: &Outcome, label: &dyn Fn(&Applied) -> Option<String>) -> Vec<String> {
    group_rows(outcome, label)
        .into_iter()
        .map(|(path, status, reason)| format!("{path}  {status} · {reason}"))
        .collect()
}

// ── The report row ──────────────────────────────────────────────────────────

#[derive(Serialize)]
struct Row<'a> {
    path: &'a str,
    status: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'a str>,
}

/// `path  status[ · reason]`, one line per row in human mode, or the same
/// rows as one JSON array — the CLI spec's shape, and `list`/`build`'s own
/// `--json` convention (a whole document, not one line per row).
fn write_rows(rows: &[Row<'_>], json: bool, ctx: &mut CommandContext<'_>) -> Result<(), i32> {
    if json {
        match serde_json::to_string_pretty(rows) {
            Ok(document) => {
                let _ = writeln!(ctx.out, "{document}");
                Ok(())
            }
            Err(err) => Err(blocked(
                ctx.err,
                &format!("the report would not serialize: {err}"),
            )),
        }
    } else {
        for row in rows {
            let line = match row.reason {
                Some(reason) => format!("{}  {} · {}", row.path, row.status, reason),
                None => format!("{}  {}", row.path, row.status),
            };
            let _ = writeln!(ctx.out, "{line}");
        }
        Ok(())
    }
}

// ── Labelling: one `Applied` fact to one word, in the command layer's own
// vocabulary — `apply.rs` hands back raw facts on purpose. ──────────────────

/// The fallback for any [`Applied`] fact a verb's own `label_*` does not name
/// specially: `apply.rs`'s own stable outcome token, plus its reason when it
/// has one. Not tested by any acceptance transcript — every word a
/// transcript names is matched exactly by the verb-specific arm above this
/// one in each `label_*`.
fn generic_label(applied: &Applied) -> String {
    match applied.reason() {
        Some(reason) => format!("{} ({reason})", applied.outcome()),
        None => applied.outcome().to_string(),
    }
}

fn plural(n: u64, word: &str) -> String {
    format!("{n} {word}{}", if n == 1 { "" } else { "s" })
}

fn label_create(applied: &Applied) -> Option<String> {
    Some(match applied {
        Applied::Created => "first-write".to_string(),
        Applied::Scaffolded => "scaffold".to_string(),
        other => generic_label(other),
    })
}

fn label_rename(applied: &Applied) -> Option<String> {
    match applied {
        Applied::Renamed { .. } => Some("renamed".to_string()),
        Applied::LinksRewritten { edits } => Some(format!("{} rewritten", plural(*edits, "link"))),
        // The `name` edit is what a rename IS — reporting it again beside
        // "renamed" would say the same fact twice.
        Applied::FieldSet { key } if key == "name" => None,
        Applied::FieldSet { key } => Some(format!("{key} set")),
        Applied::FieldRemoved { key } => Some(format!("{key} removed")),
        other => Some(generic_label(other)),
    }
}

fn label_move(applied: &Applied) -> Option<String> {
    match applied {
        Applied::Renamed { .. } => Some("moved".to_string()),
        Applied::LinksRewritten { edits } => Some(format!("{} rewritten", plural(*edits, "link"))),
        Applied::FieldRemoved { key } => Some(format!("{key} removed")),
        Applied::FieldSet { key } => Some(format!("{key} set")),
        other => Some(generic_label(other)),
    }
}

fn label_delete(applied: &Applied) -> Option<String> {
    Some(match applied {
        Applied::Trashed { .. } => "moved to trash".to_string(),
        other => generic_label(other),
    })
}

/// `convert`'s own labeller, closed over the kind key and the target kind:
/// [`Applied::FieldSet`] only ever carries the key it set, never the value,
/// so the value shown (`sw-kind: plugin`) is this verb's own, not read back
/// off the outcome. The physical relocation a conversion into or out of a
/// container kind makes is not reported on its own line — `sw-kind: <k>` is
/// the fact the CLI spec asks this verb to lead with, and the move is
/// what becoming that kind implies.
fn label_convert(kind_key: String, to_kind: EntityKind) -> impl Fn(&Applied) -> Option<String> {
    move |applied: &Applied| match applied {
        Applied::Renamed { .. } => None,
        Applied::Scaffolded => Some("scaffold".to_string()),
        Applied::FieldSet { key } if *key == kind_key => {
            Some(format!("{kind_key}: {}", to_kind.as_str()))
        }
        Applied::FieldSet { key } => Some(format!("{key} set")),
        Applied::FieldRemoved { key } => Some(format!("{key} removed")),
        other => Some(generic_label(other)),
    }
}

// ── Shared lookups ──────────────────────────────────────────────────────────

/// A name with nothing sluggable in it, or a slug the skills-spec grammar
/// refuses — checked here, before any vault access, so a bad name never
/// reaches the vault at all.
fn bad_name(name: &str, what: &str) -> Option<String> {
    slug_refusal(&slugify(name), what)
}

/// The vault's current component scan, or the run-level blocker a failed
/// scan earns — the same wording `bump` uses for the same failure.
fn scan_components(
    vault: &Path,
    ns: &Namespace,
    ctx: &mut CommandContext<'_>,
) -> Result<Vec<DiscoveredComponent>, i32> {
    match discover_components(&NativeVfs, vault, None, ns) {
        Ok(scan) => Ok(scan.components),
        Err(err) => Err(blocked(
            ctx.err,
            &format!(
                "the vault scan could not complete: {}",
                normalize_thrown_reason(&err.to_string())
            ),
        )),
    }
}

/// The one component named `entry` in the current scan — by its frontmatter
/// `name`, exactly as `bump` resolves a plugin. `Err` is a usage error: none
/// found, or more than one and no flag on these verbs to disambiguate.
fn resolve_entry<'a>(
    components: &'a [DiscoveredComponent],
    entry: &str,
) -> Result<&'a DiscoveredComponent, String> {
    let matches: Vec<&DiscoveredComponent> =
        components.iter().filter(|c| c.name == entry).collect();
    match matches.as_slice() {
        [] => Err(format!("no component named `{entry}` in this vault")),
        [one] => Ok(*one),
        many => Err(format!(
            "`{entry}` names more than one component: {} — disambiguate by removing all but one from the vault",
            many.iter()
                .map(|c| c.vault_relative_path.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

/// The path a create would land at, best-effort — for a refusal row only.
/// The real path is `derive_create`'s to compute, and that function is
/// private; this mirrors its public half ([`new_note_dir`]) plus its
/// bundling rule rather than reaching for what the crate does not export.
fn expected_create_path(placement: Option<&Placement>, name: &str, bundled: bool) -> String {
    let slug = slugify(name);
    let Ok(dir) = new_note_dir(placement) else {
        return slug;
    };
    let is_container = placement
        .and_then(|p| p.kind.as_deref())
        .and_then(|k| k.trim().parse::<EntityKind>().ok())
        .is_some_and(EntityKind::holds_components);
    if bundled || is_container {
        format!("{dir}/{slug}/{slug}.md")
    } else {
        format!("{dir}/{slug}.md")
    }
}
