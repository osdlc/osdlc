//! `--from-git`: a repository as an adopt source, parsed here and fetched
//! here, handed to the core as a directory.
//!
//! The core is `tradecraft-core`, built for `wasm32-unknown-unknown` by hosts
//! that cannot spawn a process there, so it never clones. This is the
//! fetching side for the CLI: parse the grammar below, fetch through
//! `typed_git::clone::checkout`, and hand the core an ordinary directory.
//!
//! # The grammar
//!
//! | Spelling | Reads as |
//! |---|---|
//! | `acme/agent-kit` | `https://github.com/acme/agent-kit` |
//! | `acme/agent-kit/skills@v2.1` | the same, importing `skills/` at `v2.1` |
//! | `github.com/acme/agent-kit` | the same, host spelled out |
//! | `https://github.com/acme/agent-kit/tree/v2.1/skills` | GitHub's browser URL |
//! | `git@github.com:acme/agent-kit.git@v2.1` | the SSH form |
//! | `https://…/r.git@v2.1#skills` | any host; `#` names the path inside |
//!
//! The same grammar other hosts of the core read, deliberately:
//! one reference typed into the app and into the terminal must mean one
//! thing.
//!
//! # What the note records
//!
//! Not the checkout path. The checkout lives under the cache tier, which the
//! operating system may purge whole, so its path is worthless as
//! provenance. [`ResolvedGitSource::stamped`] is `<url>[/<subpath>]@<sha>`,
//! which still names the same bytes after the cache is gone and after the
//! branch has moved on — and which a re-adopt compares against, so a second
//! import from a different cache directory reads as the same source rather
//! than as somebody else's.

use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// The suite segment of the checkout cache (`dev.osdlc.tradecraft`),
/// shared with other tools that use the same cache. Changing it splits the
/// caches. The digest half of the key is the same for every tool.
const SUITE_KEY: &str = "tradecraft";

/// The host a bare `owner/repo` means.
const DEFAULT_HOST: &str = "github.com";

/// One adopt source that is a repository, parsed but not yet fetched.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitSource {
    /// What `git clone` is given.
    pub url: String,
    /// The branch, tag or commit named, or `None` for the default branch.
    pub r#ref: Option<String>,
    /// The directory inside the repository to adopt, or `None` for its root.
    pub subpath: Option<String>,
}

/// A fetched [`GitSource`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedGitSource {
    /// The directory the core reads — the checkout, plus the subpath.
    pub source: PathBuf,
    /// What every adopted note's `tc-source` records: `<url>[/<subpath>]@<sha>`,
    /// with the subpath in its [`path_guard::lexical::validate_relative`] form.
    pub stamped: String,
}

/// Everything that can keep [`fetch_git_source`] from handing back a
/// directory: the cache tier could not be resolved, the clone/fetch itself
/// failed, or the request subpath climbs out of the repository.
#[derive(Debug, thiserror::Error)]
pub enum GitSourceError {
    /// The cache directory could not be resolved.
    #[error("{0}")]
    Dirs(#[from] tiered_dirs::Error),
    /// The clone or fetch failed.
    #[error("{0}")]
    Git(#[from] typed_git::GitError),
    /// A subpath [`path_guard::lexical::validate_relative`] refuses, or one that
    /// [`path_guard::Guard::resolve`] finds outside the checkout (a symlink).
    #[error("`{subpath}` is not a path inside the repository: {source}")]
    UnsafeSubpath {
        /// The subpath as requested.
        subpath: String,
        /// The path check that failed.
        #[source]
        source: path_guard::PathError,
    },
    /// Preparing the checkout directory failed.
    #[error("preparing the checkout at {path}: {source}")]
    Io {
        /// The path being prepared.
        path: PathBuf,
        /// The underlying error.
        #[source]
        source: std::io::Error,
    },
}

/// Read a source string as a repository, or `None` when it is not one.
///
/// `None` is the ordinary answer: every positional source is a path, and a
/// path must keep meaning a path. A repository is named with `--from-git`,
/// so this never has to guess between the two — it validates what the flag
/// already declared.
pub fn parse_git_source(raw: &str) -> Option<GitSource> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut rest = trimmed;

    let mut subpath: Option<String> = None;
    if let Some(hash) = rest.rfind('#')
        && hash > 0
    {
        let after = &rest[hash + 1..];
        subpath = (!after.is_empty()).then(|| after.to_string());
        rest = &rest[..hash];
    }

    // A ref is what follows the LAST `@` when it carries no `/` and no `:` —
    // which is exactly what distinguishes it from `git@host:owner/repo`'s
    // authority.
    let mut git_ref: Option<String> = None;
    if let Some(at) = rest.rfind('@')
        && at > 0
    {
        let tail = &rest[at + 1..];
        if !tail.contains('/') && !tail.contains(':') {
            git_ref = (!tail.is_empty()).then(|| tail.to_string());
            rest = &rest[..at];
        }
    }
    // A ref beginning with `-` reaches `git fetch`/`git checkout` as an
    // option, not a positional — an `--upload-pack=<prog>` ref is local
    // command execution. No git ref legitimately begins with `-`. The scheme
    // check below already keeps a reconstructed URL from beginning with one.
    if git_ref.as_deref().is_some_and(|r| r.starts_with('-')) {
        return None;
    }

    if let Some(after_prefix) = rest.strip_prefix("git@") {
        let mut split = after_prefix.splitn(2, ':');
        let host = split.next().unwrap_or("");
        let path = split.next();
        return match path {
            Some(path) if !host.is_empty() && !path.is_empty() => Some(GitSource {
                url: format!("git@{host}:{path}"),
                r#ref: git_ref,
                subpath,
            }),
            _ => None,
        };
    }

    if let Some((protocol, after)) = match_scheme(rest) {
        let slash = after.find('/')?;
        let authority = &after[..slash];
        let path = &after[slash + 1..];
        // A local repository is a path, not an owner and a repo: everything
        // after the authority is the clone target. Compared case-sensitively
        // against the lowercase spelling only: a captured `FILE://` protocol does
        // not take this branch.
        if protocol == "file" {
            return Some(GitSource {
                url: format!("file://{authority}/{path}"),
                r#ref: git_ref,
                subpath,
            });
        }

        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        let owner = *segments.first()?;
        let repo = *segments.get(1)?;
        let inside = &segments[2..];
        let url = format!("{protocol}://{authority}/{owner}/{repo}");
        // `/tree/<ref>/<rest>` — the browser URL, whose ref rides in the path.
        if inside.first() == Some(&"tree") && inside.len() > 1 {
            let tree_ref = git_ref.clone().unwrap_or_else(|| inside[1].to_string());
            if tree_ref.starts_with('-') {
                return None;
            }
            let inner = inside[2..].join("/");
            return Some(GitSource {
                url,
                r#ref: Some(tree_ref),
                subpath: subpath.or((!inner.is_empty()).then_some(inner)),
            });
        }
        let inner = inside.join("/");
        return Some(GitSource {
            url,
            r#ref: git_ref,
            subpath: subpath.or((!inner.is_empty()).then_some(inner)),
        });
    }

    let segments: Vec<&str> = rest.split('/').filter(|s| !s.is_empty()).collect();
    let first = *segments.first()?;
    let hosted = first.contains('.');
    let host = if hosted { first } else { DEFAULT_HOST };
    let rest_segments: &[&str] = if hosted {
        &segments[1..]
    } else {
        &segments[..]
    };
    let owner = *rest_segments.first()?;
    let repo = *rest_segments.get(1)?;
    let inside = &rest_segments[2..];
    let inner = inside.join("/");
    Some(GitSource {
        url: format!("https://{host}/{owner}/{repo}"),
        r#ref: git_ref,
        subpath: subpath.or((!inner.is_empty()).then_some(inner)),
    })
}

/// `^([a-zA-Z][a-zA-Z0-9+.-]*)://(.*)$`, matched over bytes rather than a
/// regex engine. The protocol keeps its original case — see the `file`
/// comparison at its one call site.
fn match_scheme(rest: &str) -> Option<(&str, &str)> {
    let idx = rest.find("://")?;
    let protocol = &rest[..idx];
    let mut chars = protocol.chars();
    let first = chars.next()?;
    if !first.is_ascii_alphabetic() {
        return None;
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-')) {
        return None;
    }
    Some((protocol, &rest[idx + 3..]))
}

/// Fetch `source` into the adopt cache and answer with the directory to
/// read.
///
/// Idempotent: a second adopt of the same repository at the same ref
/// refreshes the checkout rather than cloning it again. Keyed by ref as well
/// as by repository, so alternating between two tags does not make each run
/// undo the last one's fetch.
///
/// `typed_git::clone::checkout` is the one entry point that does the actual
/// git work — shallow-then-full-clone on first use, fetch-plus-hard-reset on
/// reuse — so nothing here re-implements that fallback.
pub fn fetch_git_source(source: &GitSource) -> Result<ResolvedGitSource, GitSourceError> {
    let root = checkout_cache_root()?;
    fetch_git_source_under(source, &root)
}

/// The suite cache root a checkout lands under:
/// `dirs::system().suite("tradecraft").cache()`.
fn checkout_cache_root() -> Result<PathBuf, GitSourceError> {
    Ok(crate::dirs::system()?.suite(SUITE_KEY)?.cache().into_path())
}

/// [`fetch_git_source`], with the cache root supplied rather than resolved —
/// the seam this module's own tests use so they never touch a real `$HOME`.
fn fetch_git_source_under(
    source: &GitSource,
    cache_root: &Path,
) -> Result<ResolvedGitSource, GitSourceError> {
    // The lexical check runs before the clone: a subpath that climbs out of
    // the repository is refused without paying for a fetch, and a clone that
    // fails cannot mask the real reason. The symlink check needs the checkout
    // and runs after it.
    let checked = match &source.subpath {
        None => None,
        Some(subpath) => Some((
            subpath,
            path_guard::lexical::validate_relative(subpath).map_err(|source| {
                GitSourceError::UnsafeSubpath {
                    subpath: subpath.clone(),
                    source,
                }
            })?,
        )),
    };

    let dest = cache_root
        .join("checkouts")
        .join(cache_key(&source.url))
        .join(cache_key(source.r#ref.as_deref().unwrap_or("HEAD")));
    std::fs::create_dir_all(&dest).map_err(|source_err| GitSourceError::Io {
        path: dest.clone(),
        source: source_err,
    })?;

    let checkout = typed_git::clone::checkout(&source.url, &dest, source.r#ref.as_deref())?;

    let (resolved_source, stamped) = match checked {
        None => (dest, format!("{}@{}", source.url, checkout.sha)),
        Some((subpath, relative)) => {
            let path = path_guard::Guard::std()
                .resolve(&dest, &relative)
                .map_err(|source| GitSourceError::UnsafeSubpath {
                    subpath: subpath.clone(),
                    source,
                })?;
            (path, format!("{}/{relative}@{}", source.url, checkout.sha))
        }
    };

    Ok(ResolvedGitSource {
        source: resolved_source,
        stamped,
    })
}

/// A directory name that names one string and no other.
///
/// [`slug`] is not injective — `-` is both the replacement and a legal
/// character, so `a/b` and `a-b` slug alike, and one directory serving two
/// repositories would import one repository's files under the other's name.
/// Identity rides in the digest; the slug only keeps the cache legible.
fn cache_key(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    format!("{}-{}", slug(raw, 64), &digest[..16])
}

/// A path segment from arbitrary text, at most `limit` characters:
/// everything outside `[A-Za-z0-9._-]` becomes `-`, and the result is never
/// empty, `.` or `..`.
///
/// Readable, not unique — see [`cache_key`], which is what a cache path is
/// keyed by.
fn slug(raw: &str, limit: usize) -> String {
    // Every mapped character is either a slug character or `-`, so the
    // dotted-only case is exactly an input of nothing but dots.
    if raw.chars().all(|c| c == '.') {
        return format!("x{}", raw.chars().count())
            .chars()
            .take(limit)
            .collect();
    }
    raw.chars()
        .map(|c| if is_slug_char(c) { c } else { '-' })
        .take(limit)
        .collect()
}

fn is_slug_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    use tiered_dirs::BaseDirs;

    /// A repository with one commit on `main`, holding a `skills/` tree —
    /// Reached by `file://`, so nothing here touches the network.
    fn origin(dir: &Path, at: &str, body: &str) -> String {
        let repo = dir.join(at);
        std::fs::create_dir_all(repo.join("skills").join("review")).unwrap();
        std::fs::write(
            repo.join("skills").join("review").join("SKILL.md"),
            format!("---\nname: review\ndescription: reviews\n---\n{body}\n"),
        )
        .unwrap();

        git_in(&repo, &["init", "--initial-branch", "main"]);
        git_in(&repo, &["add", "."]);
        git_in(&repo, &["commit", "-m", "one"]);

        format!("file://{}", repo.display())
    }

    fn git_in(repo: &Path, args: &[&str]) {
        let mut cmd = typed_git::git();
        cmd.dir(repo)
            .args(args)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_AUTHOR_NAME", "T")
            .env("GIT_AUTHOR_EMAIL", "t@t.invalid")
            .env("GIT_COMMITTER_NAME", "T")
            .env("GIT_COMMITTER_EMAIL", "t@t.invalid");
        cmd.run().unwrap();
    }

    /// A stub cache root under a temp directory — the same seam
    /// [`BaseDirs::rooted`] gives `tiered-dirs`' own tests, so nothing here
    /// reads or writes a real `$HOME`.
    fn stub_cache_root(dir: &Path) -> PathBuf {
        crate::dirs::with_base_dirs(BaseDirs::rooted(dir.join("dirs-root")))
            .suite(SUITE_KEY)
            .unwrap()
            .cache()
            .into_path()
    }

    #[test]
    fn clones_lands_on_the_subpath_and_stamps_url_plus_commit() {
        let dir = tempfile::tempdir().unwrap();
        let url = origin(dir.path(), "origin", "b");
        let source = parse_git_source(&format!("{url}@main#skills")).unwrap();

        let resolved = fetch_git_source_under(&source, &stub_cache_root(dir.path())).unwrap();

        assert!(resolved.source.join("review").join("SKILL.md").exists());
        // The checkout path is a cache and is not what the note records.
        let prefix = format!("{}/skills@", source.url);
        let sha = resolved
            .stamped
            .strip_prefix(&prefix)
            .unwrap_or_else(|| panic!("{} does not lead with {prefix}", resolved.stamped));
        assert_eq!(sha.len(), 40);
        assert!(sha.chars().all(|c| c.is_ascii_hexdigit()));
        assert!(
            !resolved
                .stamped
                .contains(&resolved.source.display().to_string())
        );
    }

    #[test]
    fn a_second_fetch_of_the_same_ref_reuses_the_checkout() {
        let dir = tempfile::tempdir().unwrap();
        let url = origin(dir.path(), "origin", "b");
        let source = parse_git_source(&format!("{url}@main")).unwrap();
        let root = stub_cache_root(dir.path());

        let first = fetch_git_source_under(&source, &root).unwrap();
        let second = fetch_git_source_under(&source, &root).unwrap();
        assert_eq!(first.source, second.source);
        assert_eq!(first.stamped, second.stamped);
    }

    #[test]
    fn two_urls_whose_slugs_collide_get_their_own_checkouts() {
        // `.../x/a/b` and `.../x/a-b` are one string once every `/` becomes
        // `-`, which is how the cache key used to be built: the second fetch
        // reused the first repository's checkout, refreshed it from the
        // FIRST `origin`, and returned its files stamped with the second
        // url.
        let dir = tempfile::tempdir().unwrap();
        let first_url = origin(dir.path(), "x/a/b", "from-a-slash-b");
        let second_url = origin(dir.path(), "x/a-b", "from-a-dash-b");
        let first = parse_git_source(&format!("{first_url}@main")).unwrap();
        let second = parse_git_source(&format!("{second_url}@main")).unwrap();
        assert_ne!(first.url, second.url);

        let root = stub_cache_root(dir.path());
        let one = fetch_git_source_under(&first, &root).unwrap();
        let two = fetch_git_source_under(&second, &root).unwrap();

        assert_ne!(one.source, two.source);
        let one_body =
            std::fs::read_to_string(one.source.join("skills").join("review").join("SKILL.md"))
                .unwrap();
        let two_body =
            std::fs::read_to_string(two.source.join("skills").join("review").join("SKILL.md"))
                .unwrap();
        assert!(one_body.contains("from-a-slash-b"));
        assert!(two_body.contains("from-a-dash-b"));
    }

    #[test]
    fn a_path_outside_the_repository_is_refused_rather_than_climbed_out_of() {
        let dir = tempfile::tempdir().unwrap();
        let url = origin(dir.path(), "origin", "b");
        let source = parse_git_source(&format!("{url}@main#../../etc")).unwrap();

        let err = fetch_git_source_under(&source, &stub_cache_root(dir.path())).unwrap_err();
        assert!(
            matches!(
                err,
                GitSourceError::UnsafeSubpath {
                    source: path_guard::PathError::ParentSegment(_),
                    ..
                }
            ),
            "{err}"
        );
        assert!(err.to_string().contains("inside the repository"));
    }

    #[cfg(unix)]
    #[test]
    fn a_subpath_that_is_a_symlink_out_of_the_checkout_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let outside = dir.path().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret.md"), "secret").unwrap();

        let url = origin(dir.path(), "origin", "b");
        let repo = dir.path().join("origin");
        std::os::unix::fs::symlink(&outside, repo.join("linked")).unwrap();
        git_in(&repo, &["add", "linked"]);
        git_in(&repo, &["commit", "-m", "link"]);

        let source = parse_git_source(&format!("{url}@main#linked")).unwrap();
        let err = fetch_git_source_under(&source, &stub_cache_root(dir.path())).unwrap_err();
        assert!(
            matches!(
                err,
                GitSourceError::UnsafeSubpath {
                    source: path_guard::PathError::Escapes(..),
                    ..
                }
            ),
            "{err}"
        );
    }

    #[test]
    fn a_nested_subpath_resolves() {
        let dir = tempfile::tempdir().unwrap();
        let url = origin(dir.path(), "origin", "b");
        let source = parse_git_source(&format!("{url}@main#skills/review")).unwrap();

        let resolved = fetch_git_source_under(&source, &stub_cache_root(dir.path())).unwrap();
        assert!(resolved.source.join("SKILL.md").exists());
    }

    #[test]
    fn a_degenerate_or_absolute_subpath_is_refused_before_any_clone() {
        use path_guard::PathError::{Absolute, DegenerateSegment};

        let dir = tempfile::tempdir().unwrap();
        // Nothing exists at this URL: a clone attempt would give a Git error.
        let url = format!("file://{}", dir.path().join("missing").display());
        let root = stub_cache_root(dir.path());
        for bad in ["a//b", "./a", "/skills"] {
            let source = GitSource {
                url: url.clone(),
                r#ref: None,
                subpath: Some(bad.to_string()),
            };
            let err = fetch_git_source_under(&source, &root).unwrap_err();
            let GitSourceError::UnsafeSubpath { source: reason, .. } = &err else {
                panic!("{bad}: {err}");
            };
            match bad {
                "/skills" => assert!(matches!(reason, Absolute(_)), "{bad}: {err}"),
                _ => assert!(matches!(reason, DegenerateSegment(_)), "{bad}: {err}"),
            }
        }
        assert!(!root.join("checkouts").exists());
    }

    #[test]
    fn a_trailing_slash_does_not_change_the_recorded_source() {
        let dir = tempfile::tempdir().unwrap();
        let url = origin(dir.path(), "origin", "b");
        let root = stub_cache_root(dir.path());
        let plain = parse_git_source(&format!("{url}@main#skills")).unwrap();
        let slash = parse_git_source(&format!("{url}@main#skills/")).unwrap();
        let one = fetch_git_source_under(&plain, &root).unwrap();
        let two = fetch_git_source_under(&slash, &root).unwrap();
        assert_eq!(one.stamped, two.stamped);
    }
}
