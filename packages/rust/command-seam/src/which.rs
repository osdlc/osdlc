//! `which`: the lookup a spawn does, without spawning.

use std::env;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};

/// `_PATH_DEFPATH` of `<paths.h>`; glibc's `execvp` uses `/bin:/usr/bin`.
const DEFAULT_PATH: &str = "/usr/bin:/bin";

/// Finds the executable `binary` would run as.
///
/// A name with a path separator is a path, resolved against `cwd` (the
/// current directory when `None`). Any other name is searched for in each
/// `PATH` entry in order: `path` when given, else the parent's `PATH`, else
/// `/usr/bin:/bin`. An empty or relative entry is resolved against `cwd`, so
/// `~` is a folder named `~` there, as `execvp` reads it. `None` when nothing
/// matches, or `binary` is empty or ends in a separator.
///
/// The executable test is the [`which`](::which) crate's: on unix a regular
/// file that `access(X_OK)` allows; on Windows it also tries each `PATHEXT`.
pub fn which(
    binary: impl AsRef<OsStr>,
    cwd: Option<&Path>,
    path: Option<&OsStr>,
) -> Option<PathBuf> {
    let binary = binary.as_ref();
    // A name that ends in a separator names a folder, which nothing runs. The
    // crate would drop the separator and test the file before it.
    if binary.is_empty() || binary.to_string_lossy().ends_with(std::path::is_separator) {
        return None;
    }
    let cwd = match cwd {
        Some(c) => c.to_path_buf(),
        None => env::current_dir().ok()?,
    };
    // The crate gets one path at a time, which it resolves against `cwd`. A
    // list it would resolve against the process's directory, expanding `~`,
    // and a list cannot hold an entry containing the list separator.
    let found = |name: PathBuf| ::which::which_in(name, None::<&OsStr>, &cwd).ok();
    if binary.to_string_lossy().contains(std::path::is_separator) {
        return found(binary.into());
    }
    let path: OsString = match path {
        Some(p) => p.to_os_string(),
        None => env::var_os("PATH").unwrap_or_else(|| DEFAULT_PATH.into()),
    };
    // `./` in front makes the candidate a path under an empty entry too.
    env::split_paths(&path).find_map(|dir| found(Path::new(".").join(dir).join(binary)))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::TempDir;

    struct Fixture {
        root: TempDir,
    }

    impl Fixture {
        fn new() -> Self {
            let f = Self {
                root: tempfile::tempdir().unwrap(),
            };
            f.file("a/tool", 0o755);
            f.file("b/tool", 0o755);
            f.file("a/plain", 0o644);
            f.file("b/plain", 0o755);
            fs::create_dir_all(f.p("a/dir-tool")).unwrap();
            f
        }

        fn p(&self, rel: &str) -> PathBuf {
            self.root.path().join(rel)
        }

        fn file(&self, rel: &str, mode: u32) {
            let p = self.p(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(&p, "#!/bin/sh\necho ran\n").unwrap();
            fs::set_permissions(&p, fs::Permissions::from_mode(mode)).unwrap();
        }

        fn path(&self) -> OsString {
            env::join_paths([self.p("a"), self.p("b")]).unwrap()
        }
    }

    #[test]
    fn the_first_executable_match_on_path_wins() {
        let f = Fixture::new();
        assert_eq!(which("tool", None, Some(&f.path())), Some(f.p("a/tool")));
        let rev = env::join_paths([f.p("b"), f.p("a")]).unwrap();
        assert_eq!(which("tool", None, Some(&rev)), Some(f.p("b/tool")));
    }

    #[test]
    fn a_file_without_the_execute_bit_or_a_folder_is_skipped() {
        let f = Fixture::new();
        let path = f.path();
        assert_eq!(which("plain", None, Some(&path)), Some(f.p("b/plain")));
        assert_eq!(which("dir-tool", None, Some(&path)), None);
    }

    #[test]
    fn a_missing_binary_an_empty_name_and_a_missing_folder_are_none() {
        let f = Fixture::new();
        let path = f.path();
        assert_eq!(
            which("definitely-not-a-real-binary", None, Some(&path)),
            None
        );
        assert_eq!(which("", None, Some(&path)), None);
        assert_eq!(which("tool", None, Some(f.p("nope").as_os_str())), None);
    }

    #[test]
    fn a_name_with_a_slash_is_resolved_against_cwd_not_searched() {
        let f = Fixture::new();
        let root = f.root.path();
        let empty = OsStr::new("");
        assert_eq!(
            which("./a/tool", Some(root), Some(empty)),
            Some(f.p("a/tool"))
        );
        assert_eq!(which(f.p("a/tool"), None, Some(empty)), Some(f.p("a/tool")));
        assert_eq!(which("a/plain", Some(root), None), None);
    }

    #[test]
    fn an_empty_path_entry_means_cwd() {
        let f = Fixture::new();
        let a = f.p("a");
        assert_eq!(
            which("tool", Some(&a), Some(OsStr::new(""))),
            Some(f.p("a/tool"))
        );
        let path = format!("{}::/x", f.p("nope").display());
        assert_eq!(
            which("tool", Some(&a), Some(OsStr::new(&path))),
            Some(f.p("a/tool"))
        );
    }

    #[test]
    fn a_relative_path_entry_is_resolved_against_cwd() {
        let f = Fixture::new();
        assert_eq!(
            which("tool", Some(f.root.path()), Some(OsStr::new("b"))),
            Some(f.p("b/tool"))
        );
    }

    #[test]
    fn without_a_path_it_reads_the_parent_path() {
        let found = which("sh", None, None).unwrap();
        assert!(found.ends_with("sh"));
    }

    #[test]
    fn a_tilde_path_entry_is_a_folder_named_tilde_in_cwd() {
        let f = Fixture::new();
        f.file("~/tool", 0o755);
        f.file("~/bin/other", 0o755);
        let root = f.root.path();
        assert_eq!(
            which("tool", Some(root), Some(OsStr::new("~"))),
            Some(f.p("~/tool"))
        );
        assert_eq!(
            which("other", Some(root), Some(OsStr::new("~/bin"))),
            Some(f.p("~/bin/other"))
        );
    }

    #[test]
    fn a_cwd_that_holds_the_list_separator_is_searched_like_any_other() {
        let f = Fixture::new();
        f.file("x:y/bin/tool", 0o755);
        let cwd = f.p("x:y");
        assert_eq!(
            which("tool", Some(&cwd), Some(OsStr::new("bin"))),
            Some(f.p("x:y/bin/tool"))
        );
        let path = env::join_paths([Path::new("nope"), &f.p("a")]).unwrap();
        assert_eq!(which("tool", Some(&cwd), Some(&path)), Some(f.p("a/tool")));
        assert_eq!(
            which("bin/tool", Some(&cwd), Some(OsStr::new(""))),
            Some(f.p("x:y/bin/tool"))
        );
    }

    #[test]
    fn a_name_that_ends_in_a_separator_is_not_found() {
        let f = Fixture::new();
        f.file("bin/tool", 0o755);
        let root = f.root.path();
        assert_eq!(which("bin/tool/", Some(root), None), None);
        assert_eq!(
            which("tool/", Some(root), Some(f.p("bin").as_os_str())),
            None
        );
    }
}
