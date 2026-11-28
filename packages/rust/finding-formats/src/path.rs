//! The path and line rules every reader shares. Paths are handled lexically.

/// Turns the path and line a tool printed into a finding's `path` and `line`.
///
/// Built once per read, so `paths_from` is normalised once, not per finding.
pub(crate) struct Locator {
    base: Option<Base>,
}

/// `paths_from`, prepared for joining.
struct Base {
    /// As given, `/`-separated: the base for a path that needs normalising.
    raw: String,
    /// Normalised, ending where a plain relative path can be appended as is.
    head: String,
}

impl Locator {
    /// Relative paths join onto `paths_from`. An empty one, as a runner gives for a check at the
    /// repository root, joins nothing, as `.` does, and never roots a path.
    pub(crate) fn new(paths_from: Option<&str>) -> Self {
        let base = paths_from.filter(|base| !base.is_empty()).map(|base| {
            let raw = base.replace('\\', "/");
            // Taken apart with the separator a joined path gets, so `head`
            // agrees with joining then normalising for every non-empty base.
            let joined = format!("{raw}/");
            let parts = Parts::of(&joined);
            let mut head = parts.render();
            if !parts.segments.is_empty() {
                head.push('/');
            }
            Base { raw, head }
        });
        Self { base }
    }

    /// `raw` with `/` separators and `.` and `..` resolved, joined onto the
    /// base when relative; `None` when empty or absent. A `..` that climbs
    /// above the start of a relative path is kept.
    pub(crate) fn path(&self, raw: Option<&str>) -> Option<String> {
        let raw = raw.filter(|p| !p.is_empty())?;
        // Most paths are already normal: one copy, no taking apart.
        if is_normal(raw) {
            return Some(match self.base_for(raw) {
                Some(base) => [base.head.as_str(), raw].concat(),
                None => raw.to_owned(),
            });
        }
        let path = raw.replace('\\', "/");
        let joined = match self.base_for(&path) {
            Some(base) => format!("{}/{path}", base.raw),
            None => path,
        };
        Some(Parts::of(&joined).render())
    }

    /// The base for `path`: none when it is absolute.
    fn base_for(&self, path: &str) -> Option<&Base> {
        self.base.as_ref().filter(|_| !is_absolute(path))
    }

    /// A finding's line: lines are 1-based, so `0` is no line.
    pub(crate) fn line(line: Option<u32>) -> Option<u32> {
        line.filter(|&n| n >= 1)
    }

    /// A finding's column: columns are 1-based, so `0` is no column.
    pub(crate) fn col(col: Option<u32>) -> Option<u32> {
        col.filter(|&n| n >= 1)
    }
}

/// Starts with a root (`/x`) or a drive letter and colon (`C:/x`, `C:x`).
fn is_absolute(path: &str) -> bool {
    path.starts_with('/') || drive_prefix(path).is_some()
}

fn drive_prefix(path: &str) -> Option<&str> {
    let bytes = path.as_bytes();
    (bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':').then(|| &path[..2])
}

/// Whether `path` has only `/` separators and no `.`, `..` or empty segment
/// after the drive and root, so normalising would give it back unchanged.
fn is_normal(path: &str) -> bool {
    let rest = &path[drive_prefix(path).map_or(0, str::len)..];
    !path.contains('\\')
        && rest
            .strip_prefix('/')
            .unwrap_or(rest)
            .split('/')
            .all(|segment| !matches!(segment, "" | "." | ".."))
}

/// A `/`-separated path taken apart, with `.` and `..` resolved.
struct Parts<'a> {
    drive: &'a str,
    rooted: bool,
    segments: Vec<&'a str>,
}

impl<'a> Parts<'a> {
    fn of(path: &'a str) -> Self {
        let drive = drive_prefix(path).unwrap_or_default();
        let rest = &path[drive.len()..];
        let rooted = rest.starts_with('/');
        let mut segments: Vec<&str> = Vec::new();
        for segment in rest.split('/') {
            match segment {
                "" | "." => {}
                ".." => match segments.last() {
                    Some(&last) if last != ".." => {
                        segments.pop();
                    }
                    _ if rooted => {}
                    _ => segments.push(".."),
                },
                other => segments.push(other),
            }
        }
        Self {
            drive,
            rooted,
            segments,
        }
    }

    fn render(&self) -> String {
        let root = if self.rooted { "/" } else { "" };
        format!("{}{root}{}", self.drive, self.segments.join("/"))
    }
}

#[cfg(test)]
mod tests {
    use super::{Locator, Parts};

    fn resolve(path: &str, base: Option<&str>) -> String {
        Locator::new(base).path(Some(path)).unwrap()
    }

    /// The rule the shortcuts in [`Locator`] must agree with: join, then
    /// normalise the whole string.
    fn reference(path: &str, base: Option<&str>) -> String {
        let path = path.replace('\\', "/");
        let absolute = path.starts_with('/')
            || matches!(path.as_bytes(), [d, b':', ..] if d.is_ascii_alphabetic());
        let joined = match base {
            Some(base) if !absolute && !base.is_empty() => {
                format!("{}/{path}", base.replace('\\', "/"))
            }
            _ => path,
        };
        Parts::of(&joined).render()
    }

    #[test]
    fn joins_and_collapses() {
        assert_eq!(resolve("a/./b.rs", Some("pkg/x/..")), "pkg/a/b.rs");
        assert_eq!(resolve("../b.rs", Some("pkg")), "b.rs");
        assert_eq!(resolve("../../b.rs", Some("pkg")), "../b.rs");
    }

    #[test]
    fn absolute_paths_are_not_joined() {
        assert_eq!(resolve("/x/../y.rs", Some("pkg")), "/y.rs");
        assert_eq!(resolve(r"C:\src\a.rs", Some("pkg")), "C:/src/a.rs");
    }

    #[test]
    fn no_base_only_normalises() {
        assert_eq!(resolve(r"src\a.rs", None), "src/a.rs");
    }

    #[test]
    fn normal_paths_pass_through() {
        assert_eq!(resolve("src/a.rs", None), "src/a.rs");
        assert_eq!(resolve("/repo/src/a.rs", Some("pkg")), "/repo/src/a.rs");
        assert_eq!(resolve("C:/src/a.rs", Some("pkg")), "C:/src/a.rs");
        assert_eq!(resolve("src/a.rs", Some("pkg/web")), "pkg/web/src/a.rs");
        assert_eq!(resolve("src/a.rs", Some("./pkg//web/")), "pkg/web/src/a.rs");
        assert_eq!(resolve("a.rs", Some(r"C:\work\..")), "C:/a.rs");
        assert_eq!(resolve("a.rs", Some("..")), "../a.rs");
        assert_eq!(resolve("a.rs", Some(".")), "a.rs");
        assert_eq!(resolve("a.rs", Some("")), "a.rs");
        assert_eq!(resolve("src/a.rs", Some("")), "src/a.rs");
        assert_eq!(resolve("./src/../a.rs", Some("")), "a.rs");
    }

    #[test]
    fn empty_and_absent_paths_are_no_path() {
        for base in [None, Some("pkg")] {
            assert_eq!(Locator::new(base).path(None), None);
            assert_eq!(Locator::new(base).path(Some("")), None);
        }
    }

    #[test]
    fn columns_are_one_based() {
        assert_eq!(Locator::col(Some(0)), None);
        assert_eq!(Locator::col(Some(1)), Some(1));
        assert_eq!(Locator::col(None), None);
    }

    #[test]
    fn lines_are_one_based() {
        assert_eq!(Locator::line(Some(0)), None);
        assert_eq!(Locator::line(Some(1)), Some(1));
        assert_eq!(Locator::line(None), None);
    }

    #[test]
    fn shortcuts_agree_with_join_then_normalise() {
        let paths = [
            "a.rs",
            "src/a.rs",
            "src/é/a.rs",
            "é",
            "./a.rs",
            "../a.rs",
            "a/../b.rs",
            "a//b.rs",
            "a/",
            "a/.",
            ".",
            "..",
            ".hidden/a.rs",
            "a..b/c...rs",
            r"src\a.rs",
            r"..\a.rs",
            "/",
            "/a.rs",
            "/a/../b.rs",
            "//a.rs",
            "C:",
            "C:/",
            "C:a.rs",
            "C:/a.rs",
            "C:/a/../b.rs",
            r"C:\a.rs",
            "c",
            ":a",
            "1:/a.rs",
        ];
        let bases = [
            None,
            Some(""),
            Some("."),
            Some(".."),
            Some("../.."),
            Some("pkg"),
            Some("pkg/"),
            Some("pkg/web"),
            Some("pkg/./web/../x"),
            Some("pkg/.."),
            Some(r"pkg\web"),
            Some("/"),
            Some("/repo"),
            Some("/repo/.."),
            Some("C:"),
            Some("C:."),
            Some("C:/"),
            Some("C:/work"),
            Some(r"C:\work"),
            Some("./C:/x"),
            Some("é"),
        ];
        for base in bases {
            let locator = Locator::new(base);
            for path in paths {
                assert_eq!(
                    locator.path(Some(path)),
                    Some(reference(path, base)),
                    "path {path:?}, base {base:?}"
                );
            }
        }
    }
}
