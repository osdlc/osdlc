//! L1 — the path API.
//!
//! The friendly surface most callers use. It parses path-like glob strings into
//! segment patterns (via [`crate::parse`]) and defers every decision to the
//! segment core ([`crate::segments`]). Pure — no filesystem.
//!
//! No inference: a path-like string is the glob it literally is. A pattern with
//! NO wildcards is an exact-path match (`src/siteA/components` matches only that
//! path); a subtree is written explicitly (`src/siteA/components/**`).
//!
//! The patterns are globs, but the path handed to [`matches`], [`which_match`],
//! [`Matcher::matches`] and the registry's `matching` is read as the literal
//! name it is: a path `pages/[id].vue` is that file name, not a character class.
//! To match it, escape the pattern too (`pages/\[id\].vue`).
//!
//! Where the TypeScript peer takes `string | string[]`, this tier takes a slice
//! throughout: a one-element slice IS the single-pattern case, so the union type
//! buys nothing in Rust and costs an enum at every call.
//!
//! Every function that reads a pattern returns `Result<_, Error>`: a pattern
//! with unsupported syntax is refused with [`Error::UnsupportedSyntax`] or
//! [`Error::PatternTooDeep`] instead of being read as plain text.

use crate::segments;
use crate::{Error, Options, parse::SEPARATOR, parse::literal, parse::parse};

/// Parse a pattern string and check it against the supported syntax.
fn parse_pattern(pattern: &str) -> Result<Vec<String>, Error> {
    let parsed = parse(pattern);
    segments::assert_supported(&parsed)?;
    Ok(parsed)
}

/// Parse a list of pattern strings, failing on the first unsupported one.
fn parse_patterns<P: AsRef<str>>(patterns: &[P]) -> Result<Vec<Vec<String>>, Error> {
    patterns.iter().map(|p| parse_pattern(p.as_ref())).collect()
}

/// Parse a concrete path. It is read as the literal name it is: glob characters
/// in it are quoted first.
fn parse_path(path: &str) -> Vec<String> {
    parse(&literal(path))
}

fn as_strs(segs: &[String]) -> Vec<&str> {
    segs.iter().map(String::as_str).collect()
}

/// Do two parsed patterns share a path?
fn overlap(a: &[String], b: &[String], opts: Options) -> Result<bool, Error> {
    Ok(segments::search(&as_strs(a), &as_strs(b), &opts, false)?.is_some())
}

/// A compiled pattern-set for amortized queries against many paths/patterns.
///
/// Parses each pattern once; every method reuses that parsed set. Amortizes the
/// parse when a fixed scope is tested against many paths/patterns — the shape a
/// scheduler wants when one task's claim is tested against every other's.
///
/// Its [`Matcher::overlapping`] filters the ARGUMENT (contrast the free
/// [`overlapping`], which filters its first argument).
///
/// ```
/// use glob_intersect::{Matcher, Options};
///
/// let scope = Matcher::new(&["src/api/**", "src/db/**"], Options::default())?;
///
/// assert!(scope.matches("src/api/user.ts"));
/// assert!(!scope.matches("test/api/user.test.ts"));
/// assert_eq!(scope.overlapping(&["docs/**", "src/db/pool.ts"])?, ["src/db/pool.ts"]);
/// # Ok::<(), glob_intersect::Error>(())
/// ```
#[derive(Debug, Clone)]
pub struct Matcher {
    patterns: Vec<String>,
    parsed: Vec<Vec<String>>,
    opts: Options,
}

impl Matcher {
    /// Compile a pattern-set once, then query it many times.
    ///
    /// # Errors
    ///
    /// [`Error::UnsupportedSyntax`] or [`Error::PatternTooDeep`] for the first
    /// pattern that uses syntax this crate refuses.
    pub fn new<P: AsRef<str>>(patterns: &[P], opts: Options) -> Result<Self, Error> {
        let patterns: Vec<String> = patterns.iter().map(|p| p.as_ref().to_string()).collect();
        let parsed = parse_patterns(&patterns)?;
        Ok(Self {
            patterns,
            parsed,
            opts,
        })
    }

    /// The source patterns, in the order supplied.
    pub fn patterns(&self) -> &[String] {
        &self.patterns
    }

    /// The matching semantics baked into every query.
    pub fn options(&self) -> Options {
        self.opts
    }

    /// Does a concrete path match this set?
    ///
    /// The path is read as the literal name it is, not as a glob. It cannot
    /// fail: the patterns were checked when the matcher was built.
    pub fn matches(&self, path: &str) -> bool {
        let target = parse_path(path);
        // A quoted path holds no syntax to refuse, and the patterns passed the
        // same check in `new`, so the error arm is unreachable.
        self.parsed
            .iter()
            .any(|pat| overlap(&target, pat, self.opts).unwrap_or(false))
    }

    /// Does this set overlap another pattern-set?
    ///
    /// Pass another matcher's [`Matcher::patterns`] to compare two compiled
    /// sets; the argument is parsed again, so this matcher's options apply.
    ///
    /// # Errors
    ///
    /// [`Error::UnsupportedSyntax`] or [`Error::PatternTooDeep`] from `other`.
    pub fn intersects<P: AsRef<str>>(&self, other: &[P]) -> Result<bool, Error> {
        let others = parse_patterns(other)?;
        for a in &self.parsed {
            for b in &others {
                if overlap(a, b, self.opts)? {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }

    /// Which of `candidates` overlap this set, in the order given (filters the
    /// argument).
    ///
    /// # Errors
    ///
    /// [`Error::UnsupportedSyntax`] or [`Error::PatternTooDeep`] from the first
    /// candidate that uses syntax this crate refuses.
    pub fn overlapping<P: AsRef<str>>(&self, candidates: &[P]) -> Result<Vec<String>, Error> {
        let mut hits = Vec::new();
        for c in candidates {
            let cand = parse_pattern(c.as_ref())?;
            let mut hit = false;
            for a in &self.parsed {
                if overlap(a, &cand, self.opts)? {
                    hit = true;
                    break;
                }
            }
            if hit {
                hits.push(c.as_ref().to_string());
            }
        }
        Ok(hits)
    }

    /// An example path common to this set and `other`, or `None`.
    ///
    /// # Errors
    ///
    /// [`Error::UnsupportedSyntax`] or [`Error::PatternTooDeep`] from `other`.
    pub fn witness<P: AsRef<str>>(&self, other: &[P]) -> Result<Option<String>, Error> {
        let others = parse_patterns(other)?;
        for a in &self.parsed {
            for b in &others {
                // `spellable`: skip a path whose last segment is empty, which no
                // path string can spell, and search on for one that can be.
                if let Some(w) = segments::search(&as_strs(a), &as_strs(b), &self.opts, true)? {
                    return Ok(Some(w.join(SEPARATOR)));
                }
            }
        }
        Ok(None)
    }
}

/// Compile a pattern-set once, then query it many times — the peer's spelling
/// of [`Matcher::new`].
///
/// Kept so the two tiers name the same operation the same way. Rust callers
/// should reach for [`Matcher::new`].
///
/// # Errors
///
/// As [`Matcher::new`].
pub fn compile<P: AsRef<str>>(patterns: &[P], opts: Options) -> Result<Matcher, Error> {
    Matcher::new(patterns, opts)
}

/// Do two pattern-sets share a common matching path? The load-bearing primitive.
///
/// A pattern with no wildcards is an EXACT-path match, so `src/x` and `src/x/y`
/// are disjoint (a child is not the path); opt into a subtree with a trailing
/// `**`. Dotfiles are excluded unless [`Options::dot`] is set.
///
/// # Errors
///
/// [`Error::UnsupportedSyntax`] or [`Error::PatternTooDeep`] for a pattern that
/// uses syntax this crate refuses.
///
/// ```
/// use glob_intersect::{Options, intersects};
///
/// let o = Options::default();
/// assert!(intersects(&["src/api/**"], &["src/api/handler.ts"], o)?);
/// assert!(!intersects(&["src/api/**"], &["src/web/**"], o)?);
///
/// // Exact-match rule (no wildcards):
/// assert!(intersects(&["src/siteA/components"], &["src/siteA/components"], o)?);
/// assert!(!intersects(&["src/siteA/components"], &["src/siteA/components/Button.vue"], o)?);
///
/// // Dot default:
/// assert!(!intersects(&["*"], &[".env"], o)?);
/// assert!(intersects(&["*"], &[".env"], Options { dot: true, ..o })?);
/// # Ok::<(), glob_intersect::Error>(())
/// ```
pub fn intersects<A: AsRef<str>, B: AsRef<str>>(
    a: &[A],
    b: &[B],
    opts: Options,
) -> Result<bool, Error> {
    Matcher::new(a, opts)?.intersects(b)
}

/// Does a concrete path match any pattern in the set?
///
/// The `path` is read as the literal name it is; the patterns are globs.
///
/// # Errors
///
/// As [`intersects`], for `patterns`.
///
/// ```
/// use glob_intersect::{Options, matches};
///
/// assert!(matches("src/api/user.ts", &["src/api/**", "docs/**"], Options::default())?);
/// assert!(!matches("README.md", &["src/api/**", "docs/**"], Options::default())?);
///
/// // A path with a glob character is that literal name, not a class.
/// assert!(!matches("pages/[id].vue", &["pages/d.vue"], Options::default())?);
/// assert!(matches("pages/[id].vue", &[r"pages/\[id\].vue"], Options::default())?);
/// # Ok::<(), glob_intersect::Error>(())
/// ```
pub fn matches<P: AsRef<str>>(path: &str, patterns: &[P], opts: Options) -> Result<bool, Error> {
    Ok(Matcher::new(patterns, opts)?.matches(path))
}

/// Which patterns in the set match a concrete path, in the order given.
///
/// The `path` is read as the literal name it is; the patterns are globs.
///
/// # Errors
///
/// As [`intersects`], for the first pattern that uses refused syntax.
///
/// ```
/// use glob_intersect::{Options, which_match};
///
/// let hits = which_match("src/api/user.ts", &["src/api/**", "src/**", "docs/**"], Options::default())?;
/// assert_eq!(hits, ["src/api/**", "src/**"]);
/// # Ok::<(), glob_intersect::Error>(())
/// ```
pub fn which_match<P: AsRef<str>>(
    path: &str,
    patterns: &[P],
    opts: Options,
) -> Result<Vec<String>, Error> {
    let target = parse_path(path);
    let mut hits = Vec::new();
    for p in patterns {
        if overlap(&target, &parse_pattern(p.as_ref())?, opts)? {
            hits.push(p.as_ref().to_string());
        }
    }
    Ok(hits)
}

/// Which patterns in `query` overlap the `candidates` set, in `query` order —
/// the conflict-detection primitive.
///
/// Returns a subset of the FIRST argument, `query`. Contrast
/// [`Matcher::overlapping`], which returns a subset of ITS argument — the two
/// conventions filter opposite sides.
///
/// # Errors
///
/// As [`intersects`].
///
/// ```
/// use glob_intersect::{Options, overlapping};
///
/// let task_a = ["src/api/**", "src/db/schema.ts"];
/// let task_b = ["src/api/routes/*.ts", "docs/**"];
///
/// // The overlapping claim → a predicted conflict.
/// assert_eq!(overlapping(&task_a, &task_b, Options::default())?, ["src/api/**"]);
/// assert!(overlapping(&["docs/**"], &task_a, Options::default())?.is_empty());
/// # Ok::<(), glob_intersect::Error>(())
/// ```
pub fn overlapping<Q: AsRef<str>, C: AsRef<str>>(
    query: &[Q],
    candidates: &[C],
    opts: Options,
) -> Result<Vec<String>, Error> {
    let parsed_candidates = parse_patterns(candidates)?;
    let mut hits = Vec::new();
    for q in query {
        let qp = parse_pattern(q.as_ref())?;
        for c in &parsed_candidates {
            if overlap(&qp, c, opts)? {
                hits.push(q.as_ref().to_string());
                break;
            }
        }
    }
    Ok(hits)
}

/// An example path common to both sets (turns "overlap" into "overlap at X"), or
/// `None` when disjoint.
///
/// The returned string always matches both sets. The search skips a common path
/// whose last segment is empty — no path string spells it, since [`parse`]
/// drops a trailing separator — and goes on to the next shortest one that can be
/// spelled. It returns `None` only when no such path exists, even though
/// [`intersects`] (which answers over segment vectors) may say `true`.
///
/// # Errors
///
/// As [`intersects`].
///
/// ```
/// use glob_intersect::{Options, witness};
///
/// let w = witness(&["src/api/**"], &["src/api/handler.ts"], Options::default())?;
/// assert_eq!(w.as_deref(), Some("src/api/handler.ts"));
/// assert_eq!(witness(&["src/api/**"], &["src/web/**"], Options::default())?, None);
/// # Ok::<(), glob_intersect::Error>(())
/// ```
pub fn witness<A: AsRef<str>, B: AsRef<str>>(
    a: &[A],
    b: &[B],
    opts: Options,
) -> Result<Option<String>, Error> {
    Matcher::new(a, opts)?.witness(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn code(result: Result<bool, Error>) -> &'static str {
        result.map(|_| "OK").unwrap_or_else(|e| e.code())
    }

    #[test]
    fn brace_depth_64_is_accepted_and_65_is_refused() {
        let o = Options::default();
        for (n, closed) in [(64, true), (64, false)] {
            let p = format!(
                "{}a{}",
                "{".repeat(n),
                if closed { "}".repeat(n) } else { String::new() }
            );
            assert_eq!(
                code(intersects(&[&p], &["x"], o)),
                "OK",
                "depth {n}, closed {closed}"
            );
        }
        for (n, closed) in [(65, true), (65, false), (100, false)] {
            let p = format!(
                "{}a{}",
                "{".repeat(n),
                if closed { "}".repeat(n) } else { String::new() }
            );
            assert_eq!(
                code(intersects(&[&p], &["x"], o)),
                "PATTERN_TOO_DEEP",
                "depth {n}, closed {closed}"
            );
        }
    }

    #[test]
    fn unsupported_syntax_is_refused_and_escaped_syntax_is_text() {
        let o = Options::default();
        for p in ["{1..3}", "{a/b}", "[a/b]", "+(a|b)", "!(b)"] {
            assert_eq!(
                code(intersects(&[p], &["x"], o)),
                "UNSUPPORTED_SYNTAX",
                "{p}"
            );
        }
        assert_eq!(code(intersects(&[r"\(a|b)"], &[r"\(a|b)"], o)), "OK");
        assert_eq!(code(intersects(&["{a", "x"], &["x"], o)), "OK");
    }

    #[test]
    fn a_path_is_read_literally_and_a_pattern_as_a_glob() {
        let o = Options::default();
        assert!(!matches("pages/[id].vue", &["pages/d.vue"], o).unwrap());
        assert!(matches("pages/[id].vue", &[r"pages/\[id\].vue"], o).unwrap());
        assert!(matches("a(b)", &[r"a\(b)"], o).unwrap());
    }
}
