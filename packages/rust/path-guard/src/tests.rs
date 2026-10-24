use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use super::guard::{fold_text, refuse_windows_names};
use super::lexical::{to_relative, validate_relative};
use super::*;

/// The guard on the real disk.
fn disk() -> Guard<StdResolver> {
    Guard::std()
}

/// `contains` on the real disk, for absolute paths.
fn contains(outer: &Path, inner: &Path) -> bool {
    disk().contains(outer, inner).unwrap()
}

/// A symlink at `link` to `target`, as `ln -s` makes one. On Windows it is a
/// directory link when the target is a directory that exists, else a file
/// link, and `/` in the target becomes `\`, as Node's `symlinkSync` does there.
fn symlink(target: impl AsRef<Path>, link: impl AsRef<Path>) {
    let (target, link) = (target.as_ref(), link.as_ref());
    #[cfg(unix)]
    std::os::unix::fs::symlink(target, link).unwrap();
    #[cfg(windows)]
    {
        let target = PathBuf::from(target.to_str().unwrap().replace('/', "\\"));
        if link.parent().unwrap().join(&target).is_dir() {
            std::os::windows::fs::symlink_dir(&target, link).unwrap();
        } else {
            std::os::windows::fs::symlink_file(&target, link).unwrap();
        }
    }
}

#[test]
fn fold_text_drops_dots_and_folds_each_dotdot_with_the_name_before_it() {
    let fold = |p: &str| fold_text(Path::new(p));
    assert_eq!(fold("a/./b/../c"), Path::new("a/c"));
    assert_eq!(fold("/a/link/m/../../../x"), Path::new("/x"));
    // A `..` at a root stays there.
    assert_eq!(fold("/a/../../b"), Path::new("/b"));
    assert_eq!(fold("/.."), Path::new("/"));
    // A leading `..` stays in a relative path.
    assert_eq!(fold("../a"), Path::new("../a"));
    assert_eq!(fold("a/../../b"), Path::new("../b"));
    assert_eq!(fold("./../x"), Path::new("../x"));
    assert_eq!(fold("./x"), Path::new("./x"));
    assert_eq!(fold("a/.."), Path::new(""));
}

#[cfg(windows)]
#[test]
fn fold_text_reads_drives_and_shares_as_roots() {
    let fold = |p: &str| fold_text(Path::new(p));
    assert_eq!(fold(r"C:\v\r\link\m\..\..\..\x"), Path::new(r"C:\v\x"));
    assert_eq!(fold(r"C:\..\x"), Path::new(r"C:\x"));
    assert_eq!(fold(r"\\srv\share\..\x"), Path::new(r"\\srv\share\x"));
    // `C:` alone is the working directory on drive C, so `C:..` is its parent.
    assert_eq!(fold(r"C:..\x"), Path::new(r"C:..\x"));
    assert_eq!(fold(r"C:a\..\..\x"), Path::new(r"C:..\x"));
}

/// T-02's example. Windows folds `..` as text before it follows a link, so
/// `link\m\..\..\..\x` is two levels above `link`'s directory, outside the
/// root, although `link` points deeper into it.
#[cfg(windows)]
#[test]
fn windows_folds_a_dotdot_as_text_before_it_follows_a_link() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join(r"v\r");
    std::fs::create_dir_all(root.join(r"a\b\c")).unwrap();
    symlink(root.join(r"a\b\c"), root.join("link"));
    // A dangling link whose target takes the same route.
    symlink(r"link\m\..\..\..\planted.json", root.join("x.json"));

    let inner = root.join(r"link\m\..\..\..\x");
    assert!(!contains(&root, &inner), "{}", inner.display());
    assert!(matches!(
        disk().resolve(&root, "x.json"),
        Err(PathError::Escapes(..))
    ));

    // Where Windows puts them, so the assertions above cannot drift into
    // agreeing with a wrong expectation.
    std::fs::create_dir_all(&inner).unwrap();
    assert!(
        tmp.path().join(r"v\x").is_dir(),
        "the premise no longer holds"
    );
    std::fs::write(root.join("x.json"), b"{}").unwrap();
    assert!(
        tmp.path().join(r"v\planted.json").is_file(),
        "the premise no longer holds"
    );
}

#[test]
fn accepts_ordinary_vault_paths() {
    assert_eq!(validate_relative("Notes/a.md").unwrap(), "Notes/a.md");
    assert_eq!(
        validate_relative("_system/ocr.md").unwrap(),
        "_system/ocr.md"
    );
    assert_eq!(validate_relative("a/b/").unwrap(), "a/b");
}

#[test]
fn accepts_names_that_merely_contain_dots() {
    // A `!p.contains("..")` check rejects these.
    assert!(validate_relative("My ..dotfiles note.md").is_ok());
    assert!(validate_relative("Notes/v1..2 comparison.md").is_ok());
}

#[test]
fn rejects_traversal_in_every_spelling() {
    assert_eq!(
        validate_relative("../etc/passwd"),
        Err(PathError::ParentSegment("../etc/passwd".into()))
    );
    assert_eq!(
        validate_relative("Notes/../../etc/passwd"),
        Err(PathError::ParentSegment("Notes/../../etc/passwd".into()))
    );
    assert_eq!(
        validate_relative("Notes\\..\\..\\etc"),
        Err(PathError::ParentSegment("Notes\\..\\..\\etc".into()))
    );
}

#[test]
fn rejects_absolute_tilde_drive_unc_and_nul() {
    assert!(matches!(
        validate_relative("/etc/passwd"),
        Err(PathError::Absolute(_))
    ));
    assert!(matches!(
        validate_relative("\\etc\\passwd"),
        Err(PathError::Absolute(_))
    ));
    assert!(matches!(
        validate_relative("~/.ssh/id_rsa"),
        Err(PathError::Tilde(_))
    ));
    assert!(matches!(
        validate_relative("C:\\Windows"),
        Err(PathError::WindowsPath(_))
    ));
    assert!(matches!(
        validate_relative("C:/Windows"),
        Err(PathError::WindowsPath(_))
    ));
    assert!(matches!(
        validate_relative("\\\\srv\\share"),
        Err(PathError::WindowsPath(_))
    ));
    assert_eq!(validate_relative("a\0b"), Err(PathError::Nul));
    assert_eq!(validate_relative(""), Err(PathError::Empty));
}

#[test]
fn rejects_degenerate_segments() {
    assert!(matches!(
        validate_relative("a//b"),
        Err(PathError::DegenerateSegment(_))
    ));
    assert!(matches!(
        validate_relative("./a"),
        Err(PathError::DegenerateSegment(_))
    ));
    assert!(matches!(
        validate_relative("a/./b"),
        Err(PathError::DegenerateSegment(_))
    ));
}

#[test]
fn on_windows_the_guard_refuses_the_first_device_name_or_stream() {
    assert_eq!(
        refuse_windows_names("NUL/a:b", true),
        Err(PathError::ReservedName("NUL".into()))
    );
    assert_eq!(
        refuse_windows_names("a/b:c.txt", true),
        Err(PathError::AlternateStream("b:c.txt".into()))
    );
    assert_eq!(refuse_windows_names("console", true), Ok(Vec::new()));
}

#[test]
fn off_windows_the_guard_keeps_every_device_name_and_stream_as_a_warning() {
    let got = refuse_windows_names("NUL/a:b", false).unwrap();
    assert_eq!(
        got,
        [
            PathWarning {
                kind: PathWarningKind::ReservedName,
                segment: "NUL".into()
            },
            PathWarning {
                kind: PathWarningKind::AlternateStream,
                segment: "a:b".into()
            },
        ]
    );
}

/// A guard on the real disk that records each warning it sends.
fn recording() -> (Guard<StdResolver>, Arc<Mutex<Vec<PathWarning>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::clone(&seen);
    let guard = disk().with_warning_handler(move |w| log.lock().unwrap().push(w.clone()));
    (guard, seen)
}

#[test]
fn resolve_sends_each_warning_to_the_handler_off_windows() {
    let dir = tempfile::tempdir().unwrap();
    let (guard, seen) = recording();
    let got = guard.resolve(dir.path(), "NUL/a:b");
    if cfg!(windows) {
        assert_eq!(got, Err(PathError::ReservedName("NUL".into())));
        assert!(seen.lock().unwrap().is_empty(), "refused, so no warning");
    } else {
        assert_eq!(got.unwrap(), dir.path().join("NUL/a:b"));
        let kinds: Vec<_> = seen.lock().unwrap().iter().map(|w| w.kind).collect();
        assert_eq!(
            kinds,
            [
                PathWarningKind::ReservedName,
                PathWarningKind::AlternateStream
            ]
        );
    }
    // A clone shares the handler.
    let again = guard.clone().resolve(dir.path(), "aux");
    assert_eq!(again.is_ok(), !cfg!(windows));
    let sent = seen.lock().unwrap().len();
    assert_eq!(sent, if cfg!(windows) { 0 } else { 3 });
}

#[test]
fn resolve_sends_no_warning_for_a_path_it_refuses() {
    let outside = tempfile::tempdir().unwrap();
    let vault = tempfile::tempdir().unwrap();
    symlink(outside.path(), vault.path().join("escape"));
    let (guard, seen) = recording();
    assert!(guard.resolve(vault.path(), "escape/NUL").is_err());
    assert!(guard.resolve(vault.path(), "../NUL").is_err());
    assert!(seen.lock().unwrap().is_empty());
}

/// The crate never writes to the console, handler or not.
#[test]
fn the_crate_prints_nothing() {
    for (name, src) in [
        ("lib.rs", include_str!("lib.rs")),
        ("guard.rs", include_str!("guard.rs")),
        ("lexical.rs", include_str!("lexical.rs")),
    ] {
        for call in ["print!", "eprint", "dbg!", "stdout", "stderr"] {
            assert!(!src.contains(call), "{name} calls {call}");
        }
    }
}

#[test]
fn a_guard_is_clone_send_and_sync() {
    fn check<T: Clone + Send + Sync>() {}
    check::<Guard<StdResolver>>();
    check::<Guard<&StdResolver>>();
    check::<Guard<Arc<StdResolver>>>();
}

#[test]
fn the_guard_refuses_relative_and_empty_arguments() {
    let g = disk();
    let rel = Path::new("v");
    assert_eq!(
        g.resolve(Path::new(""), "a"),
        Err(PathError::EmptyRoot { argument: "root" })
    );
    assert_eq!(
        g.resolve(rel, "a"),
        Err(PathError::NotAbsolute {
            argument: "root",
            path: rel.into()
        })
    );
    assert!(matches!(
        g.contains(&std::env::temp_dir(), rel),
        Err(PathError::NotAbsolute {
            argument: "inner",
            ..
        })
    ));
    assert_eq!(
        g.contains(Path::new(""), rel),
        Err(PathError::EmptyRoot { argument: "outer" })
    );
    assert_eq!(
        g.real_path(Path::new("")),
        Err(PathError::NotAbsolute {
            argument: "path",
            path: PathBuf::new()
        })
    );
}

#[test]
fn resolve_joins_under_the_vault() {
    let dir = tempfile::tempdir().unwrap();
    let got = disk().resolve(dir.path(), "Notes/a.md").unwrap();
    assert_eq!(got, dir.path().join("Notes/a.md"));
}

#[test]
fn resolve_allows_paths_that_do_not_exist_yet() {
    let dir = tempfile::tempdir().unwrap();
    assert!(disk().resolve(dir.path(), "brand/new/note.md").is_ok());
}

#[test]
fn resolve_catches_a_symlink_that_escapes_the_vault() {
    // The case the lexical check alone cannot see: no `..` anywhere in
    // the requested path, but the directory it names is a symlink out.
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("secret.txt"), b"secret").unwrap();
    let vault = tempfile::tempdir().unwrap();
    symlink(outside.path(), vault.path().join("escape"));

    assert!(
        validate_relative("escape/secret.txt").is_ok(),
        "lexically innocent"
    );
    assert!(
        matches!(
            disk().resolve(vault.path(), "escape/secret.txt"),
            Err(PathError::Escapes(..))
        ),
        "containment must reject it"
    );
}

#[test]
fn a_symlink_that_stays_inside_the_vault_is_fine() {
    let vault = tempfile::tempdir().unwrap();
    std::fs::create_dir(vault.path().join("real")).unwrap();
    std::fs::write(vault.path().join("real/a.md"), b"x").unwrap();
    symlink(vault.path().join("real"), vault.path().join("alias"));
    assert!(disk().resolve(vault.path(), "alias/a.md").is_ok());
}

/// `canonicalize` fails on a dangling link just as on a missing name, so the
/// walk must read the link. A write through it lands at the target.
#[test]
fn resolve_refuses_a_dangling_symlink_whose_target_lands_outside() {
    let outside = tempfile::tempdir().unwrap();
    let vault = tempfile::tempdir().unwrap();
    let planted = outside.path().join("planted.json");
    symlink(&planted, vault.path().join("x.json"));

    assert!(matches!(
        disk().resolve(vault.path(), "x.json"),
        Err(PathError::Escapes(..))
    ));
    // The premise: a write through the link creates the file outside.
    std::fs::write(vault.path().join("x.json"), b"{}").unwrap();
    assert!(planted.exists(), "the premise of this test no longer holds");
}

#[test]
fn resolve_reads_a_relative_dangling_target_against_the_link_directory() {
    let tmp = tempfile::tempdir().unwrap();
    let vault = tmp.path().join("vault");
    std::fs::create_dir_all(vault.join("sub")).unwrap();
    symlink("../new.json", vault.join("sub/in.json"));
    symlink("../../planted.json", vault.join("sub/out.json"));

    assert_eq!(
        disk().resolve(&vault, "sub/in.json").unwrap(),
        vault.join("sub/in.json")
    );
    assert!(matches!(
        disk().resolve(&vault, "sub/out.json"),
        Err(PathError::Escapes(..))
    ));
}

#[test]
fn a_symlink_loop_is_unresolvable() {
    let vault = tempfile::tempdir().unwrap();
    symlink("b", vault.path().join("a"));
    symlink("a", vault.path().join("b"));
    assert_eq!(
        disk().resolve(vault.path(), "a"),
        Err(PathError::Unresolvable("a".into()))
    );
    assert!(!contains(vault.path(), &vault.path().join("a")));
    let looped = vault.path().join("a/x.md");
    assert_eq!(disk().real_path(&looped).unwrap(), looped);
}

/// A chain of `n` dangling links inside `vault`: `l0 -> l1 -> … -> end.json`.
fn link_chain(vault: &Path, n: usize) {
    for i in 0..n {
        let target = if i + 1 == n {
            "end.json".to_string()
        } else {
            format!("l{}", i + 1)
        };
        symlink(target, vault.join(format!("l{i}")));
    }
}

#[test]
fn resolve_follows_max_link_hops_links_and_refuses_one_more() {
    let ok = tempfile::tempdir().unwrap();
    link_chain(ok.path(), MAX_LINK_HOPS);
    assert_eq!(
        disk().resolve(ok.path(), "l0").unwrap(),
        ok.path().join("l0")
    );

    let over = tempfile::tempdir().unwrap();
    link_chain(over.path(), MAX_LINK_HOPS + 1);
    assert!(matches!(
        disk().resolve(over.path(), "l0"),
        Err(PathError::Unresolvable(_))
    ));
}

#[test]
fn contains_follows_a_dangling_symlink_to_where_its_target_lands() {
    let tmp = tempfile::tempdir().unwrap();
    let vault = tmp.path().join("vault");
    let outside = tmp.path().join("outside");
    std::fs::create_dir_all(&vault).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    symlink(outside.join("planted.json"), vault.join("x.json"));

    assert!(!contains(&vault, &vault.join("x.json")));
    assert!(contains(&outside, &vault.join("x.json")));
}

#[test]
fn to_relative_uses_forward_slashes() {
    let root = Path::new("/v");
    assert_eq!(
        to_relative(root, Path::new("/v/Notes/a.md")).unwrap(),
        "Notes/a.md"
    );
    assert!(matches!(
        to_relative(root, Path::new("/other/a.md")),
        Err(PathError::NotUnderRoot(..))
    ));
}

#[test]
fn contains_sees_a_path_that_only_lands_inside_after_dots_fold() {
    // A spelling that can defeat the check: `nope` does not exist, so
    // every `canonicalize` fails and the walk stops on the trailing `..`,
    // where `Path::file_name` is `None`. Left unfolded, the raw
    // `/var/…` spelling compares unequal to the canonical `/private/var/…`
    // root and the check passes a path that materialises inside it.
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join("vault-b");
    std::fs::create_dir_all(&vault).unwrap();
    let sneaky = dir.path().join("nope/../vault-b/out");

    assert!(contains(&vault, &sneaky), "{}", sneaky.display());
    std::fs::create_dir_all(&sneaky).unwrap();
    assert!(
        std::fs::canonicalize(&sneaky)
            .unwrap()
            .starts_with(std::fs::canonicalize(&vault).unwrap()),
        "the materialised directory really is inside the vault"
    );
}

#[test]
fn contains_is_component_wise_so_a_name_prefix_is_not_a_parent() {
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join("vault-b");
    let sibling = dir.path().join("vault-bee");
    std::fs::create_dir_all(&vault).unwrap();
    std::fs::create_dir_all(&sibling).unwrap();

    assert!(contains(&vault, &vault), "a root contains itself");
    assert!(contains(&vault, &vault.join("out/deep")));
    assert!(!contains(&vault, &sibling.join("out")));
}

#[test]
fn contains_resolves_a_root_reached_through_a_symlink() {
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join("vault-b");
    std::fs::create_dir_all(&vault).unwrap();
    let alias = dir.path().join("alias");
    symlink(&vault, &alias);

    // Both sides resolve, so the two spellings of one directory agree.
    assert!(contains(&vault, &alias.join("out")));
    assert!(contains(&alias, &vault.join("out")));
}

/// A `..` behind an existing symlink is the case textual folding gets
/// wrong, in the unsafe direction: `x/link/../y` with `link -> v/deep`
/// is created inside `v`, and a folded answer of `x/y` would report it as
/// outside. Asserted against what the filesystem does rather than against a
/// hand-computed expectation.
#[cfg(unix)]
#[test]
fn a_dotdot_behind_a_symlink_resolves_the_way_the_filesystem_does() {
    let tmp = tempfile::tempdir().unwrap();
    let vault = tmp.path().join("v");
    std::fs::create_dir_all(vault.join("deep")).unwrap();
    std::fs::create_dir_all(tmp.path().join("x")).unwrap();
    let link = tmp.path().join("x").join("link");
    symlink(vault.join("deep"), &link);

    let inner = link.join("..").join("y");
    assert!(
        contains(&vault, &inner),
        "`{}` materialises inside the vault and must be reported as inside",
        inner.display()
    );

    // The filesystem's own verdict, so the assertion above cannot drift
    // into agreeing with a wrong expectation.
    std::fs::create_dir_all(&inner).unwrap();
    assert!(
        std::fs::canonicalize(&inner)
            .unwrap()
            .starts_with(std::fs::canonicalize(&vault).unwrap()),
        "the premise of this test no longer holds"
    );
}

type Entries = Vec<(&'static str, &'static str)>;

/// A [`Resolver`] over fixed tables. In the first, `/` and each key exist, and
/// a key canonicalises to its value; every other path does not exist. It must
/// list each ancestor of its keys, as the [`Resolver`] contract requires. In
/// the second, each key is a symlink whose target text is its value; list a
/// link in the first table too when its target exists.
struct Table(Entries, Entries);

impl Table {
    fn new(entries: Entries) -> Self {
        Self(entries, Vec::new())
    }
}

fn lookup(entries: &Entries, p: &Path) -> io::Result<PathBuf> {
    entries
        .iter()
        .find(|(from, _)| Path::new(from) == p)
        .map(|(_, to)| PathBuf::from(to))
        .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))
}

impl Resolver for Table {
    fn canonicalize(&self, p: &Path) -> io::Result<PathBuf> {
        if p == Path::new("/") {
            return Ok(PathBuf::from("/"));
        }
        lookup(&self.0, p)
    }

    fn read_link(&self, p: &Path) -> io::Result<PathBuf> {
        lookup(&self.1, p)
    }
}

// The in-memory tests below use POSIX roots such as `/v`, which a guard on
// Windows refuses as not absolute, so they run on Unix. The Windows tests
// further down use drive and share roots.

#[cfg(unix)]
#[test]
fn a_guard_follows_a_dangling_symlink_in_memory() {
    let fs = Table(
        vec![("/v", "/v")],
        vec![
            ("/v/out.json", "/outside/p.json"),
            ("/v/in.json", "new.json"),
        ],
    );
    let root = Path::new("/v");
    let guard = Guard::new(&fs);
    assert!(matches!(
        guard.resolve(root, "out.json"),
        Err(PathError::Escapes(..))
    ));
    assert_eq!(
        guard.resolve(root, "in.json").unwrap(),
        root.join("in.json")
    );
    assert_eq!(
        guard.real_path(Path::new("/v/in.json")).unwrap(),
        Path::new("/v/new.json")
    );
}

#[cfg(unix)]
#[test]
fn a_guard_rejects_a_symlink_that_leaves_the_root_in_memory() {
    // `/v/escape` is a symlink to `/outside`.
    let fs = Table::new(vec![
        ("/v", "/v"),
        ("/v/escape", "/outside"),
        ("/v/escape/secret.txt", "/outside/secret.txt"),
    ]);
    let root = Path::new("/v");
    let guard = Guard::new(fs);
    assert!(matches!(
        guard.resolve(root, "escape/secret.txt"),
        Err(PathError::Escapes(..))
    ));
    assert!(
        matches!(
            guard.resolve(root, "escape/new.md"),
            Err(PathError::Escapes(..))
        ),
        "a missing file behind the link escapes too"
    );
    assert_eq!(
        guard.resolve(root, "Notes/a.md").unwrap(),
        root.join("Notes/a.md")
    );
}

#[cfg(unix)]
#[test]
fn a_guard_measures_against_the_canonical_root() {
    // The root is reached through a symlink, as `/var` -> `/private/var` on macOS.
    let fs = Table::new(vec![("/var", "/private/var"), ("/var/v", "/private/var/v")]);
    assert_eq!(
        Guard::new(fs).resolve(Path::new("/var/v"), "a.md").unwrap(),
        Path::new("/var/v/a.md")
    );
}

#[cfg(unix)]
#[test]
fn a_guard_finds_a_one_component_root_under_slash() {
    let fs = Table::new(vec![("/var", "/private/var")]);
    assert_eq!(
        Guard::new(&fs).resolve(Path::new("/var"), "a.md").unwrap(),
        Path::new("/var/a.md")
    );
    assert_eq!(
        super::guard::existing_prefix(&fs, Path::new("/var/a.md")).unwrap(),
        Path::new("/private/var/a.md")
    );
}

#[cfg(unix)]
#[test]
fn contains_folds_a_trailing_dotdot_behind_a_missing_component() {
    // `nope` does not exist, so the physical walk stops on the `..` and the
    // fold has to finish the job.
    let fs = Table::new(vec![("/tmp", "/private/tmp"), ("/tmp/v", "/private/tmp/v")]);
    let guard = Guard::new(fs);
    let vault = Path::new("/tmp/v");
    assert_eq!(
        guard.contains(vault, Path::new("/tmp/nope/../v/out")),
        Ok(true)
    );
    assert_eq!(
        guard.contains(vault, Path::new("/tmp/nope/../w/out")),
        Ok(false)
    );
}

/// The POSIX rule. Windows folds the `..` first; see the next test.
#[cfg(unix)]
#[test]
fn contains_resolves_a_dotdot_behind_a_symlink_physically() {
    // `/x/link` -> `/v/deep`, so `/x/link/../y` is `/v/y`.
    let fs = Table::new(vec![
        ("/v", "/v"),
        ("/x", "/x"),
        ("/x/link", "/v/deep"),
        ("/x/link/..", "/v"),
    ]);
    assert_eq!(
        Guard::new(fs).contains(Path::new("/v"), Path::new("/x/link/../y")),
        Ok(true)
    );
}

#[cfg(windows)]
#[test]
fn contains_folds_a_dotdot_as_text_before_it_follows_a_link() {
    // On Unix `link/..` would be the parent of the link's target.
    let fs = Table::new(vec![
        (r"C:\", r"C:\"),
        (r"C:\v", r"C:\v"),
        (r"C:\v\link", r"C:\out"),
        (r"C:\x", r"C:\x"),
        (r"C:\x\link", r"C:\v\deep"),
    ]);
    let guard = Guard::new(fs);
    assert_eq!(
        guard.contains(Path::new(r"C:\v"), Path::new(r"C:\v\link\..\y")),
        Ok(true)
    );
    assert_eq!(
        guard.contains(Path::new(r"C:\v"), Path::new(r"C:\x\link\..\y")),
        Ok(false)
    );
}

/// A resolver that breaks the [`Resolver`] contract: it answers the empty
/// path for the root and its parents, and `/etc` for a link out of the root.
/// An empty real root would hold every path, so the guard must refuse.
struct EmptyRealRoot;

impl Resolver for EmptyRealRoot {
    fn canonicalize(&self, p: &Path) -> io::Result<PathBuf> {
        let root = std::env::temp_dir();
        if root.starts_with(p) {
            Ok(PathBuf::new())
        } else if p.starts_with(root.join("out")) {
            let rest = p.strip_prefix(root.join("out")).unwrap();
            Ok(cwd_root().join("etc").join(rest))
        } else {
            Err(io::Error::from(io::ErrorKind::NotFound))
        }
    }

    fn read_link(&self, _: &Path) -> io::Result<PathBuf> {
        Err(io::Error::from(io::ErrorKind::NotFound))
    }
}

#[test]
fn a_root_whose_real_path_is_not_absolute_holds_nothing() {
    let guard = Guard::new(EmptyRealRoot);
    let root = std::env::temp_dir();
    assert!(matches!(
        guard.resolve(&root, "out/passwd"),
        Err(PathError::Escapes(..))
    ));
    assert!(matches!(
        guard.resolve(&root, "new.md"),
        Err(PathError::Escapes(..))
    ));
    assert_eq!(guard.contains(&root, &root.join("out/passwd")), Ok(false));
    // The answer is always absolute: a real path that is not falls back to
    // the text fold.
    assert_eq!(guard.real_path(&root).unwrap(), root);
}

/// A resolver that answers a real path with a `..` in it: `<tmp>/v/x` is
/// `<tmp>/v/../etc`. The guard must not trust it.
struct DotDotAnswer;

impl Resolver for DotDotAnswer {
    fn canonicalize(&self, p: &Path) -> io::Result<PathBuf> {
        let root = std::env::temp_dir().join("v");
        if root.starts_with(p) {
            Ok(p.to_path_buf())
        } else if p.starts_with(root.join("x")) {
            let rest = p.strip_prefix(root.join("x")).unwrap();
            Ok(root.join("../etc").join(rest))
        } else {
            Err(io::Error::from(io::ErrorKind::NotFound))
        }
    }

    fn read_link(&self, _: &Path) -> io::Result<PathBuf> {
        Err(io::Error::from(io::ErrorKind::NotFound))
    }
}

#[test]
fn a_real_path_with_a_dotdot_is_not_trusted() {
    let guard = Guard::new(DotDotAnswer);
    let root = std::env::temp_dir().join("v");
    assert!(matches!(
        guard.resolve(&root, "x"),
        Err(PathError::Escapes(..))
    ));
    assert!(matches!(
        guard.resolve(&root, "x/passwd"),
        Err(PathError::Escapes(..))
    ));
    assert_eq!(guard.contains(&root, &root.join("x")), Ok(false));
    // The text fold, never the resolver's `..`.
    assert_eq!(guard.real_path(&root.join("x")).unwrap(), root.join("x"));
}

/// A resolver that answers `<tmp>/v/y` as `<tmp>/v/./y`. `Path::components`
/// drops that `.`, so the guard must read the text.
struct DotAnswer;

impl Resolver for DotAnswer {
    fn canonicalize(&self, p: &Path) -> io::Result<PathBuf> {
        let root = std::env::temp_dir().join("v");
        if root.starts_with(p) {
            Ok(p.to_path_buf())
        } else if p == root.join("y") {
            let mut dotted = root.into_os_string();
            dotted.push("/./y");
            Ok(dotted.into())
        } else {
            Err(io::Error::from(io::ErrorKind::NotFound))
        }
    }

    fn read_link(&self, _: &Path) -> io::Result<PathBuf> {
        Err(io::Error::from(io::ErrorKind::NotFound))
    }
}

#[test]
fn a_real_path_with_a_dot_is_not_trusted() {
    let guard = Guard::new(DotAnswer);
    let root = std::env::temp_dir().join("v");
    assert!(matches!(
        guard.resolve(&root, "y"),
        Err(PathError::Escapes(..))
    ));
    assert_eq!(guard.contains(&root, &root.join("y")), Ok(false));
    assert_eq!(guard.real_path(&root.join("y")).unwrap(), root.join("y"));
}

#[cfg(windows)]
#[test]
fn a_device_or_verbatim_prefix_is_canonical() {
    for p in [
        r"\\.\COM1",
        r"\\?\C:\",
        r"\\?\C:\v",
        r"\\?\UNC\nas\vault",
        r"C:\v",
    ] {
        assert!(super::guard::canonical(Path::new(p)), "{p}");
    }
    assert!(!super::guard::canonical(Path::new(r"C:\v\.\x")));
    assert!(!super::guard::canonical(Path::new(r"\\?\C:\v\..\x")));
}

/// `/v` and `\v` have a root but no drive, so a guard on Windows reads them
/// as relative.
#[cfg(windows)]
#[test]
fn a_rooted_path_without_a_drive_is_not_absolute_on_windows() {
    struct Nothing;
    impl Resolver for Nothing {
        fn canonicalize(&self, _: &Path) -> io::Result<PathBuf> {
            Err(io::Error::from(io::ErrorKind::NotFound))
        }
        fn read_link(&self, _: &Path) -> io::Result<PathBuf> {
            Err(io::Error::from(io::ErrorKind::NotFound))
        }
    }
    let guard = Guard::new(Nothing);
    for p in ["/v", r"\v"] {
        let p = Path::new(p);
        let refused = |r: Result<(), PathError>| matches!(r, Err(PathError::NotAbsolute { .. }));
        assert!(refused(guard.resolve(p, "a").map(drop)), "{}", p.display());
        assert!(
            refused(guard.contains(p, Path::new(r"C:\v")).map(drop)),
            "{}",
            p.display()
        );
        assert!(
            refused(guard.contains(Path::new(r"C:\v"), p).map(drop)),
            "{}",
            p.display()
        );
        assert!(refused(guard.real_path(p).map(drop)), "{}", p.display());
    }
}

/// Counts calls to the real filesystem.
struct Counting(std::cell::Cell<usize>);

impl Counting {
    fn new() -> Self {
        Self(std::cell::Cell::new(0))
    }
}

impl Resolver for Counting {
    fn canonicalize(&self, p: &Path) -> io::Result<PathBuf> {
        self.0.set(self.0.get() + 1);
        std::fs::canonicalize(p)
    }

    fn read_link(&self, p: &Path) -> io::Result<PathBuf> {
        self.0.set(self.0.get() + 1);
        std::fs::read_link(p)
    }
}

#[test]
fn contains_bounds_the_resolver_calls_however_long_the_missing_tail() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::create_dir(tmp.path().join("docs")).unwrap();
    // Under PATH_MAX on every platform, so each probe reaches the filesystem.
    let inner = tmp
        .path()
        .join(format!("{}{}", "docs/../".repeat(40), "zz/".repeat(200)));
    let fs = Counting::new();
    assert_eq!(Guard::new(&fs).contains(tmp.path(), &inner), Ok(true));
    assert!(fs.0.get() < 40, "{} resolver calls", fs.0.get());
}

#[test]
fn contains_spends_few_resolver_calls_on_each_dotdot_behind_a_missing_name() {
    let tmp = tempfile::tempdir().unwrap();
    // Each `zz/..` folds back onto the root, so the walk resumes there.
    let inner = tmp
        .path()
        .join(format!("{}{}", "zz/../".repeat(40), "zz/".repeat(200)));
    let fs = Counting::new();
    assert_eq!(Guard::new(&fs).contains(tmp.path(), &inner), Ok(true));
    assert!(fs.0.get() < 3 * 40, "{} resolver calls", fs.0.get());
}

/// A link target of `zz/..` pairs is walked again on every hop, so a loop of
/// such links must be refused before the hops multiply the pairs.
#[test]
fn a_link_loop_through_dotdot_pairs_is_refused_within_a_fixed_number_of_calls() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("root");
    std::fs::create_dir(&root).unwrap();
    let pairs = "zz/../".repeat(160);
    symlink(format!("{pairs}l"), root.join("l"));
    symlink(format!("{pairs}b"), root.join("a"));
    symlink(format!("{pairs}a"), root.join("b"));
    for input in ["l/x.md", "a/x.md"] {
        let fs = Counting::new();
        assert!(
            matches!(
                Guard::new(&fs).resolve(&root, input),
                Err(PathError::Unresolvable(_))
            ),
            "{input}"
        );
        assert!(fs.0.get() < 2000, "{input}: {} resolver calls", fs.0.get());
    }
}

#[test]
fn a_dangling_link_through_dotdot_pairs_costs_calls_in_proportion_to_its_target() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("root");
    std::fs::create_dir(&root).unwrap();
    let pairs = "zz/../".repeat(160);
    symlink(format!("{pairs}new.md"), root.join("d"));
    let fs = Counting::new();
    let got = Guard::new(&fs).resolve(&root, "d");
    assert!(got.is_ok(), "{got:?}");
    assert!(fs.0.get() < 2 * 160 + 64, "{} resolver calls", fs.0.get());
}

/// The root of the current directory: `/` on Unix, the drive root, such as
/// `C:\`, on Windows.
fn cwd_root() -> PathBuf {
    let cwd = std::env::current_dir().unwrap();
    cwd.ancestors().last().unwrap().to_path_buf()
}

/// The `\\?\` form `canonicalize` returns on Windows, given by the caller.
#[cfg(windows)]
#[test]
fn a_link_right_under_a_verbatim_drive_root_is_followed() {
    let fs = Table(
        vec![(r"\\?\C:\", r"\\?\C:\")],
        vec![(r"\\?\C:\link", r"\\?\D:\x")],
    );
    let guard = Guard::new(fs);
    let root = Path::new(r"\\?\C:\");
    assert_eq!(guard.contains(root, Path::new(r"\\?\C:\link\y")), Ok(false));
    assert!(matches!(
        guard.resolve(root, "link"),
        Err(PathError::Escapes(..))
    ));
    assert_eq!(guard.contains(root, Path::new(r"\\?\C:\new\f")), Ok(true));
    assert!(guard.resolve(root, "new.md").is_ok());
}

#[cfg(windows)]
#[test]
fn a_chain_of_verbatim_links_is_followed_to_its_end() {
    let fs = Table(
        vec![
            (r"\\?\C:\", r"\\?\C:\"),
            (r"\\?\C:\v", r"\\?\C:\v"),
            (r"\\?\C:\v\r", r"\\?\C:\v\r"),
        ],
        vec![
            (r"\\?\C:\v\r\l0", r"\\?\C:\v\r\l1"),
            (r"\\?\C:\v\r\l1", r"\\?\D:\out"),
            (r"\\?\C:\v\r\l2", r"\\?\C:\v\r\l3"),
            (r"\\?\C:\v\r\l3", "new.json"),
        ],
    );
    let guard = Guard::new(fs);
    let root = Path::new(r"\\?\C:\v\r");
    assert!(matches!(
        guard.resolve(root, "l0"),
        Err(PathError::Escapes(..))
    ));
    assert!(guard.resolve(root, "l2").is_ok());
}

#[cfg(windows)]
#[test]
fn a_share_root_follows_a_link_right_under_it() {
    // Links are keyed by the real path the walk reads them at.
    let links = || {
        vec![
            (r"\\?\UNC\nas\vault\out.json", r"C:\Windows\x.json"),
            (r"\\?\UNC\nas\vault\in.json", "new.json"),
        ]
    };
    for root in [r"\\nas\vault", r"\\?\UNC\nas\vault"] {
        // A verbatim share with no trailing `\` has no root component, so the
        // walk asks about it both with and without one, as the real
        // filesystem answers either.
        let guard = Guard::new(Table(
            vec![
                (root, r"\\?\UNC\nas\vault"),
                (r"\\?\UNC\nas\vault\", r"\\?\UNC\nas\vault"),
            ],
            links(),
        ));
        let root = Path::new(root);
        assert!(
            matches!(guard.resolve(root, "out.json"), Err(PathError::Escapes(..))),
            "{}",
            root.display()
        );
        assert!(guard.resolve(root, "in.json").is_ok(), "{}", root.display());
        assert!(
            guard.resolve(root, "new/a.md").is_ok(),
            "{}",
            root.display()
        );
    }
}

/// A new path under a drive root compares by the root's real path. Reads
/// only; nothing is written at the drive root.
#[cfg(windows)]
#[test]
fn a_new_path_under_a_drive_root_is_inside_it() {
    let root = cwd_root();
    let missing = root.join(format!("path-guard-no-such-dir-{}", std::process::id()));
    assert!(!missing.exists());
    assert!(contains(&root, &missing.join("x")));
    let name = missing.file_name().unwrap().to_str().unwrap();
    assert!(disk().resolve(&root, &format!("{name}/x.md")).is_ok());
}
