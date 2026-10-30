//! `skillwright bump` — raise one plugin's `sw-version` by a semver level,
//! rewriting only that frontmatter key. Contract: the CLI spec's `bump`
//! section.
//!
//! A version that does not parse as plain `MAJOR.MINOR.PATCH` is refused
//! rather than guessed at ([`tradecraft_core::next_version`]); an absent
//! `sw-version` starts from the core's own default, `0.1.0` — so a note that
//! has never carried the key is bumped, not refused.

use serde::Serialize;
use tradecraft_core::{
    BumpLevel, EntityKind, FieldEdit, NativeVfs, Vfs, apply_field_edits, discover_components,
    next_version, read_field,
};

use crate::ctx::CommandContext;
use crate::exit::{EXIT_OK, EXIT_REFUSED, blocked, usage_error};
use crate::prompt::confirm_write;
use crate::report::normalize_thrown_reason;
use crate::resolve::{CommonFlags, resolve_run, resolve_skills_root};

/// The resolved flags of `skillwright bump`.
pub struct BumpFlags {
    /// The plugin to bump, by its frontmatter `name`.
    pub plugin: String,
    /// How much of the version to bump.
    pub level: BumpLevel,
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

/// The `--json` row: the same facts the report line carries. Not one of
/// the CLI spec's worked transcripts — those are human-only — so the shape
/// here is this file's own judgement call, kept minimal on purpose.
#[derive(Serialize)]
struct BumpRow<'a> {
    path: &'a str,
    status: &'a str,
    current: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    new: Option<&'a str>,
}

/// One report row, printed as the text line in human mode or as one JSON
/// object in `--json` mode — [`crate::commands::marketplace::run_export`]'s
/// own `--json` branch, applied to a single-unit verb. `Err` is the exit code
/// a report that would not serialize earns; every other outcome is `Ok(())`.
fn write_row(
    ctx: &mut CommandContext<'_>,
    json: bool,
    path: &str,
    status: &str,
    current: &str,
    new: Option<&str>,
    line: &str,
) -> Result<(), i32> {
    if json {
        let row = BumpRow {
            path,
            status,
            current,
            new,
        };
        match serde_json::to_string_pretty(&row) {
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
        let _ = writeln!(ctx.out, "{line}");
        Ok(())
    }
}

/// Run `skillwright bump` and return the exit code.
pub fn run_bump(flags: &BumpFlags, ctx: &mut CommandContext<'_>) -> i32 {
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };
    let namespace = run.core_namespace();
    let skills_root = resolve_skills_root(None, &run, &ctx.cwd);

    let scan = match discover_components(&NativeVfs, &run.vault, skills_root.as_deref(), &namespace)
    {
        Ok(scan) => scan,
        Err(err) => {
            let message = err.to_string();
            return blocked(
                ctx.err,
                &format!(
                    "the vault scan could not complete: {}",
                    normalize_thrown_reason(&message)
                ),
            );
        }
    };

    let matches: Vec<_> = scan
        .components
        .iter()
        .filter(|c| c.kind == EntityKind::Plugin && c.name == flags.plugin)
        .collect();
    let component = match matches.as_slice() {
        [] => {
            return usage_error(
                ctx.err,
                &format!("no plugin named `{}` in this vault", flags.plugin),
            );
        }
        [one] => *one,
        many => {
            // No `--marketplace` flag exists on this verb to disambiguate —
            // see the unit's report for why that is a real, noted gap rather
            // than an oversight.
            let paths: Vec<&str> = many
                .iter()
                .map(|c| c.vault_relative_path.as_str())
                .collect();
            return usage_error(
                ctx.err,
                &format!(
                    "`{}` names more than one plugin: {} — disambiguate by removing all but one from the vault",
                    flags.plugin,
                    paths.join(", ")
                ),
            );
        }
    };

    let bytes = match NativeVfs.read_file(&component.entry_path) {
        Ok(bytes) => bytes,
        Err(err) => {
            let message = err.to_string();
            return blocked(
                ctx.err,
                &format!("bump failed: {}", normalize_thrown_reason(&message)),
            );
        }
    };
    let source = match String::from_utf8(bytes) {
        Ok(source) => source,
        Err(err) => {
            return blocked(
                ctx.err,
                &format!(
                    "bump failed: {} is not valid UTF-8: {err}",
                    component.vault_relative_path
                ),
            );
        }
    };

    let version_key = namespace.key("version");
    let current = match read_field(&source, &version_key) {
        Ok(Some(value)) => value,
        // No `sw-version` at all is not a refusal — the core's stated
        // default is what a bump starts from.
        Ok(None) => "0.1.0".to_string(),
        Err(err) => {
            let message = err.to_string();
            return blocked(
                ctx.err,
                &format!("bump failed: {}", normalize_thrown_reason(&message)),
            );
        }
    };

    let rel = component.vault_relative_path.as_str();
    let new = next_version(&current, flags.level);

    let Some(new) = new else {
        let line = format!("{rel}  refused · non-semver: `{version_key}` reads `{current}`");
        if let Err(code) = write_row(ctx, flags.json, rel, "refused", &current, None, &line) {
            return code;
        }
        if !flags.quiet {
            let _ = writeln!(ctx.err, "1 refused");
        }
        return EXIT_REFUSED;
    };

    if flags.dry_run {
        let line = format!("{rel}  {current} \u{2192} {new}");
        if let Err(code) = write_row(ctx, flags.json, rel, "dry-run", &current, Some(&new), &line) {
            return code;
        }
        let _ = writeln!(
            ctx.err,
            "dry run — reporting the bump this run would make; nothing will be written"
        );
        return EXIT_OK;
    }

    if !flags.yes {
        let plan = vec![format!("{rel}  {version_key} {current} -> {new}")];
        let gate = confirm_write("bump", &plan, ctx.err);
        if gate != EXIT_OK {
            return gate;
        }
    }

    let edited = match apply_field_edits(
        &source,
        &[FieldEdit::set(
            version_key.clone(),
            yaml_splice::Value::Str(new.clone()),
        )],
    ) {
        Ok(edited) => edited,
        Err(err) => {
            let message = err.to_string();
            return blocked(
                ctx.err,
                &format!("bump failed: {}", normalize_thrown_reason(&message)),
            );
        }
    };
    if let Err(err) = NativeVfs.write_file(&component.entry_path, edited.as_bytes()) {
        let message = err.to_string();
        return blocked(
            ctx.err,
            &format!("bump failed: {}", normalize_thrown_reason(&message)),
        );
    }

    let line = format!("{rel}  written · {version_key} {current} -> {new}");
    if let Err(code) = write_row(ctx, flags.json, rel, "written", &current, Some(&new), &line) {
        return code;
    }
    if !flags.quiet {
        let _ = writeln!(ctx.err, "1 written");
    }
    EXIT_OK
}
