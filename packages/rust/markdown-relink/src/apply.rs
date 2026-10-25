//! The apply pass.
//!
//! - **Plan and execute are separate calls.** [`execute`] takes `from`, `to`
//!   and a set of expected etags — never the plan's edits. It **re-plans**, and
//!   the client's `expect` set is treated as an assertion about what the user
//!   previewed rather than as instructions. A client cannot ask this function
//!   to write bytes the planner did not choose, which is a property worth
//!   having whether or not anyone would try.
//! - **Per-file CAS.** Every file carries its own etag from plan time and each
//!   write checks its own. One note changing under the plan fails that note,
//!   not the rename.
//! - **Skip and report, never abort halfway.** A file that drifted, or that the
//!   preview never showed, is skipped and named in the result. Aborting
//!   mid-set leaves the vault in exactly the half-rewritten state the abort was
//!   meant to prevent, and rolling back needs the transaction that does not
//!   exist.
//!
//! # Why the links are rewritten BEFORE the file moves
//!
//! It looks backwards — the links are made to point at a path nothing occupies
//! yet — and it is what keeps the **crash** case recoverable. Both orders leave
//! the same class of mess when the process dies mid-loop (some links right, some
//! wrong); only this one leaves the subject still at `from`, so the same rename
//! re-plans cleanly and picks up exactly the files that did not land. The
//! already-rewritten ones no longer resolve to `from` and so are not in the new
//! plan at all. Under the other order the subject is at `to`, `from` is gone,
//! and a re-run has nothing to plan against — which is the state that
//! would need a write-ahead journal, which this crate deliberately does not have.
//!
//! # What a partial application leaves, and who repairs it
//!
//! The ordinary partial application is **not** a crash, and it is worth being
//! exact about it because the ordering above says nothing to this case. A file
//! that drifted, that the preview never showed, or that could not be read is
//! skipped — and the rename then **completes**. So re-running is not the repair
//! path: `from` is gone, and a second preview of the same rename is refused with
//! "no note at `from`", which is the honest answer rather than a bug.
//!
//! What is left is one **broken link per skipped file**. Those notes still spell
//! the old path and nothing here will rewrite them, which is exactly why every
//! skip is *named* in [`RenameResult::skipped`] rather than counted: the caller
//! shows the user which notes they are, and the repair is theirs — open the
//! note, find the link (it still names the old path), and either fix it by hand
//! or rename the subject back and try again.
//!
//! # The destination is reserved, not merely checked
//!
//! The rename itself is the last thing that can fail, and the two ways it can
//! are a missing parent and an occupied destination. The parent is created
//! before the first byte is written. The destination is **claimed**: an empty
//! file created with `create_new` before the edit loop starts, held across it,
//! and renamed over at the end.
//!
//! Checking that the destination is free and then writing forty notes before
//! taking it leaves a window the whole width of the edit loop, and the vault is
//! not this process's alone — an editor may be open on it, which is the
//! concurrency the per-file CAS exists for. `fs::rename` would replace whatever
//! landed there without a word. A failed claim is a `conflict` with nothing
//! written; a claim that is never fulfilled removes its own placeholder.

use std::path::{Path, PathBuf};

use crate::error::TransformError;
use etag_write::WriteError;

use crate::facts::VaultFacts;
use crate::plan::plan;
use crate::{ByteEdit, FileEtag, RenameResult, Skip};

/// Rename `from` to `to`, rewriting every inbound link that needs it.
///
/// `subject_etag` compare-and-swaps the note being moved: a mismatch aborts
/// **everything**, because a rename of a note that is not the note the user was
/// looking at is not a rename they consented to. `expect` compare-and-swaps
/// each linking note independently: a mismatch there skips that one file.
pub fn execute(
    vault_dir: &Path,
    facts: &VaultFacts,
    from: &str,
    to: &str,
    subject_etag: Option<&str>,
    expect: &[FileEtag],
) -> Result<RenameResult, TransformError> {
    let plan = plan(vault_dir, facts, from, to)?;
    let refuse = |reason: String| RenameResult {
        conflict: Some(reason),
        ..RenameResult::default()
    };
    if let Some(reason) = plan.conflict {
        return Ok(refuse(reason));
    }

    let from = plan.from;
    let to = plan.to;
    let from_abs = markdown_vault_fs::Guard::std().resolve(vault_dir, &from)?;
    let to_abs = markdown_vault_fs::Guard::std().resolve(vault_dir, &to)?;

    // The subject's CAS, and the one check that aborts rather than skips.
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

    // Everything that can make the final `fs::rename` fail, cleared before the
    // first byte of any note is written.
    if let Some(parent) = to_abs.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| TransformError::Io(format!("creating the folder for {to}: {e}")))?;
    }

    // …and the destination CLAIMED rather than merely found free — see the
    // module docs. A case-only rename cannot use the claim and must not: on a
    // case-insensitive filesystem `Alpha.md` and `ALPHA.md` are one file, so
    // `create_new` on the destination collides with the SOURCE and would refuse
    // the one rename a user most often wants. That branch re-asks the exact-name
    // question instead, which is the same check the planner made and as narrow a
    // window as it can be closed to without a filesystem that will say whether
    // two names are one file.
    let mut reservation = if from.to_lowercase() == to.to_lowercase() {
        if crate::plan::dir_has_exact_name(vault_dir, &to) {
            return Ok(refuse(format!("{to} already exists")));
        }
        None
    } else {
        match Reservation::claim(&to_abs) {
            Ok(held) => Some(held),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                return Ok(refuse(format!(
                    "{to} was created after this rename was previewed"
                )));
            }
            Err(e) => return Err(TransformError::Io(format!("reserving {to}: {e}"))),
        }
    };

    let mut result = RenameResult {
        ok: true,
        ..RenameResult::default()
    };

    for file in &plan.files {
        if file.edits.is_empty() {
            continue;
        }
        // A file the preview never showed is a file the user never consented
        // to. It gets here when the vault changed between preview and apply —
        // somebody added a note that links to the subject — and the honest
        // answer is to say so rather than to widen the blast radius of a
        // confirmed action.
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
        // Two etags to satisfy, and they are different claims: the planner's
        // says "the edits below index these bytes", the client's says "these
        // are the bytes I showed the user". Either one moving means this file's
        // rewrite is no longer the one that was approved.
        let current = etag_write::etag(&bytes);
        if current != file.etag || current != expected.etag {
            result.skipped.push(Skip {
                path: file.path.clone(),
                reason: "drifted".to_string(),
            });
            continue;
        }
        let spliced = splice(&bytes, &file.edits);
        match etag_write::write_cas(&abs, &spliced, Some(&current)) {
            Ok(_) => result.edited.push(file.path.clone()),
            Err(WriteError::Conflict { .. } | WriteError::ExistsWithoutEtag { .. }) => {
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

    // The subject moves last, onto the name reserved for it above. A self-link
    // inside it was rewritten in the loop above (it is an ordinary entry in
    // `plan.files`), at its OLD path, so there is nothing special to do here
    // beyond the move itself.
    std::fs::rename(&from_abs, &to_abs)
        .map_err(|e| TransformError::Io(format!("renaming {from} to {to}: {e}")))?;
    // The placeholder is gone — replaced by the note. Releasing the claim
    // WITHOUT deleting anything is the whole difference between a rename that
    // worked and one that deletes its own result.
    if let Some(held) = reservation.as_mut() {
        held.fulfilled();
    }
    result.renamed = true;
    result.new_etag = etag_after_move(&to_abs);

    // Refreshing whatever caches produced `facts`, and publishing the change,
    // are the caller's — every one of them belongs to a capability, and this
    // crate deliberately does not know it is inside one.
    Ok(result)
}

/// The destination name, claimed before the first edit and given up only when
/// the rename lands on top of it.
///
/// An empty file created with `create_new` is the claim, and the create is what
/// makes it one: it is atomic at the filesystem, so two processes racing for the
/// same destination cannot both win. The `Drop` is what makes it safe to hold
/// across the edit loop — every path out of [`execute`] after the claim,
/// including a `?` on a filesystem error and an unwind, removes the placeholder
/// rather than leaving an empty note in somebody's vault.
///
/// `pub(crate)` so the crate's tests can exercise the exclusion and the cleanup
/// directly; the window it closes is inside one call and cannot be opened from
/// a test otherwise.
pub(crate) struct Reservation {
    path: PathBuf,
    held: bool,
}

impl Reservation {
    /// Take the name, or fail because somebody else has it.
    pub(crate) fn claim(path: &Path) -> std::io::Result<Reservation> {
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)?;
        Ok(Reservation {
            path: path.to_path_buf(),
            held: true,
        })
    }

    /// The rename replaced the placeholder with the real note, so there is
    /// nothing left to clean up.
    pub(crate) fn fulfilled(&mut self) {
        self.held = false;
    }
}

impl Drop for Reservation {
    fn drop(&mut self) {
        if self.held {
            // Best effort by construction: this runs on the way out of a call
            // that is already failing, and a placeholder that cannot be removed
            // is a strictly smaller problem than the one being reported.
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

/// The etag of a note that has just moved, or empty when it cannot be read.
///
/// The move has already happened, so a failed read is not this call's error.
/// An empty etag matches nothing, so the next guarded write is refused until
/// the caller re-reads.
pub(crate) fn etag_after_move(path: &Path) -> String {
    etag_write::etag_of_file(path)
        .ok()
        .flatten()
        .unwrap_or_default()
}

/// Apply edits to bytes, **bottom-up**.
///
/// Descending order is what lets every offset in the plan be an offset into the
/// original file: splicing top-down would shift every subsequent one by the
/// length delta of the edit before it, and a planner that had to predict that
/// would be computing its own output as input.
///
/// Shared by [`crate::bundle`] and by callers that apply a
/// [`crate::plan::plan_redirect`] plan themselves.
///
/// ```
/// use markdown_relink::{ByteEdit, splice};
///
/// let edits = [ByteEdit {
///     offset: 6,
///     delete_count: 5,
///     insert: "Beta".to_string(),
///     old_text: "Alpha".to_string(),
///     line: 1,
/// }];
/// assert_eq!(splice(b"See [[Alpha]].", &edits), b"See [[Beta]].");
/// ```
pub fn splice(bytes: &[u8], edits: &[ByteEdit]) -> Vec<u8> {
    let mut out = bytes.to_vec();
    for edit in edits.iter().rev() {
        let end = edit.offset + edit.delete_count;
        if end > out.len() {
            // Unreachable behind the CAS above; skipping beats panicking on a
            // vault the user cannot then repair.
            continue;
        }
        out.splice(edit.offset..end, edit.insert.bytes());
    }
    out
}
