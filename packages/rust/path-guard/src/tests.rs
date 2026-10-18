use super::*;

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
fn resolve_joins_under_the_vault() {
    let dir = tempfile::tempdir().unwrap();
    let got = resolve(dir.path(), "Notes/a.md").unwrap();
    assert_eq!(got, dir.path().join("Notes/a.md"));
}

#[test]
fn resolve_allows_paths_that_do_not_exist_yet() {
    let dir = tempfile::tempdir().unwrap();
    assert!(resolve(dir.path(), "brand/new/note.md").is_ok());
}

#[cfg(unix)]
#[test]
fn resolve_catches_a_symlink_that_escapes_the_vault() {
    // The case the lexical check alone cannot see: no `..` anywhere in
    // the requested path, but the directory it names is a symlink out.
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("secret.txt"), b"secret").unwrap();
    let vault = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), vault.path().join("escape")).unwrap();

    assert!(
        validate_relative("escape/secret.txt").is_ok(),
        "lexically innocent"
    );
    assert!(
        matches!(
            resolve(vault.path(), "escape/secret.txt"),
            Err(PathError::Escapes(..))
        ),
        "containment must reject it"
    );
}

#[cfg(unix)]
#[test]
fn a_symlink_that_stays_inside_the_vault_is_fine() {
    let vault = tempfile::tempdir().unwrap();
    std::fs::create_dir(vault.path().join("real")).unwrap();
    std::fs::write(vault.path().join("real/a.md"), b"x").unwrap();
    std::os::unix::fs::symlink(vault.path().join("real"), vault.path().join("alias")).unwrap();
    assert!(resolve(vault.path(), "alias/a.md").is_ok());
}

/// `canonicalize` fails on a dangling link just as on a missing name, so the
/// walk must read the link. A write through it lands at the target.
#[cfg(unix)]
#[test]
fn resolve_refuses_a_dangling_symlink_whose_target_lands_outside() {
    let outside = tempfile::tempdir().unwrap();
    let vault = tempfile::tempdir().unwrap();
    let planted = outside.path().join("planted.json");
    std::os::unix::fs::symlink(&planted, vault.path().join("x.json")).unwrap();

    assert!(matches!(
        resolve(vault.path(), "x.json"),
        Err(PathError::Escapes(..))
    ));
    // The premise: a write through the link creates the file outside.
    std::fs::write(vault.path().join("x.json"), b"{}").unwrap();
    assert!(planted.exists(), "the premise of this test no longer holds");
}

#[cfg(unix)]
#[test]
fn resolve_reads_a_relative_dangling_target_against_the_link_directory() {
    let tmp = tempfile::tempdir().unwrap();
    let vault = tmp.path().join("vault");
    std::fs::create_dir_all(vault.join("sub")).unwrap();
    std::os::unix::fs::symlink("../new.json", vault.join("sub/in.json")).unwrap();
    std::os::unix::fs::symlink("../../planted.json", vault.join("sub/out.json")).unwrap();

    assert_eq!(
        resolve(&vault, "sub/in.json").unwrap(),
        vault.join("sub/in.json")
    );
    assert!(matches!(
        resolve(&vault, "sub/out.json"),
        Err(PathError::Escapes(..))
    ));
}

#[cfg(unix)]
#[test]
fn resolve_refuses_a_symlink_loop() {
    let vault = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink("b", vault.path().join("a")).unwrap();
    std::os::unix::fs::symlink("a", vault.path().join("b")).unwrap();
    assert!(matches!(
        resolve(vault.path(), "a"),
        Err(PathError::Escapes(..))
    ));
    assert!(!contains(vault.path(), &vault.path().join("a")));
    let looped = vault.path().join("a/x.md");
    assert_eq!(canonical_existing_prefix(&looped), looped);
}

/// A chain of `n` dangling links inside `vault`: `l0 -> l1 -> … -> end.json`.
#[cfg(unix)]
fn link_chain(vault: &Path, n: usize) {
    for i in 0..n {
        let target = if i + 1 == n {
            "end.json".to_string()
        } else {
            format!("l{}", i + 1)
        };
        std::os::unix::fs::symlink(target, vault.join(format!("l{i}"))).unwrap();
    }
}

#[cfg(unix)]
#[test]
fn resolve_follows_max_link_hops_links_and_refuses_one_more() {
    let ok = tempfile::tempdir().unwrap();
    link_chain(ok.path(), MAX_LINK_HOPS);
    assert_eq!(resolve(ok.path(), "l0").unwrap(), ok.path().join("l0"));

    let over = tempfile::tempdir().unwrap();
    link_chain(over.path(), MAX_LINK_HOPS + 1);
    assert!(matches!(
        resolve(over.path(), "l0"),
        Err(PathError::Escapes(..))
    ));
}

#[cfg(unix)]
#[test]
fn contains_follows_a_dangling_symlink_to_where_its_target_lands() {
    let tmp = tempfile::tempdir().unwrap();
    let vault = tmp.path().join("vault");
    let outside = tmp.path().join("outside");
    std::fs::create_dir_all(&vault).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    std::os::unix::fs::symlink(outside.join("planted.json"), vault.join("x.json")).unwrap();

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
    assert!(to_relative(root, Path::new("/other/a.md")).is_err());
}

#[test]
fn contains_sees_a_path_that_only_lands_inside_after_dots_fold() {
    // The spelling that used to defeat the check: `nope` does not exist,
    // so every `canonicalize` fails and the walk stops on the trailing
    // `..` — `Path::file_name` is `None` there. Left unfolded, the raw
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

#[cfg(unix)]
#[test]
fn contains_resolves_a_root_reached_through_a_symlink() {
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join("vault-b");
    std::fs::create_dir_all(&vault).unwrap();
    let alias = dir.path().join("alias");
    std::os::unix::fs::symlink(&vault, &alias).unwrap();

    // Both sides resolve, so the two spellings of one directory agree.
    assert!(contains(&vault, &alias.join("out")));
    assert!(contains(&alias, &vault.join("out")));
}

/// A `..` behind an existing SYMLINK is the case textual folding gets
/// wrong, and gets wrong in the unsafe direction: `x/link/../y` with
/// `link -> v/deep` materialises inside `v`, and a folded answer of `x/y`
/// would report it as outside. Asserted against what the filesystem
/// actually does rather than against a hand-computed expectation.
#[cfg(unix)]
#[test]
fn a_dotdot_behind_a_symlink_resolves_the_way_the_filesystem_does() {
    let tmp = tempfile::tempdir().unwrap();
    let vault = tmp.path().join("v");
    std::fs::create_dir_all(vault.join("deep")).unwrap();
    std::fs::create_dir_all(tmp.path().join("x")).unwrap();
    let link = tmp.path().join("x").join("link");
    std::os::unix::fs::symlink(vault.join("deep"), &link).unwrap();

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

#[test]
fn resolve_with_follows_a_dangling_symlink() {
    let fs = Table(
        vec![("/v", "/v")],
        vec![
            ("/v/out.json", "/outside/p.json"),
            ("/v/in.json", "new.json"),
        ],
    );
    let root = Path::new("/v");
    assert!(matches!(
        resolve_with(&fs, root, "out.json"),
        Err(PathError::Escapes(..))
    ));
    assert_eq!(
        resolve_with(&fs, root, "in.json").unwrap(),
        root.join("in.json")
    );
    assert_eq!(
        existing_prefix(&fs, Path::new("/v/in.json")).unwrap(),
        Path::new("/v/new.json")
    );
}

#[test]
fn resolve_with_rejects_a_symlink_that_leaves_the_root() {
    // `/v/escape` is a symlink to `/outside`.
    let fs = Table::new(vec![
        ("/v", "/v"),
        ("/v/escape", "/outside"),
        ("/v/escape/secret.txt", "/outside/secret.txt"),
    ]);
    let root = Path::new("/v");
    assert!(matches!(
        resolve_with(&fs, root, "escape/secret.txt"),
        Err(PathError::Escapes(..))
    ));
    assert!(
        matches!(
            resolve_with(&fs, root, "escape/new.md"),
            Err(PathError::Escapes(..))
        ),
        "a missing file behind the link escapes too"
    );
    assert_eq!(
        resolve_with(&fs, root, "Notes/a.md").unwrap(),
        root.join("Notes/a.md")
    );
}

#[test]
fn resolve_with_measures_against_the_canonical_root() {
    // The root is reached through a symlink, as `/var` -> `/private/var` on macOS.
    let fs = Table::new(vec![("/var", "/private/var"), ("/var/v", "/private/var/v")]);
    assert_eq!(
        resolve_with(&fs, Path::new("/var/v"), "a.md").unwrap(),
        Path::new("/var/v/a.md")
    );
}

#[test]
fn resolve_with_finds_a_one_component_root_under_slash() {
    let fs = Table::new(vec![("/var", "/private/var")]);
    assert_eq!(
        resolve_with(&fs, Path::new("/var"), "a.md").unwrap(),
        Path::new("/var/a.md")
    );
    assert_eq!(
        existing_prefix(&fs, Path::new("/var/a.md")).unwrap(),
        Path::new("/private/var/a.md")
    );
}

#[test]
fn existing_prefix_resolves_a_relative_path_from_its_first_component() {
    let fs = Table::new(vec![
        ("vault", "/abs/vault"),
        ("vault/sub", "/abs/vault/sub"),
    ]);
    assert_eq!(
        existing_prefix(&fs, Path::new("vault/a.md")).unwrap(),
        Path::new("/abs/vault/a.md")
    );
    assert_eq!(
        existing_prefix(&fs, Path::new("vault/sub/new/a.md")).unwrap(),
        Path::new("/abs/vault/sub/new/a.md")
    );
    assert!(contains_with(
        &fs,
        Path::new("vault"),
        Path::new("vault/new.md")
    ));
    // Nothing along it exists, so it comes back as written.
    assert_eq!(
        existing_prefix(&fs, Path::new("nope/a.md")).unwrap(),
        Path::new("nope/a.md")
    );
}

#[test]
fn contains_with_folds_a_trailing_dotdot_behind_a_missing_component() {
    // `nope` does not exist, so the physical walk stops on the `..` and the
    // fold has to finish the job.
    let fs = Table::new(vec![("/tmp", "/private/tmp"), ("/tmp/v", "/private/tmp/v")]);
    let vault = Path::new("/tmp/v");
    assert!(contains_with(&fs, vault, Path::new("/tmp/nope/../v/out")));
    assert!(!contains_with(&fs, vault, Path::new("/tmp/nope/../w/out")));
}

#[test]
fn contains_with_resolves_a_dotdot_behind_a_symlink_physically() {
    // `/x/link` -> `/v/deep`, so `/x/link/../y` is `/v/y`.
    let fs = Table::new(vec![
        ("/v", "/v"),
        ("/x", "/x"),
        ("/x/link", "/v/deep"),
        ("/x/link/..", "/v"),
    ]);
    assert!(contains_with(
        &fs,
        Path::new("/v"),
        Path::new("/x/link/../y")
    ));
}

/// Counts calls to the real filesystem.
struct Counting(std::cell::Cell<usize>);

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
fn contains_with_bounds_the_resolver_calls_however_long_the_missing_tail() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::create_dir(tmp.path().join("docs")).unwrap();
    // Under PATH_MAX on every platform, so each probe reaches the filesystem.
    let inner = tmp
        .path()
        .join(format!("{}{}", "docs/../".repeat(40), "zz/".repeat(200)));
    let fs = Counting(std::cell::Cell::new(0));
    assert!(contains_with(&fs, tmp.path(), &inner));
    assert!(fs.0.get() < 40, "{} resolver calls", fs.0.get());
}

#[test]
fn contains_with_spends_few_resolver_calls_on_each_dotdot_behind_a_missing_name() {
    let tmp = tempfile::tempdir().unwrap();
    // Each `zz/..` folds back onto the root, so the walk resumes there.
    let inner = tmp
        .path()
        .join(format!("{}{}", "zz/../".repeat(40), "zz/".repeat(200)));
    let fs = Counting(std::cell::Cell::new(0));
    assert!(contains_with(&fs, tmp.path(), &inner));
    assert!(fs.0.get() < 3 * 40, "{} resolver calls", fs.0.get());
}

/// A link target of `zz/..` pairs is walked again on every hop, so a loop of
/// such links must be refused before the hops multiply the pairs.
#[cfg(unix)]
#[test]
fn a_link_loop_through_dotdot_pairs_is_refused_within_a_fixed_number_of_calls() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("root");
    std::fs::create_dir(&root).unwrap();
    let pairs = "zz/../".repeat(160);
    std::os::unix::fs::symlink(format!("{pairs}l"), root.join("l")).unwrap();
    std::os::unix::fs::symlink(format!("{pairs}b"), root.join("a")).unwrap();
    std::os::unix::fs::symlink(format!("{pairs}a"), root.join("b")).unwrap();
    for input in ["l/x.md", "a/x.md"] {
        let fs = Counting(std::cell::Cell::new(0));
        assert!(resolve_with(&fs, &root, input).is_err(), "{input}");
        assert!(fs.0.get() < 2000, "{input}: {} resolver calls", fs.0.get());
    }
}

#[cfg(unix)]
#[test]
fn a_dangling_link_through_dotdot_pairs_costs_calls_in_proportion_to_its_target() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("root");
    std::fs::create_dir(&root).unwrap();
    let pairs = "zz/../".repeat(160);
    std::os::unix::fs::symlink(format!("{pairs}new.md"), root.join("d")).unwrap();
    let fs = Counting(std::cell::Cell::new(0));
    let got = resolve_with(&fs, &root, "d");
    assert!(got.is_ok(), "{got:?}");
    assert!(fs.0.get() < 2 * 160 + 64, "{} resolver calls", fs.0.get());
}
