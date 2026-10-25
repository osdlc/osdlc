//! Bundle-aware rename: a component folder, moved as one unit.
//!
//! A bundle is a directory shaped `<name>/<name>.md` — the **entry note** —
//! plus whatever peer files live beside it (`review/scripts/run.sh`,
//! `review/diagram.png`, a second doc). [`plan_bundle`]/[`execute_bundle`]
//! rename or move the whole directory in one step: the entry note, every
//! peer, and every inbound link to any of them (a wikilink to the entry note,
//! an embed of a peer image, a markdown link to a peer script).
//!
//! # Same rewrite machinery, a bigger `PathMap`
//!
//! [`plan::plan`]'s algorithm is "build a `PathMap`, build the corpus as it
//! will be once the map is applied, find every link that resolves into the
//! map, re-express it". Nothing about that is one-entry-specific — the type
//! says so in its own docs — so a bundle rename is the SAME algorithm run
//! against a map with one entry per file under the bundle's directory,
//! rather than a second implementation that has to be kept in step with the
//! first. [`bundle_entry`]'s structural refusals and the peer enumeration in
//! [`bundle_members`] are what is actually new; the per-link decision
//! (unchanged / rewrite / qualify) is
//! `rewrite::plan_link`, reused unchanged.
//!
//! # Why the entry note's own diagnostics, not every peer's
//!
//! [`plan::plan`]'s `pre_broken_link`/`frontmatter_link_untouched`
//! diagnostics ask "does some link's text spell THIS note's name without
//! resolving to it" — a question that means something for a markdown note
//! addressed by name, and not much for `scripts/run.sh`, which nothing
//! bare-names. So those two diagnostics run once, for the entry note, exactly
//! as they would for a single-file rename. Every file in the bundle still
//! gets its inbound links rewritten — that scan runs over the whole map — the
//! narrower diagnostics are the only piece kept singular.
//!
//! # Apply order
//!
//! Same principle [`crate::apply::execute`]'s docs argue for the single-file case,
//! extended by one step:
//!
//! 1. **Rewrite every linking note first**, including a peer note inside the
//!    bundle that links to another member of it — at their CURRENT paths, so
//!    a crash here leaves the bundle still at `from`'s directory and a re-plan
//!    picks up exactly what did not land.
//! 2. **One `fs::rename` on the whole directory.** Atomic at the filesystem:
//!    either every member moves or none does. This is what makes the peers
//!    need no CAS of their own — they never move independently.
//! 3. **The entry file's own rename inside the now-moved directory**, only
//!    when its leaf name changes (`review.md` → `code-review.md`; skipped
//!    when a bundle keeps its name and only its parent moves).
//!
//! Step 3 is the one step after the atomic step, and therefore the one that
//! can fail on its own: see [`execute_bundle`]'s docs for what is left behind
//! when it does, and why nothing rolls the directory move back.

use std::path::Path;

use crate::error::TransformError;
use markdown_link::body_links_spanned;

use crate::facts::VaultFacts;
use crate::plan::{self, Corpus, PathMap};
use crate::rewrite::{self, LinkOutcome};
use crate::{BundlePeer, ByteEdit, Diagnostic, DiagnosticCode, FileEdits, FileEtag};
use crate::{RenamePlan, RenameResult, Skip};

/// Whether `path` is a bundle's entry note: `<dir>/<name>.md`, where the
/// directory's own (last-segment) name equals the file's stem — the
/// `<name>/<name>.md` convention. `None` when it is not: no parent directory,
/// not markdown, or the two names disagree. `pub` because
/// a bundle delete in a host application asks the same question, and the
/// predicate has to be the one this module enforces or the two ops could
/// disagree about what counts as a bundle.
///
/// Segments ABOVE the immediate parent are irrelevant — `components/
/// code-review/code-review.md` is a bundle entry exactly as `code-review/
/// code-review.md` is, which is what lets a bundle move to a different
/// parent while keeping its own name.
///
/// ```
/// use markdown_relink::bundle::bundle_entry;
///
/// assert_eq!(
///     bundle_entry("components/review/review.md"),
///     Some(("components/review", "review.md")),
/// );
/// assert_eq!(bundle_entry("components/review/notes.md"), None);
/// assert_eq!(bundle_entry("review.md"), None);
/// ```
pub fn bundle_entry(path: &str) -> Option<(&str, &str)> {
    if !plan::is_note(path) {
        return None;
    }
    let (dir, file) = path.rsplit_once('/')?;
    let stem = &file[..file.len() - 3];
    let dir_name = dir.rsplit('/').next().unwrap_or(dir);
    (dir_name == stem).then_some((dir, file))
}

/// Every file under `dir` (vault-relative), notes and attachments alike —
/// what a bundle's directory rename or delete moves as one unit. Includes the
/// entry note itself; callers that want peers only filter it out.
///
/// ```
/// use markdown_relink::bundle::bundle_members;
///
/// let vault = tempfile::tempdir().unwrap();
/// std::fs::create_dir_all(vault.path().join("review/scripts")).unwrap();
/// std::fs::write(vault.path().join("review/review.md"), "# Review\n").unwrap();
/// std::fs::write(vault.path().join("review/scripts/run.sh"), "x\n").unwrap();
///
/// let mut members = bundle_members(vault.path(), "review");
/// members.sort();
/// assert_eq!(members, ["review/review.md", "review/scripts/run.sh"]);
/// ```
pub fn bundle_members(vault_dir: &Path, dir: &str) -> Vec<String> {
    let opts = markdown_vault_fs::walk::WalkOptions {
        roots: vec![dir.to_string()],
        ..markdown_vault_fs::walk::WalkOptions::notes_and_attachments()
    };
    markdown_vault_fs::walk::walk(vault_dir, &opts)
        .into_iter()
        .map(|e| e.rel)
        .collect()
}

/// Compute the rewrite set for moving the bundle at `from` to `to`. Writes
/// nothing — the bundle counterpart of [`plan::plan`].
///
/// `from` names the bundle's entry note (`review/review.md`), never the
/// directory — the directory is implied by it, the same way a single-file
/// rename names a file and not its parent.
pub fn plan_bundle(
    vault_dir: &Path,
    facts: &VaultFacts,
    from: &str,
    to: &str,
) -> Result<RenamePlan, TransformError> {
    let from = markdown_vault_fs::path::lexical::validate_relative(from)?;
    let to = markdown_vault_fs::path::lexical::validate_relative(to)?;
    let from_abs = markdown_vault_fs::Guard::std().resolve(vault_dir, &from)?;

    let refuse = |reason: String| {
        Ok(RenamePlan {
            from: from.clone(),
            to: to.clone(),
            conflict: Some(reason),
            ..RenamePlan::default()
        })
    };

    // Every refusal a single-file rename names — same path, `_system/`, a
    // hidden directory, not markdown, source missing — applies to the entry
    // note exactly as it does to any other file.
    if let Some(reason) = plan::refusal(&from, &to, &from_abs) {
        return refuse(reason);
    }

    let Some((from_dir, _)) = bundle_entry(&from) else {
        return refuse(format!(
            "{from} is not a bundle entry note (<dir>/<dir>.md)"
        ));
    };
    let Some((to_dir, _)) = bundle_entry(&to) else {
        return refuse(format!(
            "{to}'s folder name must match its file name (<dir>/<dir>.md)"
        ));
    };

    let to_dir_abs = markdown_vault_fs::Guard::std().resolve(vault_dir, to_dir)?;
    if to_dir_abs.exists() {
        return refuse(format!("{to_dir} already exists"));
    }

    // The directory move's own path map: the entry note plus every peer,
    // each mapped to the same position under the new directory.
    let members = bundle_members(vault_dir, from_dir);
    let prefix = format!("{from_dir}/");
    let mut pairs: Vec<(String, String)> = Vec::with_capacity(members.len());
    let mut peers: Vec<BundlePeer> = Vec::new();
    for member in &members {
        if *member == from {
            pairs.push((from.clone(), to.clone()));
            continue;
        }
        let Some(rest) = member.strip_prefix(&prefix) else {
            continue;
        };
        let dest = format!("{to_dir}/{rest}");
        pairs.push((member.clone(), dest.clone()));
        peers.push(BundlePeer {
            from: member.clone(),
            to: dest,
        });
    }
    let map = PathMap::from_pairs(pairs);

    let pre = Corpus::build(&facts.paths);
    let post = Corpus::build(&map.apply(&facts.paths));

    let mut diagnostics: Vec<Diagnostic> = Vec::new();

    // The name-spelling diagnostics, for the entry note only — see the module
    // docs on why a peer is not asked the same question.
    let subject_stem = markdown_link::normalize_target(&plan::key_path(&from));
    let subject_base = subject_stem
        .rsplit('/')
        .next()
        .unwrap_or(&subject_stem)
        .to_string();
    for (path, links) in facts.links.iter() {
        for link in links.iter() {
            let hit = pre.resolve_lenient(&link.target, path);
            if hit.as_deref() == Some(from.as_str()) {
                continue;
            }
            let key = markdown_link::normalize_target(&link.target);
            if key.rsplit('/').next() != Some(subject_base.as_str()) {
                continue;
            }
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::PreBrokenLink,
                note_path: path.clone(),
                detail: match hit {
                    Some(other) => format!(
                        "`{}` spells this note's name but already resolves to {other} — \
                         left untouched",
                        link.raw
                    ),
                    None => format!(
                        "`{}` spells this note's name and resolves to nothing — left untouched",
                        link.raw
                    ),
                },
            });
        }
    }
    for (path, refs) in facts.frontmatter.iter() {
        for reference in refs.iter() {
            if pre.resolve_lenient(&reference.target, path).as_deref() == Some(from.as_str()) {
                diagnostics.push(Diagnostic {
                    code: DiagnosticCode::FrontmatterLinkUntouched,
                    note_path: path.clone(),
                    detail: format!(
                        "frontmatter `{}` names this note; frontmatter is not rewritten",
                        reference.field.as_deref().unwrap_or("(value)")
                    ),
                });
            }
        }
    }

    let files_scanned = facts.notes_scanned();

    // A candidate links to ANY member of the bundle — the entry note or a
    // peer.
    let candidates: Vec<&String> = facts
        .links
        .iter()
        .filter(|(path, links)| {
            links.iter().any(|l| {
                pre.resolve_lenient(&l.target, path)
                    .is_some_and(|hit| map.get(&hit).is_some())
            })
        })
        .map(|(path, _)| path)
        .collect();

    let mut files: Vec<FileEdits> = Vec::new();
    let mut expect: Vec<FileEtag> = Vec::new();

    for note_path in candidates {
        let note_path = note_path.clone();
        let abs = markdown_vault_fs::Guard::std().resolve(vault_dir, &note_path)?;
        let Ok(bytes) = std::fs::read(&abs) else {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::UnreadableCandidate,
                note_path: note_path.clone(),
                detail: "links into this bundle but could not be read, so it is not in this \
                         plan and its links are left as they are"
                    .to_string(),
            });
            continue;
        };
        let etag = etag_write::etag(&bytes);
        let Ok(content) = std::str::from_utf8(&bytes) else {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::InvalidUtf8Candidate,
                note_path: note_path.clone(),
                detail: "links into this bundle but is not valid UTF-8, so its byte offsets \
                         cannot be trusted — left untouched"
                    .to_string(),
            });
            continue;
        };
        let split = frontmatter_lossless::split(content);
        let body = split.body;
        let body_start = split.body_start;

        let mut edits: Vec<ByteEdit> = Vec::new();
        for link in body_links_spanned(body) {
            let Some(hit) = pre.resolve_lenient(&link.target, &note_path) else {
                continue;
            };
            let Some(dest) = map.get(&hit) else {
                continue;
            };
            if map.get(&note_path).is_some() {
                diagnostics.push(Diagnostic {
                    code: DiagnosticCode::SelfLink,
                    note_path: note_path.clone(),
                    detail: format!("`{}` points within this bundle", link.raw),
                });
            }
            let Some(span) = rewrite::target_span(body, &link) else {
                diagnostics.push(Diagnostic {
                    code: DiagnosticCode::UnmappableLinkSpan,
                    note_path: note_path.clone(),
                    detail: format!("could not locate the target inside `{}`", link.raw),
                });
                continue;
            };
            let current = &body[span.clone()];
            match rewrite::plan_link(&post, dest, &link, current) {
                LinkOutcome::Unchanged => {}
                LinkOutcome::Rewrite { text, qualified } => {
                    if qualified {
                        diagnostics.push(Diagnostic {
                            code: DiagnosticCode::AmbiguousLink,
                            note_path: note_path.clone(),
                            detail: format!(
                                "`{current}` would be ambiguous after the move; qualified to `{text}`"
                            ),
                        });
                    }
                    let offset = body_start + span.start;
                    edits.push(ByteEdit {
                        offset,
                        delete_count: span.len(),
                        insert: text,
                        old_text: current.to_string(),
                        line: plan::line_of(content, offset),
                    });
                }
            }
        }

        edits.sort_by_key(|e| e.offset);
        expect.push(FileEtag {
            path: note_path.clone(),
            etag: etag.clone(),
        });
        files.push(FileEdits {
            path: note_path,
            etag,
            edits,
        });
    }

    // The entry note is always in the CAS set, edits or none — same rule as a
    // single-file rename's subject.
    if !expect.iter().any(|e| e.path == from) {
        expect.push(FileEtag {
            path: from.clone(),
            etag: etag_write::etag_of_file(&from_abs)
                .map_err(|e| TransformError::Io(format!("reading {from}: {}", e.source)))?
                .unwrap_or_default(),
        });
    }
    expect.sort_by(|a, b| a.path.cmp(&b.path));
    diagnostics.sort_by(|a, b| {
        a.note_path
            .cmp(&b.note_path)
            .then_with(|| a.code.as_str().cmp(b.code.as_str()))
            .then_with(|| a.detail.cmp(&b.detail))
    });
    peers.sort_by(|a, b| a.from.cmp(&b.from));

    Ok(RenamePlan {
        from,
        to,
        conflict: None,
        files,
        diagnostics,
        files_scanned,
        expect,
        peers,
    })
}

/// Move the bundle: rewrite every inbound link, then move the directory, then
/// the entry file's own leaf name inside it.
///
/// Re-plans server-side exactly as [`crate::apply::execute`] does — `expect` is an
/// assertion about which bytes the user previewed, never instructions.
///
/// # What a failed entry-file rename leaves
///
/// The directory move (step 2 of the module docs' ordering) is one
/// `fs::rename` and therefore all-or-nothing: either the whole bundle is at
/// `to`'s directory or none of it moved. The entry file's own rename (step 3)
/// is a second, independent filesystem call, so it is the one step that can
/// fail **after** the bundle has already relocated. When it does, this
/// reports it in [`RenameResult::skipped`] with the reason
/// `entry_rename_failed`, and the filesystem error in
/// [`RenameResult::conflict`], rather than moving the directory
/// back — there is no journal to roll back with, and undoing
/// the directory move would risk losing whatever else changed inside it in
/// the meantime. What is left is the bundle sitting at its new directory with
/// its entry note still under its OLD leaf name; [`RenameResult::new_etag`]
/// names that file so a caller can find and re-rename it.
pub fn execute_bundle(
    vault_dir: &Path,
    facts: &VaultFacts,
    from: &str,
    to: &str,
    subject_etag: Option<&str>,
    expect: &[FileEtag],
) -> Result<RenameResult, TransformError> {
    let plan = plan_bundle(vault_dir, facts, from, to)?;
    let refuse = |reason: String| RenameResult {
        conflict: Some(reason),
        ..RenameResult::default()
    };
    if let Some(reason) = plan.conflict {
        return Ok(refuse(reason));
    }

    let from = plan.from;
    let to = plan.to;
    let to_abs = markdown_vault_fs::Guard::std().resolve(vault_dir, &to)?;
    let (from_dir, _) = bundle_entry(&from).expect("plan_bundle validated the entry shape");
    let (to_dir, _) = bundle_entry(&to).expect("plan_bundle validated the entry shape");
    let from_dir_abs = markdown_vault_fs::Guard::std().resolve(vault_dir, from_dir)?;
    let to_dir_abs = markdown_vault_fs::Guard::std().resolve(vault_dir, to_dir)?;

    // The entry note's CAS — identical contract to the single-file path: a
    // mismatch aborts everything, nothing written.
    let on_disk = plan
        .expect
        .iter()
        .find(|e| e.path == from)
        .map(|e| e.etag.clone())
        .unwrap_or_default();
    let expected_subject = subject_etag.or_else(|| {
        expect
            .iter()
            .find(|e| e.path == from)
            .map(|e| e.etag.as_str())
    });
    if let Some(expected) = expected_subject
        && expected != on_disk
    {
        return Ok(refuse(format!(
            "{from} changed on disk since it was previewed"
        )));
    }

    // Everything that can make the directory rename fail, cleared first.
    if let Some(parent) = to_dir_abs.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| TransformError::Io(format!("creating the folder for {to_dir}: {e}")))?;
    }
    // Re-checked rather than reserved: unlike the single-file path's
    // `Reservation`, there is no cheap atomic "claim a directory name" this
    // crate uses today, so the window between this check and the rename below
    // is a known, narrower-than-it-was gap rather than a closed one.
    if to_dir_abs.exists() {
        return Ok(refuse(format!(
            "{to_dir} was created after this rename was previewed"
        )));
    }

    let mut result = RenameResult {
        ok: true,
        ..RenameResult::default()
    };

    // Rewrite every linking note first — including a peer note inside the
    // bundle that links to another member of it — at their CURRENT paths, so
    // a crash here leaves the bundle still at `from_dir` and a re-plan picks
    // up exactly what did not land. Same loop, same CAS, same skip-and-report
    // discipline as `apply::execute`.
    for file in &plan.files {
        if file.edits.is_empty() {
            continue;
        }
        let Some(expected) = expect.iter().find(|e| e.path == file.path) else {
            result.skipped.push(Skip {
                path: file.path.clone(),
                reason: "not_previewed".to_string(),
            });
            continue;
        };
        let abs = markdown_vault_fs::Guard::std().resolve(vault_dir, &file.path)?;
        let Ok(bytes) = std::fs::read(&abs) else {
            result.skipped.push(Skip {
                path: file.path.clone(),
                reason: "unreadable".to_string(),
            });
            continue;
        };
        let current = etag_write::etag(&bytes);
        if current != file.etag || current != expected.etag {
            result.skipped.push(Skip {
                path: file.path.clone(),
                reason: "drifted".to_string(),
            });
            continue;
        }
        let spliced = crate::apply::splice(&bytes, &file.edits);
        match etag_write::write_cas(&abs, &spliced, Some(&current)) {
            Ok(_) => result.edited.push(file.path.clone()),
            Err(
                etag_write::WriteError::Conflict { .. }
                | etag_write::WriteError::ExistsWithoutEtag { .. },
            ) => {
                result.skipped.push(Skip {
                    path: file.path.clone(),
                    reason: "drifted".to_string(),
                });
            }
            Err(_) => result.skipped.push(Skip {
                path: file.path.clone(),
                reason: "write_failed".to_string(),
            }),
        }
    }

    // ONE `fs::rename` on the whole directory — atomic, carries the entry
    // note and every peer together.
    std::fs::rename(&from_dir_abs, &to_dir_abs)
        .map_err(|e| TransformError::Io(format!("moving {from_dir} to {to_dir}: {e}")))?;
    result.peers_moved = plan.peers;

    // The entry file's own leaf name, inside the now-moved directory — which
    // may already be `to`'s leaf name (a bundle kept its own name and only
    // its parent moved), in which case there is nothing left to do.
    let from_leaf = from.rsplit('/').next().unwrap_or(from.as_str());
    let moved_entry_abs = to_dir_abs.join(from_leaf);
    if moved_entry_abs != to_abs
        && let Err(e) = std::fs::rename(&moved_entry_abs, &to_abs)
    {
        // See this function's docs: no rollback of the directory move.
        result.skipped.push(Skip {
            path: from,
            reason: "entry_rename_failed".to_string(),
        });
        result.conflict = Some(format!(
            "entry file rename failed after the directory moved: {e}"
        ));
        result.new_etag = crate::apply::etag_after_move(&moved_entry_abs);
        return Ok(result);
    }

    result.renamed = true;
    result.new_etag = crate::apply::etag_after_move(&to_abs);
    Ok(result)
}
