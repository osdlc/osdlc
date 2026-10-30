//! L0 — the segment core.
//!
//! The pure, primitive engine. It reasons over patterns already split into path
//! segments; it never parses strings and never touches the filesystem. Pairwise
//! and minimal — the reusable, portable heart of the library.
//!
//! A *segment pattern* is one pattern already split into path segments, e.g.
//! `["src", "**", "*.vue"]`. The core's unit: no separators, no strings to
//! parse. Each element is a glob token taken verbatim; a concrete path is just a
//! segment pattern with no wildcards.
//!
//! The engine is a synchronized product of two per-pattern sequence automata
//! plus reachability (the private `automaton` and `product` modules).

mod automaton;
mod product;

pub(crate) use automaton::assert_supported;
pub(crate) use product::search;

use crate::{Error, Options};

/// Borrow a `&[S]` of anything string-like as the `&[&str]` the engine walks.
fn as_strs<S: AsRef<str>>(pattern: &[S]) -> Vec<&str> {
    pattern.iter().map(AsRef::as_ref).collect()
}

/// Do two segment-patterns share a common matching path? The load-bearing
/// primitive: every other question in the library is a shape over it.
///
/// # Errors
///
/// [`Error::UnsupportedSyntax`] or [`Error::PatternTooDeep`] when either
/// pattern uses syntax this crate refuses (see [`Error`]).
///
/// A pattern with no wildcards is an exact-path match, so two literal segment
/// arrays intersect only when equal. Subtrees are opted into with `**`.
///
/// ```
/// use glob_intersect::{Options, segments};
///
/// assert!(segments::intersects(
///     &["src", "**", "*.vue"],
///     &["src", "siteA", "components", "Button.vue"],
///     Options::default(),
/// )?);
/// assert!(!segments::intersects(
///     &["src", "api", "**"],
///     &["src", "web", "**"],
///     Options::default(),
/// )?);
/// # Ok::<(), glob_intersect::Error>(())
/// ```
pub fn intersects<A: AsRef<str>, B: AsRef<str>>(
    a: &[A],
    b: &[B],
    opts: Options,
) -> Result<bool, Error> {
    Ok(product::search(&as_strs(a), &as_strs(b), &opts, false)?.is_some())
}

/// Does a concrete segmented path match a segment-pattern?
///
/// The degenerate case of [`intersects`]: a concrete path is a literal segment
/// pattern, so it intersects `pattern` exactly when it matches it.
///
/// Unlike the crate-root [`crate::matches`], `path` is read as a pattern here,
/// not as a literal name: escape glob characters in it yourself.
///
/// # Errors
///
/// As [`intersects`].
///
/// ```
/// use glob_intersect::{Options, segments};
///
/// assert!(segments::matches(&["src", "api", "user.ts"], &["src", "**", "*.ts"], Options::default())?);
/// assert!(!segments::matches(&["README.md"], &["src", "**"], Options::default())?);
/// # Ok::<(), glob_intersect::Error>(())
/// ```
pub fn matches<P: AsRef<str>, Q: AsRef<str>>(
    path: &[P],
    pattern: &[Q],
    opts: Options,
) -> Result<bool, Error> {
    Ok(product::search(&as_strs(path), &as_strs(pattern), &opts, false)?.is_some())
}

/// An example common path (the reachability witness), or `None` when disjoint.
///
/// A segment of the witness may be the empty string — legal here, since this
/// layer answers in segment vectors. The path API's [`crate::witness`]
/// stringifies, and skips a vector whose LAST segment is empty: [`crate::parse`]
/// normalizes a trailing separator back off, so no path string spells it.
///
/// Turns "these overlap" into "these overlap at X". The witness is free — it is
/// the path the engine already walked to prove [`intersects`].
///
/// # Errors
///
/// As [`intersects`].
///
/// ```
/// use glob_intersect::{Options, segments};
///
/// let w = segments::witness(&["src", "api", "**"], &["src", "**", "handler.ts"], Options::default())?;
/// assert_eq!(w, Some(vec!["src".to_string(), "api".to_string(), "handler.ts".to_string()]));
/// assert_eq!(segments::witness(&["src", "api", "**"], &["src", "web", "**"], Options::default())?, None);
/// # Ok::<(), glob_intersect::Error>(())
/// ```
pub fn witness<A: AsRef<str>, B: AsRef<str>>(
    a: &[A],
    b: &[B],
    opts: Options,
) -> Result<Option<Vec<String>>, Error> {
    product::search(&as_strs(a), &as_strs(b), &opts, false)
}
