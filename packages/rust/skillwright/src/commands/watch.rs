//! `skillwright build --watch` — the same render/write path `build` uses,
//! re-run every time something inside the vault, or any declared `assets:`
//! or `hooks:` source, changes on disk.
//!
//! This module owns no rendering logic of its own. It resolves the vault
//! root once (the same [`resolve_run`] every other verb calls), arms a
//! [`notify`] watcher over it and over each asset and hooks source. A
//! directory is watched recursively; a file through its parent directory,
//! because an editor's atomic save replaces the file a direct watch would be
//! holding. On every debounced batch of filesystem events it calls straight
//! back into [`crate::commands::marketplace::run_export`] — one rebuild, one status
//! line, the identical write path a plain `skillwright build` takes. A batch
//! that turns out to touch nothing publishable still writes nothing and
//! still reports "0 changed", exactly as running `build` twice in a row
//! would.
//!
//! A rebuild that fails — a half-saved note that does not parse yet — prints
//! its error and keeps watching: the next save is the fix, and a loop that
//! died on the first mistake would make the author restart it every time.
//! Only the initial build's failure ends the command, because that one says
//! the configuration itself is wrong.
//!
//! # Debouncing
//!
//! One save is several OS events — an editor's atomic write is a temp file
//! created, written, and renamed over the target, which a naive watcher
//! would see as three or four separate events. `DEBOUNCE` collapses a
//! burst into one rebuild. The loop needs no per-path classification,
//! only "something changed, rebuild".
//!
//! # No confirmation prompt
//!
//! [`run_export`]'s write path asks for confirmation unless `--yes` was
//! given (the CLI spec's rule for any writing verb). A watch loop has
//! nobody at a keyboard between saves to answer that prompt, so every
//! rebuild this module triggers passes `yes: true` regardless of what the
//! user typed — the same way `--dry-run` on `build` already overrides what
//! would otherwise be asked. What the user passed for `--dry-run` is left
//! alone: a `build --watch --dry-run` is a legitimate "tell me what would
//! change on every save, write nothing" loop.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::{RecursiveMode, Watcher};

use crate::commands::marketplace::{ExportFlags, ExportVerb, run_export};
use crate::config::resolve_configured_path;
use crate::ctx::CommandContext;
use crate::exit::{EXIT_OK, blocked};
use crate::resolve::resolve_run;

/// How long a burst of filesystem events is treated as one save. Long enough
/// to swallow an editor's create/write/rename trio; short enough that the
/// "a few seconds" rebuild budget still has room in it once the render
/// itself is accounted for.
const DEBOUNCE: Duration = Duration::from_millis(300);

/// Watch the vault named by `flags` and rebuild on every change. Runs until
/// interrupted (Ctrl-C ends the process; there is no other stop signal in
/// the CLI surface) — see [`run_watch_for`] for the bounded form a test
/// drives so the suite itself does not hang forever.
pub fn run_watch(flags: &ExportFlags, ctx: &mut CommandContext<'_>) -> i32 {
    run_watch_for(flags, ctx, None)
}

/// The real loop. An initial build runs first, unconditionally, so the
/// output reflects the vault's current state the moment the watch starts
/// rather than only after the first subsequent save. After that, one
/// rebuild runs per debounced batch of events.
///
/// `max_rebuilds` bounds how many EVENT-TRIGGERED rebuilds (not counting the
/// initial one) the loop performs before returning `EXIT_OK`, so a test can
/// touch a file and wait for exactly one rebuild instead of watching a loop
/// that would otherwise run until the test process is killed. Production's
/// `run_watch` passes `None` and never returns on its own.
pub fn run_watch_for(
    flags: &ExportFlags,
    ctx: &mut CommandContext<'_>,
    max_rebuilds: Option<usize>,
) -> i32 {
    let run = match resolve_run(&flags.common, &ctx.cwd, ctx.err) {
        Ok(run) => run,
        Err(code) => return code,
    };

    // Every rebuild this loop triggers writes unattended — see the module
    // doc's "No confirmation prompt" section.
    let rebuild_flags = ExportFlags {
        out: flags.out.clone(),
        skills_root: flags.skills_root.clone(),
        marketplace: flags.marketplace.clone(),
        default_plugin: flags.default_plugin.clone(),
        common: flags.common.clone(),
        json: flags.json,
        dry_run: flags.dry_run,
        yes: true,
        quiet: flags.quiet,
    };

    if !flags.quiet {
        let _ = writeln!(
            ctx.err,
            "watch: building {} once before watching for changes",
            run.vault.display()
        );
    }
    let code = run_export(ExportVerb::Build, &rebuild_flags, ctx);
    if code != EXIT_OK {
        return code;
    }
    // `Some(0)` asks for the initial build and nothing else — most useful to
    // a test that only wants to pin the initial-build behaviour without
    // arming a watcher (and blocking on an event that will never come).
    if max_rebuilds == Some(0) {
        return EXIT_OK;
    }

    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher =
        match notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let _ = tx.send(res);
        }) {
            Ok(watcher) => watcher,
            Err(err) => {
                return blocked(
                    ctx.err,
                    &format!("watch failed: could not start a filesystem watcher: {err}"),
                );
            }
        };
    for (path, mode) in watch_targets(&run) {
        if let Err(err) = watcher.watch(&path, mode) {
            return blocked(
                ctx.err,
                &format!("watch failed: could not watch {}: {err}", path.display()),
            );
        }
        if !flags.quiet {
            let _ = writeln!(
                ctx.err,
                "watch: watching {} for changes (Ctrl-C to stop)",
                path.display()
            );
        }
    }

    let mut rebuilds = 0usize;
    loop {
        // Block until the first event of a new batch, then drain whatever
        // else arrives within the debounce window so one save is one
        // rebuild rather than one per underlying OS event.
        let Ok(first) = rx.recv() else {
            // The sender lives inside the watcher's OS callback; a closed
            // channel means the watcher itself was torn down.
            return EXIT_OK;
        };
        let mut saw_event = first.is_ok();
        let deadline = Instant::now() + DEBOUNCE;
        loop {
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            match rx.recv_timeout(deadline - now) {
                Ok(next) => saw_event |= next.is_ok(),
                Err(_) => break,
            }
        }
        if !saw_event {
            continue;
        }

        let started = Instant::now();
        let code = run_export(ExportVerb::Build, &rebuild_flags, ctx);
        if code != EXIT_OK {
            // `run_export` already wrote the reason; see the module doc on
            // why a failed rebuild does not end the loop.
            let _ = writeln!(
                ctx.err,
                "watch: rebuild failed (exit {code}); still watching"
            );
        } else if !flags.quiet {
            let _ = writeln!(
                ctx.err,
                "watch: rebuilt in {}ms",
                started.elapsed().as_millis()
            );
        }

        rebuilds += 1;
        if max_rebuilds.is_some_and(|max| rebuilds >= max) {
            return EXIT_OK;
        }
    }
}

/// Every path the watcher arms, each with its recursion: the vault itself,
/// then each `assets:` and `hooks:` source resolved the way the build
/// resolves it, with the recursion rule in the module doc. A path named twice is armed once,
/// the deeper recursion winning.
fn watch_targets(run: &crate::resolve::ResolvedRun) -> Vec<(PathBuf, RecursiveMode)> {
    let mut targets: BTreeMap<PathBuf, RecursiveMode> = BTreeMap::new();
    targets.insert(run.vault.clone(), RecursiveMode::Recursive);
    let sources = run.config.as_ref().into_iter().flat_map(|c| {
        c.assets
            .iter()
            .map(|a| &a.from)
            .chain(c.hooks.iter().map(|h| &h.from))
    });
    for from in sources {
        let source = resolve_configured_path(from, &run.config_dir);
        let (path, mode) = if source.is_dir() {
            (source, RecursiveMode::Recursive)
        } else {
            match source.parent() {
                Some(parent) => (parent.to_path_buf(), RecursiveMode::NonRecursive),
                None => continue,
            }
        };
        if targets.get(&path) != Some(&RecursiveMode::Recursive) {
            targets.insert(path, mode);
        }
    }
    targets.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::resolve::CommonFlags;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::thread;

    /// The same vault the CLI/host parity test builds from
    /// (`marketplace_parity.rs`) — two marketplaces, real notes, already
    /// proven to render through `run_export`. Copied into a tempdir rather
    /// than watched in place: this suite writes into it to simulate a saved
    /// edit, and the checked-in fixture is shared with other tests.
    fn fixture_source() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/freeform-vault")
            .canonicalize()
            .unwrap()
    }

    fn copy_tree(from: &Path, to: &Path) {
        fs::create_dir_all(to).unwrap();
        for entry in fs::read_dir(from).unwrap() {
            let entry = entry.unwrap();
            let dest = to.join(entry.file_name());
            if entry.file_type().unwrap().is_dir() {
                copy_tree(&entry.path(), &dest);
            } else {
                fs::copy(entry.path(), &dest).unwrap();
            }
        }
    }

    /// A private copy of the fixture vault this test suite is free to write
    /// into.
    fn fixture_vault() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        copy_tree(&fixture_source(), dir.path());
        dir
    }

    fn flags_for(vault: &Path, out: &Path) -> ExportFlags {
        ExportFlags {
            out: Some(out.display().to_string()),
            skills_root: None,
            // The fixture holds two marketplaces (`acme`, `labs`); named
            // the same way `marketplace_parity.rs` does, or the render
            // refuses `ambiguous-marketplace`.
            marketplace: Some("acme".to_string()),
            default_plugin: Some("core".to_string()),
            common: CommonFlags {
                vault: Some(vault.display().to_string()),
                config: None,
                namespace: None,
            },
            json: false,
            dry_run: false,
            yes: false,
            quiet: true,
        }
    }

    #[test]
    fn the_initial_build_runs_before_any_event_is_seen() {
        let vault_dir = fixture_vault();
        let out_dir = tempfile::tempdir().unwrap();
        let flags = flags_for(vault_dir.path(), out_dir.path());

        let mut out: Vec<u8> = Vec::new();
        let mut err: Vec<u8> = Vec::new();
        let mut ctx = CommandContext::new(vault_dir.path(), &mut out, &mut err);
        let code = run_watch_for(&flags, &mut ctx, Some(0));
        drop(ctx);

        assert_eq!(code, EXIT_OK, "{}", String::from_utf8_lossy(&err));
        assert!(
            out_dir
                .path()
                .join(".claude-plugin/packs/core/skills/review/SKILL.md")
                .exists(),
            "the initial build did not write the rendered skill"
        );
    }

    #[test]
    fn asset_sources_are_watched_beside_the_vault() {
        use crate::config::{AssetEntry, TradecraftConfig};
        use crate::resolve::ResolvedRun;

        let root = tempfile::tempdir().unwrap();
        let vault = root.path().join("plugin");
        fs::create_dir_all(&vault).unwrap();
        fs::create_dir_all(root.path().join("conventions")).unwrap();
        fs::create_dir_all(root.path().join("cli")).unwrap();
        fs::write(root.path().join("cli/sdlc"), "launcher\n").unwrap();
        let asset = |from: &str| AssetEntry {
            from: from.to_owned(),
            to: from.to_owned(),
            plugin: None,
        };
        let run = ResolvedRun {
            config: Some(TradecraftConfig {
                assets: vec![asset("conventions"), asset("cli/sdlc")],
                ..TradecraftConfig::default()
            }),
            config_dir: root.path().to_path_buf(),
            config_path: None,
            namespace: None,
            vault: vault.clone(),
        };

        let targets = watch_targets(&run);
        assert!(targets.contains(&(vault, RecursiveMode::Recursive)));
        assert!(targets.contains(&(root.path().join("conventions"), RecursiveMode::Recursive)));
        // A file asset is watched through its parent, so an editor's
        // rename-over save is still seen.
        assert!(targets.contains(&(root.path().join("cli"), RecursiveMode::NonRecursive)));
        assert_eq!(targets.len(), 3);
    }

    #[test]
    fn a_saved_change_triggers_exactly_one_rebuild() {
        let vault_dir = fixture_vault();
        let out_dir = tempfile::tempdir().unwrap();
        let flags = flags_for(vault_dir.path(), out_dir.path());

        let mut out: Vec<u8> = Vec::new();
        let mut err: Vec<u8> = Vec::new();
        let mut ctx = CommandContext::new(vault_dir.path(), &mut out, &mut err);

        let skill_path = vault_dir
            .path()
            .join("marketplaces/acme/plugins/core/skills/review.md");
        let edited = fs::read_to_string(&skill_path)
            .unwrap()
            .replace("Reviews a diff.", "Reviews a diff, now edited.");
        // Save repeatedly until the watch returns, not once after a fixed
        // sleep: the initial build runs before the watcher arms, and on a
        // loaded host it can outlast any fixed delay — a single early save
        // would then land before anything is watching, and the loop would
        // wait forever for an event that already happened.
        let stop = Arc::new(AtomicBool::new(false));
        let saver = {
            let stop = Arc::clone(&stop);
            thread::spawn(move || {
                while !stop.load(Ordering::Relaxed) {
                    thread::sleep(Duration::from_millis(200));
                    let _ = fs::write(&skill_path, &edited);
                }
            })
        };

        let code = run_watch_for(&flags, &mut ctx, Some(1));
        stop.store(true, Ordering::Relaxed);
        saver.join().unwrap();
        drop(ctx);
        assert_eq!(code, EXIT_OK, "{}", String::from_utf8_lossy(&err));

        let rendered = fs::read_to_string(
            out_dir
                .path()
                .join(".claude-plugin/packs/core/skills/review/SKILL.md"),
        )
        .expect("the rebuilt output should carry the edited skill");
        assert!(
            rendered.contains("Reviews a diff, now edited."),
            "the rebuild did not pick up the saved change: {rendered}"
        );
    }
}
