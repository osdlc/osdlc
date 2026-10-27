//! Corpus roots — the directories a scan is pointed at.
//!
//! A root is just a labelled directory plus a [`RootKind`] recording *why* it
//! is in the list. The kind is not cosmetic: it decides ordering, whether a
//! missing root is an error or a shrug, and how the UI groups results.
//!
//! Roots are supplied by the host, never discovered here. A host knows its own
//! project registry and settings; this crate stays ignorant of them. The two exceptions are
//! [`user_root`] and [`harness_dirs`], which resolve the well-known
//! user-global locations, because those paths are a property of the agent
//! runtimes rather than of any host.
//!
//! # Manager-owned trees are never offered
//!
//! [`harness_dirs`] lists directories a harness on this machine already reads
//! — and leaves out every tree a plugin manager owns, per
//! the plugin-installed-skills research. That research measured 128 of 148 skills under
//! `~/.claude` as manager-installed, and ruled them permanently unadoptable:
//! the manager pins versions, rotates version directories on update and sweeps
//! the old one 14 days later, so any provenance recorded against one rots
//! silently.
//!
//! The discriminator is the manager's own registry, not a name pattern. A
//! marker-only rule would exclude a *marketplace source* directory in the
//! user's own checkout, which carries the same manifest an install does and is
//! the user's own work. The registry files being absent or unreadable degrades
//! to the fixed path list, never to "unknown, allow": the cost is asymmetric,
//! so the one place erring toward refusal is right.
//!
//! Excluded skills are still COUNTED
//! ([`HarnessDirs::excluded_manager_owned`]). A list that shows 20 of 148 with
//! no explanation reads as a bug, and reporting a tree is not adopting it.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::skill::RUNTIME_DIRS;
use crate::vfs::Vfs;

/// Why a root is in the scan list. Ordering is meaningful: roots sort by kind
/// so project-local skills — the ones a developer is most likely to be editing
/// — come before the user-global ones they shadow.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RootKind {
    /// The host's currently focused project. At most one.
    ///
    /// A host builds exactly one `Project` root over the active vault.
    Project,
    /// A root the user explicitly registered (another checkout, a scratch dir).
    ///
    /// Host-constructed. It waits on destination registration, the same
    /// caller [`crate::guard::probe_existing_content`] waits on.
    Registered,
    /// The well-known user-global agent directory (`~/.claude`).
    ///
    /// Host-constructed from [`user_root`], and no host of this crate builds
    /// one yet. See [`RootKind::Registered`].
    UserGlobal,
}

impl RootKind {
    /// A missing [`RootKind::UserGlobal`] root is ordinary — plenty of machines
    /// have no `~/.claude`. A missing project or registered root is worth
    /// surfacing, because the user named it and it isn't there.
    pub fn absence_is_noteworthy(self) -> bool {
        !matches!(self, RootKind::UserGlobal)
    }
}

/// A directory to scan for skills.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CorpusRoot {
    /// Stable identifier, unique within a scan. Skill ids are namespaced by it,
    /// so it must not change between scans or the frontend's selection breaks.
    pub id: String,
    /// Human label for the UI (a project name, "User global", …).
    pub label: String,
    /// Absolute path to the directory.
    pub path: PathBuf,
    /// What kind of root this is.
    pub kind: RootKind,
}

impl CorpusRoot {
    /// Builds a root from its parts.
    pub fn new(
        id: impl Into<String>,
        label: impl Into<String>,
        path: impl Into<PathBuf>,
        kind: RootKind,
    ) -> Self {
        Self {
            id: id.into(),
            label: label.into(),
            path: path.into(),
            kind,
        }
    }

    /// True when the root currently exists and is a directory. A root can come
    /// and go (an unmounted volume, a deleted checkout) without invalidating
    /// the registration, so this is checked per scan rather than at
    /// construction.
    ///
    /// Native only — it reaches `std::fs` directly and reports `false` for
    /// everything on a host with no filesystem. [`crate::scan::scan_roots`]
    /// asks the [`crate::vfs::Vfs`] instead; this stays for native callers
    /// that hold no `Vfs`.
    pub fn is_available(&self) -> bool {
        self.path.is_dir()
    }
}

/// The well-known user-global agent directory, `~/.claude`.
///
/// **Early, not dead.** No caller in this workspace reaches it yet, and the
/// one it was waiting on took a narrower shape: the plugin-installed-skills research's
/// classification rule ships as [`manager_owned_trees`], and the adopt-side
/// listing it feeds is [`harness_dirs`], which offers one skills directory per
/// runtime rather than this whole root. What is left for this function is a
/// caller that wants `~/.claude` as a SCAN root — a roster over everything
/// installed, not an import source.
///
/// Returns `None` when the home directory cannot be determined — which is
/// normal in a sandbox or a CI container, and must not be an error.
///
/// Claude Code's own directory, read where it sits: this is not a location
/// this crate places, so it does not go through the install path helpers. The home
/// lookup does come from `agent_adapt::install::user_anchor` — it is the
/// anchor every `Scope::User` path shares.
pub fn user_root() -> Option<CorpusRoot> {
    let path = agent_adapt::install::user_anchor()?.join(".claude");
    Some(CorpusRoot::new(
        "user-global",
        "User global",
        path,
        RootKind::UserGlobal,
    ))
}

/// One directory a harness on this machine reads skills out of, offered as an
/// import source.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HarnessDir {
    /// Absolute path to the directory. This is what an adoption's `source`
    /// would be.
    pub path: PathBuf,
    /// The runtime whose directory it sits under — `claude`, `codex`, and the
    /// rest of [`RUNTIME_DIRS`]'s second column.
    pub runtime: String,
    /// Skill directories in it a manager does not own — what an import from
    /// here would consider.
    pub skills: usize,
    /// Skill directories in it left out because a manager owns them. Reported
    /// rather than hidden; reporting is not adoption.
    pub excluded_manager_owned: usize,
}

/// Every harness directory on this machine, plus what was withheld.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct HarnessDirs {
    /// In [`RUNTIME_DIRS`] order, and only directories that exist. A harness
    /// nobody has installed is absent rather than listed empty.
    pub dirs: Vec<HarnessDir>,
    /// Skill directories withheld across every root, manager-owned every one.
    pub excluded_manager_owned: usize,
}

/// The skills directories the installed harnesses read, under `home`.
///
/// One candidate per [`RUNTIME_DIRS`] entry — `<home>/<dir>/skills` — kept
/// where the directory is really there. A root a manager owns outright is not
/// offered at all; a root holding some manager-owned skills is offered with
/// those subtracted from its count and added to
/// [`HarnessDirs::excluded_manager_owned`].
///
/// Reads through the [`Vfs`], so a host with no filesystem answers with an
/// empty list rather than raising.
pub fn harness_dirs(vfs: &dyn Vfs, home: &Path) -> Result<HarnessDirs, CoreError> {
    let owned = manager_owned_trees(vfs, home);
    let mut report = HarnessDirs::default();

    for (dir, runtime) in RUNTIME_DIRS {
        let path = home.join(dir).join("skills");
        if !vfs.exists(&path) || is_owned(&path, &owned) {
            continue;
        }
        let Ok(entries) = vfs.read_dir(&path) else {
            continue;
        };
        let (mut skills, mut excluded) = (0usize, 0usize);
        for entry in entries {
            let child = path.join(&entry.name);
            if !entry.is_dir || !vfs.exists(&child.join("SKILL.md")) {
                continue;
            }
            if is_owned(&child, &owned) {
                excluded += 1;
            } else {
                skills += 1;
            }
        }
        report.excluded_manager_owned += excluded;
        report.dirs.push(HarnessDir {
            path,
            runtime: (*runtime).to_owned(),
            skills,
            excluded_manager_owned: excluded,
        });
    }
    Ok(report)
}

/// [`harness_dirs`] against the current user's home. Returns `None` under
/// the same no-home conditions as [`user_root`] — normal in a sandbox or
/// CI, not an error.
pub fn user_harness_dirs(vfs: &dyn Vfs) -> Option<Result<HarnessDirs, CoreError>> {
    let home = agent_adapt::install::user_anchor()?;
    Some(harness_dirs(vfs, &home))
}

/// Directories a plugin manager put there and will delete, from
/// the plugin-installed-skills research's Consequences table.
///
/// Two layers. The fixed prefixes are the ones a registry cannot contradict —
/// a manager's own cache, a harness's vendored tree — and they stand whether
/// or not any registry file parses. The registry-derived entries are added on
/// top and reach the installs that sit OUTSIDE those prefixes, which is the
/// documented `<name>@skills-dir` shape a path rule would never look at.
///
/// A marketplace whose `installLocation` is `directory` is deliberately NOT
/// included: that is the user's own checkout, read out of rather than written
/// into, and excluding it is the mistake that would hide the user's own
/// authored plugin source from them.
pub fn manager_owned_trees(vfs: &dyn Vfs, home: &Path) -> Vec<PathBuf> {
    let mut owned: Vec<PathBuf> = FIXED_MANAGER_TREES
        .iter()
        .map(|relative| home.join(relative))
        .collect();

    let plugins = home.join(".claude").join("plugins");
    if let Some(value) = read_json(vfs, &plugins.join("installed_plugins.json")) {
        collect_strings(&value, "installPath", &mut owned);
    }
    if let Some(value) = read_json(vfs, &plugins.join("known_marketplaces.json")) {
        collect_marketplaces(&value, &mut owned);
    }
    owned.sort();
    owned.dedup();
    owned
}

/// Manager-owned trees no registry can argue with, relative to the home
/// directory. `.claude/plugins` is listed whole rather than per install: it is
/// the manager's directory, the fallback when its registry cannot be read, and
/// nothing a user authors lives under it.
const FIXED_MANAGER_TREES: &[&str] = &[
    ".claude/plugins",
    ".codex/plugins/cache",
    ".codex/.tmp",
    ".codex/vendor_imports",
    ".codex/skills/.system",
    ".cursor/plugins",
];

/// Is `path` at, or inside, one of the owned trees?
fn is_owned(path: &Path, owned: &[PathBuf]) -> bool {
    owned.iter().any(|tree| path.starts_with(tree))
}

/// One registry file as JSON, or nothing. Absent, unreadable, not UTF-8 and
/// not parseable are one outcome here: the caller already refuses the fixed
/// trees, so a missing registry narrows nothing.
fn read_json(vfs: &dyn Vfs, path: &Path) -> Option<serde_json::Value> {
    let bytes = vfs.read_file(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Every `key` string anywhere in `value`, as a path.
///
/// A walk rather than a fixed shape: `installed_plugins.json` keys its entries
/// by plugin id and by scope, and pinning that nesting would make a manager's
/// own layout change read as "nothing is manager-owned" — the failure this
/// module refuses to have.
fn collect_strings(value: &serde_json::Value, key: &str, out: &mut Vec<PathBuf>) {
    match value {
        serde_json::Value::Object(map) => {
            for (name, child) in map {
                if name == key
                    && let Some(path) = child.as_str()
                {
                    out.push(PathBuf::from(path));
                }
                collect_strings(child, key, out);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_strings(item, key, out);
            }
        }
        _ => {}
    }
}

/// Every marketplace clone the manager wrote, from
/// `known_marketplaces.json` — an entry whose `installLocation` is anything
/// but `directory`, keyed by its `installPath`/`path`.
fn collect_marketplaces(value: &serde_json::Value, out: &mut Vec<PathBuf>) {
    let serde_json::Value::Object(map) = value else {
        return;
    };
    for child in map.values() {
        let Some(entry) = child.as_object() else {
            collect_marketplaces(child, out);
            continue;
        };
        // `directory` means the user's own checkout — excluded; see
        // manager_owned_trees's doc for why. Anything else (a git clone, a
        // fetched archive) the manager wrote and will rewrite, so it is
        // collected.
        let location = entry.get("installLocation").and_then(|v| v.as_str());
        if location == Some("directory") {
            continue;
        }
        for key in ["installPath", "path"] {
            if let Some(path) = entry.get(key).and_then(|v| v.as_str()) {
                out.push(PathBuf::from(path));
            }
        }
        collect_marketplaces(child, out);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vfs::MemVfs;

    fn skill(vfs: &MemVfs, dir: &str) {
        let path = PathBuf::from(format!("{dir}/SKILL.md"));
        vfs.create_dir_all(path.parent().unwrap()).unwrap();
        vfs.write_file(&path, b"---\nname: s\ndescription: d\n---\nb\n")
            .unwrap();
    }

    fn write_json(vfs: &MemVfs, path: &str, body: &str) {
        let path = PathBuf::from(path);
        vfs.create_dir_all(path.parent().unwrap()).unwrap();
        vfs.write_file(&path, body.as_bytes()).unwrap();
    }

    #[test]
    fn the_managers_own_cache_is_never_offered_and_the_users_directories_are() {
        let vfs = MemVfs::new();
        skill(&vfs, "/home/.claude/skills/review");
        skill(&vfs, "/home/.claude/skills/ship");
        skill(&vfs, "/home/.codex/skills/audit");
        // The manager's cache, under a directory that is not offered at all.
        skill(
            &vfs,
            "/home/.claude/plugins/cache/acme/seo/2.2.4/skills/seo-audit",
        );

        let report = harness_dirs(&vfs, Path::new("/home")).unwrap();
        let listed: Vec<(&str, usize)> = report
            .dirs
            .iter()
            .map(|d| (d.path.to_str().unwrap(), d.skills))
            .collect();
        assert_eq!(
            listed,
            vec![("/home/.claude/skills", 2), ("/home/.codex/skills", 1)]
        );
        // The cache is not a skills directory of any runtime, so it is never a
        // candidate — nothing to withhold from a list it was never on.
        assert_eq!(report.excluded_manager_owned, 0);
    }

    /// The `<name>@skills-dir` shape: an install living inside the user's own
    /// skills directory, reachable only through the registry.
    #[test]
    fn a_registered_install_inside_a_users_own_directory_is_withheld_and_counted() {
        let vfs = MemVfs::new();
        skill(&vfs, "/home/.claude/skills/mine");
        skill(&vfs, "/home/.claude/skills/theirs");
        write_json(
            &vfs,
            "/home/.claude/plugins/installed_plugins.json",
            r#"{"theirs@market": {"user": {"installPath": "/home/.claude/skills/theirs"}}}"#,
        );

        let report = harness_dirs(&vfs, Path::new("/home")).unwrap();
        assert_eq!(report.dirs.len(), 1);
        assert_eq!(report.dirs[0].skills, 1);
        assert_eq!(report.dirs[0].excluded_manager_owned, 1);
        assert_eq!(report.excluded_manager_owned, 1);
    }

    /// The 36-skill mistake, pinned: a marketplace registered against the
    /// user's own checkout is read out of, not written into, and stays
    /// adoptable.
    #[test]
    fn a_directory_marketplace_is_the_users_checkout_and_is_not_manager_owned() {
        let vfs = MemVfs::new();
        write_json(
            &vfs,
            "/home/.claude/plugins/known_marketplaces.json",
            r#"{
              "tool": {"installLocation": "directory", "installPath": "/work/project/apps/tool"},
              "acme": {"installLocation": "git", "installPath": "/work/clone/acme"}
            }"#,
        );
        let owned = manager_owned_trees(&vfs, Path::new("/home"));
        assert!(owned.contains(&PathBuf::from("/work/clone/acme")));
        assert!(!owned.contains(&PathBuf::from("/work/project/apps/tool")));
    }

    /// An unreadable registry must not read as "nothing is owned".
    #[test]
    fn an_unparseable_registry_leaves_the_fixed_trees_standing() {
        let vfs = MemVfs::new();
        write_json(
            &vfs,
            "/home/.claude/plugins/installed_plugins.json",
            "{ not json",
        );
        let owned = manager_owned_trees(&vfs, Path::new("/home"));
        assert!(owned.contains(&PathBuf::from("/home/.claude/plugins")));
        assert!(owned.contains(&PathBuf::from("/home/.codex/skills/.system")));
    }

    #[test]
    fn roots_sort_project_then_registered_then_user_global() {
        // Ordering drives the UI's grouping; pin it rather than trusting the
        // declaration order to survive an edit.
        let mut kinds = vec![
            RootKind::UserGlobal,
            RootKind::Project,
            RootKind::Registered,
        ];
        kinds.sort();
        assert_eq!(
            kinds,
            vec![
                RootKind::Project,
                RootKind::Registered,
                RootKind::UserGlobal
            ]
        );
    }

    #[test]
    fn only_user_global_absence_is_unremarkable() {
        assert!(RootKind::Project.absence_is_noteworthy());
        assert!(RootKind::Registered.absence_is_noteworthy());
        assert!(!RootKind::UserGlobal.absence_is_noteworthy());
    }

    #[test]
    fn availability_tracks_the_filesystem() {
        let dir = tempfile::tempdir().unwrap();
        let root = CorpusRoot::new("t", "T", dir.path(), RootKind::Registered);
        assert!(root.is_available());

        let gone = CorpusRoot::new("g", "G", dir.path().join("nope"), RootKind::Registered);
        assert!(!gone.is_available());
    }

    #[test]
    fn kind_serializes_kebab_case() {
        // The wire form is consumed by host clients; pin it.
        let json = serde_yaml::to_string(&RootKind::UserGlobal).unwrap();
        assert_eq!(json.trim(), "user-global");
    }
}
