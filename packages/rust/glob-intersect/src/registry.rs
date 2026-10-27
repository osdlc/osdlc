//! L1 — a registry over labeled pattern-sets.
//!
//! A reverse index over *labeled* pattern-sets — artifacts that declare the
//! paths they govern (a UI guideline, an SDLC standard's `applies_to.paths`, a
//! work-runner task's claimed scope). Given a scope it answers which artifacts
//! apply. Pure; targets need not exist. Registration order is significant and
//! preserved; a duplicate `id` is rejected at construction.
//!
//! Builds only on the path API — it compiles each entry via [`Matcher`] and
//! never reaches the filesystem layer.

use std::collections::HashSet;
use std::fmt::Display;
use std::hash::Hash;

use crate::{Error, Matcher, Options};

/// An artifact and the pattern-set it declares — an [`index`] entry.
///
/// `T` is the id type. It defaults to `String`; pass an enum or newtype to keep
/// the returned ids typed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Labeled<T = String> {
    /// The artifact's identifier, echoed back by the registry's queries.
    pub id: T,
    /// The path-pattern set this artifact governs.
    pub patterns: Vec<String>,
}

impl<T> Labeled<T> {
    /// Build an entry from anything string-like.
    pub fn new<P: AsRef<str>>(id: T, patterns: &[P]) -> Self {
        Self {
            id,
            patterns: patterns.iter().map(|p| p.as_ref().to_string()).collect(),
        }
    }
}

/// A reverse index answering which labeled pattern-sets apply to a scope or
/// path.
///
/// ```
/// use glob_intersect::{Labeled, Options, index};
///
/// let guidelines = index(
///     [
///         Labeled::new("guidelines/api", &["src/api/**"]),
///         Labeled::new("guidelines/db", &["src/db/**"]),
///     ],
///     Options::default(),
/// )?;
///
/// assert_eq!(guidelines.applicable_to(&["src/api/**"])?, ["guidelines/api"]);
/// assert_eq!(guidelines.matching("src/db/pool.ts"), ["guidelines/db"]);
/// # Ok::<(), glob_intersect::Error>(())
/// ```
#[derive(Debug, Clone)]
pub struct Registry<T = String> {
    entries: Vec<Labeled<T>>,
    compiled: Vec<Matcher>,
}

impl<T: Clone> Registry<T> {
    /// The entries as supplied, in registration order.
    pub fn entries(&self) -> &[Labeled<T>] {
        &self.entries
    }

    /// Ids whose set OVERLAPS the scope, in registry order. (A subtree scope is
    /// written `dir/**`.)
    ///
    /// # Errors
    ///
    /// [`Error::UnsupportedSyntax`] or [`Error::PatternTooDeep`] if the scope
    /// uses syntax this crate refuses.
    pub fn applicable_to<P: AsRef<str>>(&self, scope: &[P]) -> Result<Vec<T>, Error> {
        let mut ids = Vec::new();
        for (entry, matcher) in self.entries.iter().zip(&self.compiled) {
            if matcher.intersects(scope)? {
                ids.push(entry.id.clone());
            }
        }
        Ok(ids)
    }

    /// Ids whose set matches a CONCRETE path, in registry order. The path is
    /// read as the literal name it is, not as a glob.
    pub fn matching(&self, path: &str) -> Vec<T> {
        self.entries
            .iter()
            .zip(&self.compiled)
            .filter(|(_, m)| m.matches(path))
            .map(|(e, _)| e.id.clone())
            .collect()
    }
}

/// Build the reverse index over labeled pattern-sets.
///
/// Compiles each entry's patterns once, up front.
///
/// Registration order is significant and preserved: register general-to-specific
/// and read a query result as a prioritization (first = most general, last = most
/// specific). Intersect returns the order; the caller picks the precedence rule.
/// Pure — target paths need not exist.
///
/// # Errors
///
/// [`Error::DuplicateRegistryId`] if any `id` is supplied twice — rejected at
/// construction rather than silently keeping first or last. Unsupported pattern
/// syntax fails here too ([`Error::UnsupportedSyntax`],
/// [`Error::PatternTooDeep`]).
///
/// ```
/// use glob_intersect::{Labeled, Options, index};
///
/// let dup = index(
///     [
///         Labeled::new("a", &["src/**"]),
///         Labeled::new("a", &["docs/**"]), // same id, registered twice
///     ],
///     Options::default(),
/// );
/// let err = dup.unwrap_err();
/// assert_eq!(err.to_string(), "duplicate registry id 'a'");
/// assert_eq!(err.code(), "DUPLICATE_REGISTRY_ID");
/// ```
pub fn index<T, I>(entries: I, opts: Options) -> Result<Registry<T>, Error>
where
    T: Clone + Eq + Hash + Display,
    I: IntoIterator<Item = Labeled<T>>,
{
    let mut ordered: Vec<Labeled<T>> = Vec::new();
    let mut compiled: Vec<Matcher> = Vec::new();
    let mut seen: HashSet<T> = HashSet::new();

    for entry in entries {
        if !seen.insert(entry.id.clone()) {
            return Err(Error::DuplicateRegistryId(entry.id.to_string()));
        }
        compiled.push(Matcher::new(&entry.patterns, opts)?);
        ordered.push(entry);
    }

    Ok(Registry {
        entries: ordered,
        compiled,
    })
}
