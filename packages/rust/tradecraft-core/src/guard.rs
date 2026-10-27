//! The safety rails — what keeps self-hosting from eating its own sources.
//!
//! This repo's live skill trees (a plugin's `skills/`, the repo-root
//! `.claude/skills/`) are load-bearing: the plugin manifest serves them,
//! commit hooks and quality gates read them by hardcoded path, and their
//! `tests/` directories import project code by relative path. Publishing
//! into one would destroy files the projection universe cannot regenerate
//! (in one real plugin tree, most files were test scaffolding that the
//! model deliberately excludes).
//!
//! Three rules, all enforced here and re-checked at publish time — a guard
//! that only runs at registration can be raced by a later adoption:
//!
//! 1. A destination may not be, contain, or be contained by a protected
//!    source tree.
//! 2. A destination whose computed runtime skill dirs already hold content
//!    must be explicitly acknowledged as partially managed.
//! 3. The publish writer never deletes outside its manifest (enforced by
//!    [`crate::publish`]'s orphan sweep).
//!
//! And one more, about a single file rather than a whole destination:
//! [`resolve_write_path`] refuses a path that would land outside the
//! destination root. It is the only sanctioned way to turn a projected file's
//! relative path into somewhere to write.
//!
//! # Why that check lives here rather than in the renderer
//!
//! `agent_adapt::paths::join_within` states the lexical rule, and this module
//! applies it — but a lexical check walks straight past a symlinked alias.
//! `dest/.claude` is inside `dest/` by every rule a string can state, and
//! outside it on disk the moment it is a link. The renderer cannot see that: it
//! is pure, and emits paths relative to an anchor supplied later, so there is
//! nothing on disk for it to resolve. This layer holds a real destination root,
//! so it can canonicalise both sides and believe the filesystem instead of the
//! strings.

use std::cell::RefCell;
use std::io;
use std::path::{Path, PathBuf};

use path_guard::{Guard, Resolver};

use crate::error::CoreError;
use crate::vfs::Vfs;

/// A [`Vfs`] as `path-guard`'s [`Resolver`], so every containment check reads
/// the filesystem the publish writes to.
///
/// A host on the lexical [`Vfs::canonicalize`] default resolves every path,
/// existing or not, so its checks reduce to the lexical rule.
///
/// `path-guard` reads any error as "missing" or "not a link". Only some
/// errors mean that, so the rest are kept in `failure`, and [`within`] turns
/// them into a refusal instead of an answer.
struct VfsResolver<'a> {
    vfs: &'a dyn Vfs,
    failure: RefCell<Option<CoreError>>,
}

impl VfsResolver<'_> {
    /// Passes `err` on to `path-guard` when its kind is one of `expected`,
    /// and otherwise keeps the first such error as the check's failure.
    fn classify(&self, p: &Path, err: CoreError, expected: &[io::ErrorKind]) -> io::Error {
        if let CoreError::Io { source, .. } = &err
            && expected.contains(&source.kind())
        {
            return io::Error::new(source.kind(), err.to_string());
        }
        let message = err.to_string();
        self.failure.borrow_mut().get_or_insert_with(|| {
            CoreError::refused(
                "unsafe-path",
                format!(
                    "{}: cannot tell where this path leads — {message}. Nothing was written",
                    p.display()
                ),
            )
        });
        io::Error::other(message)
    }
}

impl Resolver for VfsResolver<'_> {
    fn canonicalize(&self, p: &Path) -> io::Result<PathBuf> {
        self.vfs.canonicalize(p).map_err(|e| {
            // A missing path, or one with a file where a directory should be.
            self.classify(
                p,
                e,
                &[io::ErrorKind::NotFound, io::ErrorKind::NotADirectory],
            )
        })
    }

    fn read_link(&self, p: &Path) -> io::Result<PathBuf> {
        self.vfs.read_link(p).map_err(|e| {
            // Missing, or there but not a link (`EINVAL`), or a host with no links.
            self.classify(
                p,
                e,
                &[
                    io::ErrorKind::NotFound,
                    io::ErrorKind::NotADirectory,
                    io::ErrorKind::InvalidInput,
                    io::ErrorKind::Unsupported,
                ],
            )
        })
    }
}

/// Is `inner` the same directory as `outer`, or beneath it, once both are
/// resolved through `vfs`? Paths need not exist: `path-guard` resolves the
/// part that does and follows a dangling symlink to where its target lands.
/// `false` when either side passes through more than
/// `path_guard::MAX_LINK_HOPS` symlinks.
///
/// # Errors
///
/// `refused: unsafe-path` when the host fails to resolve a path for any
/// reason other than its being missing or not a link — a permission error, a
/// loop, a host that answered with nothing usable — and when either path is
/// empty or relative. The check fails closed: neither `true` nor `false`
/// would be safe for every caller.
pub(crate) fn within(vfs: &dyn Vfs, outer: &Path, inner: &Path) -> Result<bool, CoreError> {
    let resolver = VfsResolver {
        vfs,
        failure: RefCell::new(None),
    };
    let answer = Guard::new(&resolver).contains(outer, inner);
    if let Some(failure) = resolver.failure.into_inner() {
        return Err(failure);
    }
    answer.map_err(|err| {
        CoreError::refused(
            "unsafe-path",
            format!(
                "cannot compare {} with {}: {err}. Nothing was written",
                inner.display(),
                outer.display()
            ),
        )
    })
}

/// Refuses `candidate` as a destination root if it is equal to, inside, or
/// an ancestor of any protected tree.
///
/// `refused: unsafe-root`, the token the publish spec gives a
/// destination whose write paths overlap a tree that must not be written to.
///
/// Ancestor refusal is what makes registering a repo ROOT impossible while
/// any tree inside it is protected — the publish paths would be computed
/// under the repo, and one of them could be the protected tree itself.
///
/// Both sides are compared after `within` resolves them, so a symlinked
/// spelling of a protected tree is that tree. Paths that do not exist yet are
/// vetted too.
pub fn assert_destination_allowed(
    vfs: &dyn Vfs,
    candidate: &Path,
    protected: &[PathBuf],
) -> Result<(), CoreError> {
    for tree in protected {
        let why = match (within(vfs, tree, candidate)?, within(vfs, candidate, tree)?) {
            (true, true) => format!(
                "destination {} is a protected source tree",
                candidate.display()
            ),
            (true, false) => format!(
                "destination {} is inside protected source tree {}",
                candidate.display(),
                tree.display()
            ),
            (false, true) => format!(
                "destination {} contains protected source tree {}",
                candidate.display(),
                tree.display()
            ),
            (false, false) => continue,
        };
        return Err(CoreError::refused("unsafe-root", why));
    }
    Ok(())
}

/// Refuses `candidate` as a destination root when publishing there could
/// touch the vault — the narrowed rail for a request that names its vault.
///
/// `refused: unsafe-root`, the same token the wider ancestor refusal carries.
///
/// [`assert_destination_allowed`] refuses every ancestor of a protected tree,
/// because from a destination root alone an ancestor *could* compute a write
/// path into the tree. With the vault root and the projected paths both in
/// hand that "could" is answerable, and the write-guard spec say to
/// answer it: the vault itself and anything inside it stay refused, and an
/// ancestor — `~`, a project directory the vault lives under — is refused
/// only when one of the writes it implies would actually land inside the
/// vault. That is what lets a vault at `~/notes` publish to `~`: the writes
/// land under `~/.claude/skills/`, disjoint from the vault.
///
/// Every comparison here is **physical**, not lexical: both roots and every
/// projected write path are resolved by `within` first. The write
/// path is the one that must not be trusted as spelled — `~/.claude` may be
/// a link into the vault, and on a case-insensitive filesystem `.claude`
/// and a vault spelled `.Claude` are one directory — and this is the only
/// rail positioned to see that: [`resolve_write_path`]'s canonical re-check
/// bounds each write to the *destination*, and when the destination is an
/// ancestor of the vault, the vault is inside that boundary. Callers must
/// only take this narrowed rail on a host whose [`Vfs::sees_links`] is
/// honest about resolution — anywhere else the wider ancestor refusal is
/// the answer, because a link the host cannot see is exactly what this
/// check would miss.
pub fn assert_destination_allowed_for_vault<'a>(
    vfs: &dyn Vfs,
    candidate: &Path,
    vault_root: &Path,
    relative_paths: impl IntoIterator<Item = &'a str>,
) -> Result<(), CoreError> {
    if within(vfs, vault_root, candidate)? {
        let why = if within(vfs, candidate, vault_root)? {
            format!("destination {} is the vault itself", candidate.display())
        } else {
            format!(
                "destination {} is inside the vault {}",
                candidate.display(),
                vault_root.display()
            )
        };
        return Err(CoreError::refused("unsafe-root", why));
    }
    for relative in relative_paths {
        if within(vfs, vault_root, &candidate.join(relative))? {
            return Err(CoreError::refused(
                "unsafe-root",
                format!(
                    "publishing to {} would write {} inside the vault {}",
                    candidate.display(),
                    relative,
                    vault_root.display()
                ),
            ));
        }
    }
    Ok(())
}

/// Turns one projected file's destination-root-relative path into the path a
/// publish may write, or refuses it.
///
/// Two checks, and the second is the one no other layer can perform:
///
/// 1. **The lexical rule**, delegated to `agent_adapt::paths::join_within` —
///    non-empty, not absolute or rooted, no drive or UNC prefix on any
///    platform, no `.`, `..`, or empty segment, and it must extend the root by
///    at least one component. Shared with the renderer rather than restated,
///    so the two layers cannot drift into disagreeing about what is safe.
/// 2. **The canonical rule.** The root and the target are both resolved by
///    `within`, and the target has to be strictly inside the root
///    afterwards. This is what catches a parent that is a symlink out of the
///    tree.
///
/// The path returned is the lexical join, not the resolved form: a link that
/// stays inside the root is an alias the user set up on purpose, and writing
/// through it is what they asked for. The resolution decides *whether* to
/// write, not *where*.
///
/// # What resolution cannot see
///
/// A dangling symlink is checked by where its target would land, through
/// [`Vfs::read_link`]. A host that cannot resolve links at all (the wasm
/// bridge over a host object without link methods) gets check 1 and a
/// lexical check 2 — weaker than a native publish.
/// That is a property of the filesystem underneath, not of this function.
///
/// # Errors
///
/// `refused: unsafe-path`, naming the path exactly as it was supplied and the
/// root it would have escaped. [`CoreError::Refused`] rather than
/// [`CoreError::Projection`] on purpose: hosts classify a refusal as denied and
/// a projection failure as an error, so a path escape reported as the latter is
/// one nobody ever notices.
pub fn resolve_write_path(
    vfs: &dyn Vfs,
    destination_root: &Path,
    relative: &str,
) -> Result<PathBuf, CoreError> {
    let joined = agent_adapt::paths::join_within(destination_root, relative).map_err(|e| {
        let why = match &e {
            agent_adapt::Error::UnsafePath { reason, .. } => (*reason).to_owned(),
            other => other.to_string(),
        };
        unsafe_path(destination_root, relative, &why)
    })?;

    if !within(vfs, destination_root, &joined)? || within(vfs, &joined, destination_root)? {
        return Err(unsafe_path(
            destination_root,
            relative,
            "it resolves outside the root once symlinks are followed",
        ));
    }
    Ok(joined)
}

/// The refusal, in the one shape both halves of the check produce.
fn unsafe_path(destination_root: &Path, relative: &str, why: &str) -> CoreError {
    CoreError::refused(
        "unsafe-path",
        format!(
            "{}: `{relative}` — {why}. Nothing was written",
            destination_root.display()
        ),
    )
}

/// The would-be skill directories under `destination_root` for each target,
/// via agent-adapt's path conventions — the same source of truth projection
/// renders through, so the probe and the writer can never disagree.
///
/// Target names are runtime names (after `runtime_target_for` in `publish.rs` has folded
/// the short spellings); they go through `crate::projection::parse_runtime_target`, and a
/// target whose runtime renders no skills is refused with the message
/// projection gives for it, rather than probing a directory nothing writes to.
pub fn computed_skill_dirs(
    destination_root: &Path,
    targets: &[String],
) -> Result<Vec<PathBuf>, CoreError> {
    use agent_adapt::runtime::Scope;
    let mut dirs = Vec::new();
    for target in targets {
        let id = crate::projection::parse_runtime_target(target)?;
        if agent_adapt::runtimes::skill_renderer_for(id).is_none() {
            return Err(CoreError::Projection(format!(
                "{target}: runtime renders no skills"
            )));
        }
        let runtime = agent_adapt::runtimes::for_id(id)
            .ok_or_else(|| CoreError::Projection(format!("no runtime for target {target}")))?;
        dirs.push(
            runtime
                .paths()
                .skills_dir_for(destination_root, Scope::Project),
        );
    }
    dirs.sort();
    dirs.dedup();
    Ok(dirs)
}

/// The coverage probe: which computed skill dirs under `destination_root`
/// already contain entries.
///
/// Non-empty means the directory has history this store did not write — a
/// hand-installed skill set, another tool's exports, or a source tree that
/// was never adopted. Registration refuses unless the operator acknowledges
/// partial management. Granularity is directory-nonempty by design: at
/// registration no skills are linked yet, so per-file regenerability has
/// nothing to compare against.
///
/// **Early, not dead.** No caller in this workspace reaches it yet. The caller
/// it waits on is destination registration, which waits on `init` — the verb
/// that writes configuration and exits `not implemented`. The publish spec names promotion as exactly the case this
/// exists for, because promoting a scan location to a destination creates a
/// destination that already has content.
pub fn probe_existing_content(
    vfs: &dyn Vfs,
    destination_root: &Path,
    targets: &[String],
) -> Result<Vec<PathBuf>, CoreError> {
    let mut occupied = Vec::new();
    for dir in computed_skill_dirs(destination_root, targets)? {
        // A directory that cannot be listed is not occupied: an absent
        // destination is the ordinary case, and refusing registration over an
        // unreadable one would refuse the common path.
        let has_entries = vfs.read_dir(&dir).map(|e| !e.is_empty()).unwrap_or(false);
        if has_entries {
            occupied.push(dir);
        }
    }
    Ok(occupied)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn protected() -> Vec<PathBuf> {
        vec![
            PathBuf::from("/repo/repo/tools/skills"),
            PathBuf::from("/repo/.claude/skills"),
        ]
    }

    #[test]
    fn equal_to_a_protected_tree_is_refused() {
        let err = assert_destination_allowed(
            &crate::vfs::MemVfs::new(),
            Path::new("/repo/repo/tools/skills"),
            &protected(),
        );
        assert!(matches!(err, Err(CoreError::Refused(_))));
    }

    #[test]
    fn inside_a_protected_tree_is_refused() {
        let err = assert_destination_allowed(
            &crate::vfs::MemVfs::new(),
            Path::new("/repo/repo/tools/skills/task-work"),
            &protected(),
        );
        assert!(matches!(err, Err(CoreError::Refused(_))));
    }

    #[test]
    fn containing_a_protected_tree_is_refused() {
        // The repo root contains .claude/skills — registering it would put
        // protected paths inside the publish universe.
        let err = assert_destination_allowed(
            &crate::vfs::MemVfs::new(),
            Path::new("/repo"),
            &protected(),
        );
        assert!(matches!(err, Err(CoreError::Refused(_))));
    }

    /// Every refusal either rail can raise leads with `unsafe-root`, the token
    /// the publish spec gives a destination overlapping a tree we
    /// must not write to. A rail that answered in prose alone would reach a
    /// report as a sentence no script can match.
    #[test]
    fn every_rail_refusal_leads_with_the_unsafe_root_token() {
        let vfs = crate::vfs::MemVfs::new();
        let vault = Path::new("/vault");
        let ancestor: Vec<CoreError> = vec![
            assert_destination_allowed(
                &crate::vfs::MemVfs::new(),
                Path::new("/repo/repo/tools/skills"),
                &protected(),
            )
            .unwrap_err(),
            assert_destination_allowed(
                &crate::vfs::MemVfs::new(),
                Path::new("/repo/repo/tools/skills/task-work"),
                &protected(),
            )
            .unwrap_err(),
            assert_destination_allowed(
                &crate::vfs::MemVfs::new(),
                Path::new("/repo"),
                &protected(),
            )
            .unwrap_err(),
            assert_destination_allowed_for_vault(&vfs, vault, vault, []).unwrap_err(),
            assert_destination_allowed_for_vault(&vfs, Path::new("/vault/out"), vault, [])
                .unwrap_err(),
            assert_destination_allowed_for_vault(&vfs, Path::new("/"), vault, ["vault/x/SKILL.md"])
                .unwrap_err(),
        ];
        assert_eq!(ancestor.len(), 6);
        for err in ancestor {
            let message = err.to_string();
            assert!(message.starts_with("refused: unsafe-root: "), "{message}");
        }
    }

    #[test]
    fn an_unrelated_sibling_is_allowed() {
        assert_destination_allowed(
            &crate::vfs::MemVfs::new(),
            Path::new("/home/user/scratch"),
            &protected(),
        )
        .unwrap();
        // Similar name, different path — prefix comparison must be
        // component-wise, not string-wise.
        assert_destination_allowed(
            &crate::vfs::MemVfs::new(),
            Path::new("/repo/repo/tools/skills-backup"),
            &protected(),
        )
        .unwrap();
    }

    /// A canonical temporary directory, so a test compares against the same
    /// spelling the guard resolves to (macOS hands out `/var`, which is a link
    /// to `/private/var`).
    #[cfg(unix)]
    fn canonical_tempdir() -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().canonicalize().unwrap();
        (tmp, root)
    }

    #[cfg(unix)]
    #[test]
    fn a_protected_tree_reached_through_a_symlink_is_refused() {
        let (_tmp, root) = canonical_tempdir();
        let protected = root.join("repo/.claude/skills");
        std::fs::create_dir_all(&protected).unwrap();
        let alias = root.join("alias");
        std::os::unix::fs::symlink(&protected, &alias).unwrap();

        let vfs = crate::vfs::NativeVfs;
        for candidate in [alias.clone(), alias.join("task-work"), root.join("repo")] {
            let err =
                assert_destination_allowed(&vfs, &candidate, std::slice::from_ref(&protected))
                    .expect_err(&format!("{} must be refused", candidate.display()));
            assert!(err.to_string().contains("unsafe-root"), "{err}");
        }
        assert_destination_allowed(&vfs, &root.join("elsewhere"), &[protected]).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_trailing_parent_segment_behind_a_missing_directory_is_resolved_physically() {
        // `link/missing/..` is `link` on disk, and `link` is the vault.
        let (_tmp, root) = canonical_tempdir();
        let vault = root.join("vault");
        std::fs::create_dir_all(&vault).unwrap();
        let link = root.join("link");
        std::os::unix::fs::symlink(&vault, &link).unwrap();

        let candidate = link.join("missing/..");
        let err = assert_destination_allowed_for_vault(
            &crate::vfs::NativeVfs,
            &candidate,
            &vault,
            [".claude/skills/x/SKILL.md"],
        )
        .expect_err("a destination that is the vault on disk must be refused");
        assert!(err.to_string().contains("unsafe-root"), "{err}");
    }

    /// A dry run and a real run reach the same rail verdict for a `..`
    /// behind a symlink: both resolve it on disk.
    #[cfg(unix)]
    #[test]
    fn a_preview_and_a_real_run_agree_on_a_parent_segment_behind_a_link() {
        let (_tmp, root) = canonical_tempdir();
        let vault = root.join("real/vault");
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::create_dir_all(root.join("real/deep")).unwrap();
        std::fs::create_dir_all(root.join("a")).unwrap();
        std::os::unix::fs::symlink(root.join("real/deep"), root.join("a/link")).unwrap();

        // `a/link/../vault` is `real/vault` on disk.
        let candidate = root.join("a/link/../vault");
        let native = crate::vfs::NativeVfs;
        let preview = crate::vfs::PreviewVfs::over(&native);
        for vfs in [&native as &dyn Vfs, &preview] {
            let err = assert_destination_allowed_for_vault(
                vfs,
                &candidate,
                &vault,
                [".claude/skills/x/SKILL.md"],
            )
            .expect_err("the destination is the vault on disk");
            assert!(err.to_string().contains("unsafe-root"), "{err}");
        }
    }

    /// A host that fails to resolve a path for a reason other than its being
    /// missing: every rail refuses, whichever way its own check points.
    struct DeniedVfs(crate::vfs::MemVfs);

    impl Vfs for DeniedVfs {
        fn read_file(&self, path: &Path) -> Result<Vec<u8>, CoreError> {
            self.0.read_file(path)
        }
        fn read_dir(&self, path: &Path) -> Result<Vec<crate::vfs::DirEntry>, CoreError> {
            self.0.read_dir(path)
        }
        fn write_file(&self, path: &Path, bytes: &[u8]) -> Result<(), CoreError> {
            self.0.write_file(path, bytes)
        }
        fn create_dir_all(&self, path: &Path) -> Result<(), CoreError> {
            self.0.create_dir_all(path)
        }
        fn exists(&self, path: &Path) -> bool {
            self.0.exists(path)
        }
        fn is_executable(&self, path: &Path) -> bool {
            self.0.is_executable(path)
        }
        fn set_executable(&self, path: &Path, yes: bool) -> Result<(), CoreError> {
            self.0.set_executable(path, yes)
        }
        fn rename(&self, from: &Path, to: &Path) -> Result<(), CoreError> {
            self.0.rename(from, to)
        }
        fn remove(&self, path: &Path) -> Result<(), CoreError> {
            self.0.remove(path)
        }
        fn sees_links(&self) -> bool {
            true
        }
        /// Denied under `/locked`, missing under `/gone` and `/unreadable`,
        /// lexical elsewhere.
        fn canonicalize(&self, path: &Path) -> Result<PathBuf, CoreError> {
            let kind = if path.starts_with("/locked") {
                std::io::ErrorKind::PermissionDenied
            } else if path.starts_with("/gone") || path.starts_with("/unreadable") {
                std::io::ErrorKind::NotFound
            } else {
                return Ok(crate::vfs::normalize(path));
            };
            Err(CoreError::io(path, std::io::Error::from(kind)))
        }
        /// Denied for `/unreadable`; elsewhere nothing is a link.
        fn read_link(&self, path: &Path) -> Result<PathBuf, CoreError> {
            let kind = if path == Path::new("/unreadable") {
                std::io::ErrorKind::PermissionDenied
            } else {
                std::io::ErrorKind::InvalidInput
            };
            Err(CoreError::io(path, std::io::Error::from(kind)))
        }
    }

    #[test]
    fn a_host_error_that_is_not_a_missing_path_refuses_every_rail() {
        let vfs = DeniedVfs(crate::vfs::MemVfs::new());
        let refusals = [
            resolve_write_path(&vfs, Path::new("/locked/dest"), "x/SKILL.md").unwrap_err(),
            assert_destination_allowed_for_vault(
                &vfs,
                Path::new("/locked"),
                Path::new("/vault"),
                ["x/SKILL.md"],
            )
            .unwrap_err(),
            assert_destination_allowed(&vfs, Path::new("/locked/dest"), &[PathBuf::from("/vault")])
                .unwrap_err(),
        ];
        for err in refusals {
            let message = err.to_string();
            assert!(message.starts_with("refused: unsafe-path: "), "{message}");
            assert!(message.contains("/locked"), "{message}");
        }

        // `/unreadable` is missing, so path-guard asks whether it is a dangling
        // link, and the host cannot say.
        let unreadable = assert_destination_allowed_for_vault(
            &vfs,
            Path::new("/unreadable/dest"),
            Path::new("/vault"),
            ["x/SKILL.md"],
        )
        .unwrap_err()
        .to_string();
        assert!(
            unreadable.starts_with("refused: unsafe-path: /unreadable"),
            "{unreadable}"
        );

        // A missing path is an answer, not a failure.
        assert_destination_allowed_for_vault(
            &vfs,
            Path::new("/gone"),
            Path::new("/vault"),
            ["x/SKILL.md"],
        )
        .unwrap();
    }

    // --- the write path ----------------------------------------------------

    fn refusal(vfs: &dyn Vfs, root: &str, relative: &str) -> String {
        resolve_write_path(vfs, Path::new(root), relative)
            .expect_err(&format!("{relative:?} must be refused"))
            .to_string()
    }

    #[test]
    fn an_ordinary_projected_path_resolves_under_the_root() {
        let vfs = crate::vfs::MemVfs::new();
        assert_eq!(
            resolve_write_path(&vfs, Path::new("/dest"), ".claude/skills/x/SKILL.md").unwrap(),
            PathBuf::from("/dest/.claude/skills/x/SKILL.md")
        );
        // A destination root that does not exist yet is the ordinary first
        // publish, not a refusal.
        assert_eq!(
            resolve_write_path(&vfs, Path::new("/nowhere-yet"), ".claude/skills/x/SKILL.md")
                .unwrap(),
            PathBuf::from("/nowhere-yet/.claude/skills/x/SKILL.md")
        );
    }

    #[test]
    fn the_lexical_rule_is_the_renderers_and_the_refusal_names_the_path() {
        let vfs = crate::vfs::MemVfs::new();
        for relative in [
            "../../../../etc/evil.sh",
            "/absolute/evil.md",
            "a/../b.md",
            "./evil.md",
            "a//b.md",
            "sub/",
            "C:\\Windows\\evil.md",
            "\\\\server\\share\\evil.md",
            "",
        ] {
            let message = refusal(&vfs, "/dest", relative);
            assert!(
                message.starts_with("refused: unsafe-path: "),
                "{relative:?}: {message}"
            );
            assert!(message.contains("/dest"), "{relative:?}: {message}");
            assert!(
                message.contains(&format!("`{relative}`")),
                "{relative:?}: {message}"
            );
            assert!(message.contains("Nothing was written"), "{message}");
        }
    }

    #[test]
    fn the_refusal_is_refused_and_not_a_projection_failure() {
        // Load-bearing: a host classifies `Refused` as denied and `Projection`
        // as an error, and a path escape logged as an error is one nobody sees.
        let vfs = crate::vfs::MemVfs::new();
        let err = resolve_write_path(&vfs, Path::new("/dest"), "../evil.md").unwrap_err();
        assert!(matches!(err, CoreError::Refused(_)), "{err}");
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_parent_pointing_outside_the_root_is_refused() {
        // The part the renderer provably cannot do. Everything here is
        // lexically inside `dest/`; only the filesystem knows it is not.
        let tmp = tempfile::tempdir().unwrap();
        let dest = tmp.path().join("dest");
        let outside = tmp.path().join("outside");
        std::fs::create_dir_all(&dest).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, dest.join(".claude")).unwrap();

        let vfs = crate::vfs::NativeVfs;
        let err = resolve_write_path(&vfs, &dest, ".claude/skills/x/SKILL.md").unwrap_err();
        let message = err.to_string();

        assert!(matches!(err, CoreError::Refused(_)), "{message}");
        assert!(message.contains("unsafe-path"), "{message}");
        assert!(message.contains(".claude/skills/x/SKILL.md"), "{message}");
        assert!(message.contains("resolves outside the root"), "{message}");

        // A link that stays inside the root is an alias the user made on
        // purpose, and it publishes.
        std::fs::create_dir_all(dest.join("real")).unwrap();
        std::os::unix::fs::symlink(dest.join("real"), dest.join(".agents")).unwrap();
        assert_eq!(
            resolve_write_path(&vfs, &dest, ".agents/skills/x/SKILL.md").unwrap(),
            dest.join(".agents/skills/x/SKILL.md")
        );

        // And the same tree with a real directory in place of the escaping
        // link is not refused — the check is not just refusing everything.
        let plain = tmp.path().join("plain");
        std::fs::create_dir_all(plain.join(".claude")).unwrap();
        assert!(resolve_write_path(&vfs, &plain, ".claude/skills/x/SKILL.md").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_root_is_compared_against_where_it_leads() {
        // Both sides are canonicalised, so a destination reached through a link
        // publishes normally rather than being refused for not matching itself.
        let tmp = tempfile::tempdir().unwrap();
        let real = tmp.path().join("real-dest");
        std::fs::create_dir_all(&real).unwrap();
        let alias = tmp.path().join("alias");
        std::os::unix::fs::symlink(&real, &alias).unwrap();

        let vfs = crate::vfs::NativeVfs;
        assert_eq!(
            resolve_write_path(&vfs, &alias, ".claude/skills/x/SKILL.md").unwrap(),
            alias.join(".claude/skills/x/SKILL.md")
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_published_file_that_is_a_link_out_of_the_tree_is_refused() {
        // The leaf case: nothing above it is a link, the file itself is.
        let tmp = tempfile::tempdir().unwrap();
        let dest = tmp.path().join("dest");
        let outside = tmp.path().join("outside");
        std::fs::create_dir_all(dest.join(".claude/skills/x")).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("theirs.md"), b"theirs\n").unwrap();
        std::os::unix::fs::symlink(
            outside.join("theirs.md"),
            dest.join(".claude/skills/x/SKILL.md"),
        )
        .unwrap();

        let err = resolve_write_path(&crate::vfs::NativeVfs, &dest, ".claude/skills/x/SKILL.md")
            .unwrap_err();
        assert!(matches!(err, CoreError::Refused(_)), "{err}");
    }

    #[cfg(unix)]
    #[test]
    fn a_published_file_that_is_a_dangling_link_out_of_the_tree_is_refused() {
        // The link's target does not exist yet, so a write through it would
        // create the file outside the root.
        let tmp = tempfile::tempdir().unwrap();
        let dest = tmp.path().join("dest");
        std::fs::create_dir_all(dest.join(".claude/skills/x")).unwrap();
        std::os::unix::fs::symlink(
            tmp.path().join("outside/theirs.md"),
            dest.join(".claude/skills/x/SKILL.md"),
        )
        .unwrap();

        let err = resolve_write_path(&crate::vfs::NativeVfs, &dest, ".claude/skills/x/SKILL.md")
            .unwrap_err();
        assert!(matches!(err, CoreError::Refused(_)), "{err}");
    }

    #[test]
    fn computed_dirs_follow_agent_adapt_conventions() {
        let dirs = computed_skill_dirs(
            Path::new("/dest"),
            &[
                "claude-code".to_owned(),
                "codex-cli".to_owned(),
                "amp".to_owned(),
            ],
        )
        .unwrap();
        // codex-cli and amp share .agents/skills — deduped.
        assert_eq!(
            dirs,
            vec![
                PathBuf::from("/dest/.agents/skills"),
                PathBuf::from("/dest/.claude/skills"),
            ]
        );
    }

    #[test]
    fn computed_dirs_cover_every_skill_target_projection_accepts() {
        let dirs = computed_skill_dirs(Path::new("/dest"), &["cursor".to_owned(), "pi".to_owned()])
            .unwrap();
        assert_eq!(
            dirs,
            vec![
                PathBuf::from("/dest/.cursor/skills"),
                PathBuf::from("/dest/.pi/skills"),
            ]
        );
    }

    #[test]
    fn computed_dirs_refuse_unknown_and_skill_less_targets() {
        let unknown = computed_skill_dirs(Path::new("/dest"), &["vim".to_owned()]).unwrap_err();
        assert!(
            unknown
                .to_string()
                .contains("unsupported runtime target: vim"),
            "{unknown}"
        );
        // github-copilot has a commands layout only; projection refuses it
        // for skills, and so does the probe.
        let copilot =
            computed_skill_dirs(Path::new("/dest"), &["github-copilot".to_owned()]).unwrap_err();
        assert!(
            copilot.to_string().contains("runtime renders no skills"),
            "{copilot}"
        );
    }

    #[test]
    fn probe_reports_occupied_dirs_only() {
        let dest = tempfile::tempdir().unwrap();
        let claude = dest.path().join(".claude/skills/existing");
        std::fs::create_dir_all(&claude).unwrap();
        std::fs::write(claude.join("SKILL.md"), "x").unwrap();
        // .agents/skills exists but is empty — not occupied.
        std::fs::create_dir_all(dest.path().join(".agents/skills")).unwrap();

        let occupied = probe_existing_content(
            &crate::vfs::NativeVfs,
            dest.path(),
            &["claude-code".to_owned(), "antigravity".to_owned()],
        )
        .unwrap();
        assert_eq!(occupied, vec![dest.path().join(".claude/skills")]);
    }
}
