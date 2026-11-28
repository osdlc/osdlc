use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use super::*;

fn vars(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
    let map: BTreeMap<String, String> = pairs
        .iter()
        .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
        .collect();
    move |name| map.get(name).cloned()
}

/// A store in a temporary folder, and a repository folder beside it.
fn store_and_repo() -> (tempfile::TempDir, TrustStore, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let store = TrustStore::at(dir.path().join("state/tool/trusted"));
    let repo = dir.path().join("repo");
    std::fs::create_dir(&repo).unwrap();
    (dir, store, repo)
}

#[test]
fn store_dir_takes_an_absolute_xdg_state_home() {
    let home = Path::new("/home/u");
    assert_eq!(
        trust_store_dir("mytool", &vars(&[("XDG_STATE_HOME", "/x/state")]), home),
        Path::new("/x/state/mytool/trusted")
    );
    assert_eq!(
        trust_store_dir("mytool", &vars(&[("XDG_STATE_HOME", "~/st")]), home),
        Path::new("/home/u/st/mytool/trusted")
    );
}

#[test]
fn store_dir_falls_back_when_xdg_state_home_is_unset_blank_or_relative() {
    let home = Path::new("/home/u");
    let fallback = Path::new("/home/u/.local/state/mytool/trusted");
    for given in [
        &[][..],
        &[("XDG_STATE_HOME", "  ")],
        &[("XDG_STATE_HOME", "rel/state")],
    ] {
        assert_eq!(
            trust_store_dir("mytool", &vars(given), home),
            fallback,
            "{given:?}"
        );
    }
}

#[test]
fn marker_name_is_the_slugged_basename_and_the_hash_of_the_root() {
    assert_eq!(
        marker_name(Path::new("/home/a/my repo")),
        "my-repo-fe076599713ac3a6"
    );
    assert!(marker_name(Path::new("/")).starts_with("root-"));
    // One dash per UTF-16 unit, as the TypeScript library's replace gives.
    assert_eq!(slug("a\u{e9}\u{1f600}b"), "a---b");
}

#[test]
fn trust_twice_is_already_trusted_the_second_time() {
    let (_dir, store, repo) = store_and_repo();
    assert!(!store.is_trusted(&repo).unwrap());
    let first = store.trust(&repo).unwrap();
    assert!(!first.already_trusted);
    assert!(first.marker.is_file());
    let second = store.trust(&repo).unwrap();
    assert!(second.already_trusted);
    assert_eq!(second.marker, first.marker);
    assert!(store.is_trusted(&repo).unwrap());
    let text = std::fs::read_to_string(&first.marker).unwrap();
    assert_eq!(text, format!("{}\n", first.root.display()));
}

#[cfg(unix)]
#[test]
fn a_symlink_to_a_trusted_root_is_trusted() {
    let (dir, store, repo) = store_and_repo();
    store.trust(&repo).unwrap();
    let link = dir.path().join("link");
    std::os::unix::fs::symlink(&repo, &link).unwrap();
    assert!(store.is_trusted(&link).unwrap());
    assert_eq!(
        store.marker_path(&link).unwrap(),
        store.marker_path(&repo).unwrap()
    );
}

#[cfg(unix)]
#[test]
fn the_folder_is_0700_and_the_marker_0600() {
    use std::os::unix::fs::PermissionsExt;
    let mode = |path: &Path| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
    let (_dir, store, repo) = store_and_repo();
    let marker = store.trust(&repo).unwrap().marker;
    assert_eq!(mode(store.dir()), 0o700);
    assert_eq!(mode(&marker), 0o600);
    // Looser modes, as an older writer may have left them, are tightened by the next trust.
    std::fs::set_permissions(store.dir(), std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::set_permissions(&marker, std::fs::Permissions::from_mode(0o644)).unwrap();
    assert!(store.trust(&repo).unwrap().already_trusted);
    assert_eq!(mode(store.dir()), 0o700);
    assert_eq!(mode(&marker), 0o600);
}

#[cfg(unix)]
#[test]
fn trust_tightens_markers_only_and_leaves_other_files_alone() {
    use std::os::unix::fs::PermissionsExt;
    let mode = |path: &Path| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
    let set = |path: &Path, bits: u32| {
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(bits)).unwrap();
    };
    let (dir, store, repo) = store_and_repo();
    let other = dir.path().join("other");
    std::fs::create_dir(&other).unwrap();
    let other_marker = store.trust(&other).unwrap().marker;
    set(&other_marker, 0o644);
    let foreign = store.dir().join("run.sh");
    std::fs::write(&foreign, "#!/bin/sh\n").unwrap();
    set(&foreign, 0o755);
    // A marker name, but not that of the root it holds.
    let posing = store.dir().join(marker_name(&repo.join("x")));
    std::fs::write(&posing, format!("{}\n", other.display())).unwrap();
    set(&posing, 0o644);

    let marker = store.trust(&repo).unwrap().marker;
    assert_eq!(mode(&marker), 0o600);
    assert_eq!(mode(&other_marker), 0o600);
    assert_eq!(mode(&foreign), 0o755);
    assert_eq!(mode(&posing), 0o644);
    assert_eq!(mode(store.dir()), 0o700);
}

#[cfg(unix)]
#[test]
fn trust_does_not_follow_a_marker_that_is_a_link() {
    use std::os::unix::fs::PermissionsExt;
    let mode = |path: &Path| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
    let (dir, store, repo) = store_and_repo();
    // The store's owner linked the marker in from elsewhere, as a dotfiles manager does.
    let outside = dir.path().join("outside-marker");
    std::fs::write(&outside, format!("{}\n", repo.display())).unwrap();
    std::fs::set_permissions(&outside, std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::create_dir_all(store.dir()).unwrap();
    std::os::unix::fs::symlink(&outside, store.marker_path(&repo).unwrap()).unwrap();
    assert!(store.trust(&repo).unwrap().already_trusted);
    assert_eq!(mode(&outside), 0o755);
}

#[test]
fn untrust_is_false_the_second_time() {
    let (_dir, store, repo) = store_and_repo();
    assert!(!store.untrust(&repo).unwrap());
    let marker = store.trust(&repo).unwrap().marker;
    assert!(store.untrust(&repo).unwrap());
    assert!(!marker.exists());
    assert!(!store.is_trusted(&repo).unwrap());
    assert!(!store.untrust(&repo).unwrap());
}

#[test]
fn a_blank_marker_is_no_grant() {
    let (_dir, store, repo) = store_and_repo();
    let marker = store.marker_path(&repo).unwrap();
    std::fs::create_dir_all(store.dir()).unwrap();
    std::fs::write(&marker, "  \nsecond\n").unwrap();
    assert!(!store.is_trusted(&repo).unwrap());
    assert!(store.list().unwrap().is_empty());
}

#[test]
fn list_is_sorted_and_ignores_temp_files_and_scope_folders() {
    let dir = tempfile::tempdir().unwrap();
    let store = TrustStore::at(dir.path().join("trusted"));
    assert!(store.list().unwrap().is_empty(), "a missing folder");
    let roots: Vec<PathBuf> = ["zeta", "alpha", "mid"]
        .iter()
        .map(|name| {
            let root = dir.path().join(name);
            std::fs::create_dir(&root).unwrap();
            store.trust(&root).unwrap().root
        })
        .collect();
    let alpha = store.marker_path(&roots[1]).unwrap();
    let name = alpha.file_name().unwrap().to_string_lossy().into_owned();
    // A temp file holding a root, a per-scope folder, and a copy under another name.
    std::fs::copy(
        &alpha,
        store.dir().join(format!(".{name}.etag-write-1-0.tmp")),
    )
    .unwrap();
    std::fs::create_dir(store.dir().join(format!("{name}.scopes"))).unwrap();
    std::fs::copy(&alpha, store.dir().join("old-repo")).unwrap();
    let mut expected = roots.clone();
    expected.sort();
    assert_eq!(store.list().unwrap(), expected);
}

#[test]
fn a_marker_written_in_the_typescript_format_is_a_grant() {
    let (_dir, store, repo) = store_and_repo();
    let root = std::fs::canonicalize(&repo).unwrap();
    let text = root.to_str().unwrap();
    // The name and content `@osdlc/trust-repo` writes: `<slug(basename)>-<sha256(root)[..16]>`,
    // holding the root and a newline.
    let hash: String = Sha256::digest(text.as_bytes())
        .iter()
        .take(8)
        .map(|b| format!("{b:02x}"))
        .collect();
    std::fs::create_dir_all(store.dir()).unwrap();
    std::fs::write(
        store.dir().join(format!("repo-{hash}")),
        format!("{text}\n"),
    )
    .unwrap();
    assert!(store.is_trusted(&repo).unwrap());
    assert_eq!(store.list().unwrap(), vec![root.clone()]);
    assert!(store.trust(&repo).unwrap().already_trusted);
}

#[test]
fn a_relative_root_is_refused() {
    let (_dir, store, _repo) = store_and_repo();
    assert!(matches!(
        store.is_trusted(Path::new("rel")),
        Err(TrustError::Resolve { .. })
    ));
}

#[test]
fn gate_flag_false_is_off_without_reading_the_store() {
    let (_dir, store, repo) = store_and_repo();
    store.trust(&repo).unwrap();
    let gate = resolve_exec_gate(&store, &repo, true, Some(false)).unwrap();
    assert!(!gate.allow_exec);
    assert!(!gate.trusted);
    assert_eq!(gate.reason, GateReason::ConfiguredOff);
}

#[test]
fn gate_flag_true_allows_and_saves_nothing() {
    let (_dir, store, repo) = store_and_repo();
    let gate = resolve_exec_gate(&store, &repo, true, Some(true)).unwrap();
    assert!(gate.allow_exec);
    assert!(!gate.trusted);
    assert_eq!(gate.reason, GateReason::AllowedByFlag);
    assert!(!store.is_trusted(&repo).unwrap());
    assert!(!store.dir().exists());
}

#[test]
fn gate_flags_read_no_store() {
    // A store that cannot be read: its folder is a file.
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("not-a-folder");
    std::fs::write(&file, "").unwrap();
    let store = TrustStore::at(file);
    assert!(matches!(
        resolve_exec_gate(&store, dir.path(), true, None),
        Err(TrustError::Io { .. })
    ));
    let allowed = resolve_exec_gate(&store, dir.path(), true, Some(true)).unwrap();
    assert!(allowed.allow_exec);
    assert_eq!(allowed.reason, GateReason::AllowedByFlag);
    let off = resolve_exec_gate(&store, dir.path(), true, Some(false)).unwrap();
    assert!(!off.allow_exec);
    assert_eq!(off.reason, GateReason::ConfiguredOff);
}

#[test]
fn gate_no_flag_untrusted_refuses() {
    let (_dir, store, repo) = store_and_repo();
    let gate = resolve_exec_gate(&store, &repo, true, None).unwrap();
    assert!(!gate.allow_exec);
    assert_eq!(gate.reason, GateReason::Untrusted);
}

#[test]
fn gate_no_flag_trusted_allows() {
    let (_dir, store, repo) = store_and_repo();
    let root = store.trust(&repo).unwrap().root;
    let gate = resolve_exec_gate(&store, &repo, true, None).unwrap();
    assert!(gate.allow_exec);
    assert!(gate.trusted);
    assert_eq!(gate.reason, GateReason::Allowed);
    assert_eq!(gate.root, root);
}

#[test]
fn gate_configured_false_refuses_a_trusted_root() {
    let (_dir, store, repo) = store_and_repo();
    store.trust(&repo).unwrap();
    let gate = resolve_exec_gate(&store, &repo, false, None).unwrap();
    assert!(!gate.allow_exec);
    assert!(gate.trusted);
    assert_eq!(gate.reason, GateReason::ConfiguredOff);
}

#[test]
fn withheld_hint_names_the_command_and_the_flag() {
    assert_eq!(
        withheld_hint("mytool", "trust", Some("--trust")),
        "this repository is not trusted — run \"mytool trust\" to trust it, or pass --trust for \
         this run only"
    );
    assert_eq!(
        withheld_hint("mytool", "trust", None),
        "this repository is not trusted — run \"mytool trust\" to trust it"
    );
}
