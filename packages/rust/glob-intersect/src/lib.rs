//! A path-pattern overlap engine.
//!
//! It answers one question: **do two globs share a common matching path?** Pure
//! pattern algebra over patterns-as-languages — it never touches the filesystem,
//! except through the opt-in [`fs`] layer.
//!
//! This crate is the Rust twin of `@osdlc/intersect`. Both are held in
//! agreement by one language-neutral corpus that `@osdlc/intersect` owns
//! (its `fixtures/*.cases.json`); this crate's tests read it in place.
//!
//! # The rule: exact match vs. subtree
//!
//! A pattern with **no wildcards is an exact-path match**. There is no
//! directory/file inference and no ambiguity error: a bare path is exactly that
//! path, and you opt into a subtree with `/**`.
//!
//! ```
//! use glob_intersect::{Options, intersects};
//!
//! let o = Options::default();
//! // No wildcards → an EXACT-path match:
//! assert!(intersects(&["src/siteA/components"], &["src/siteA/components"], o)?);
//! assert!(!intersects(&["src/siteA/components"], &["src/siteA/components/Button.vue"], o)?);
//! // A subtree is opted into explicitly with `**`:
//! assert!(intersects(&["src/siteA/components/**"], &["src/siteA/components/Button.vue"], o)?);
//! # Ok::<(), glob_intersect::Error>(())
//! ```
//!
//! # The layers
//!
//! | Module | Layer | What it is |
//! |---|---|---|
//! | the crate root | L1 path API | Friendly surface: parses glob strings, set-aware primitives. |
//! | [`registry`] | L1 registry | A reverse index over labeled pattern-sets. |
//! | [`segments`] | L0 core | Pure engine over pre-split segment arrays — no strings, no disk. |
//! | [`fs`] | L2 filesystem | Resolution against a real on-disk tree (the `fs` feature). |
//!
//! # Overlap, with a witness
//!
//! ```
//! use glob_intersect::{Options, intersects, witness};
//!
//! let o = Options::default();
//! assert!(intersects(&["src/**/*.ts"], &["src/api/handler.ts"], o)?); // the file is inside the glob
//! assert!(!intersects(&["src/api/**"], &["src/web/**"], o)?);         // disjoint subtrees
//!
//! // "They overlap" becomes "they overlap at X" for free — the witness is the
//! // path the engine already walked to prove it.
//! assert_eq!(
//!     witness(&["src/api/**"], &["src/**/handler.ts"], o)?.as_deref(),
//!     Some("src/api/handler.ts"),
//! );
//! # Ok::<(), glob_intersect::Error>(())
//! ```
//!
//! # Supported syntax and errors
//!
//! A pattern with syntax this crate does not support is refused when it is
//! compiled, with [`Error::UnsupportedSyntax`]: `{a..b}` number ranges, a
//! `{...}` group or `[...]` class that holds a `/`, and extglobs such as
//! `+(a|b)` or `!(b)`. Escape a `(` to match it as text. An unclosed `{` or `[`
//! is plain text. A pattern with `{` groups nested more than 64 deep is
//! [`Error::PatternTooDeep`]. So every function that reads a pattern returns
//! `Result<_, Error>`, and [`Error::code`] gives the same code string as the
//! TypeScript peer's `IntersectError`.
//!
//! # Literal paths
//!
//! The patterns are globs, but the *path* given to [`matches`], [`which_match`],
//! [`Matcher::matches`] and the registry's `matching` is the literal name it is:
//! `matches("pages/[id].vue", &["pages/d.vue"], o)` is `false`. Escape the
//! pattern (`pages/\[id\].vue`) to name such a file. The `segments` layer still
//! reads its path as a pattern.
//!
//! # Options
//!
//! Every entry point takes [`Options`] by value — it is `Copy`, and
//! `Options::default()` is the dialect the corpus specifies (case-sensitive,
//! dotfiles excluded, ASCII-only case folding, a globstar may span zero segments).
//! The TypeScript peer's
//! optional-argument form has no clean Rust equivalent, so the argument is
//! always spelled.
//!
//! # Status
//!
//! Pattern-level negation (`!pat`) and a materialized `intersection(a, b)` are
//! deferred, as in the TypeScript peer.

#[cfg(feature = "fs")]
pub mod fs;
mod parse;
mod path;
pub mod registry;
pub mod segments;

pub use parse::{SEPARATOR, parse, parse_with};
pub use path::{Matcher, compile, intersects, matches, overlapping, which_match, witness};
pub use registry::{Labeled, Registry, index};

/// Matching semantics, shared by the segment core and the path API.
///
/// `Options::default()` is the dialect the shared conformance corpus specifies.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Options {
    /// Match paths ignoring case. Default `false`.
    pub case_insensitive: bool,
    /// Let `*`/`**` match a leading-dot segment. Default `false` (dotfiles are
    /// excluded).
    pub dot: bool,
    /// A globstar between separators may span zero segments (so `a/**/b` matches
    /// `a/b`). Default `true`.
    pub globstar_matches_zero: bool,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            case_insensitive: false,
            dot: false,
            globstar_matches_zero: true,
        }
    }
}

/// Everything this crate refuses to do, named.
///
/// Each variant has the same code as the TypeScript peer's `IntersectError`
/// (see [`Error::code`]). The peer's `INVALID_ARGUMENT` has no variant here: it
/// guards against a non-string argument, which the Rust types rule out.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum Error {
    /// Two [`Labeled`] entries declared the same id.
    #[error("duplicate registry id '{0}'")]
    DuplicateRegistryId(String),
    /// A pattern nests `{...}` groups deeper than the limit (64).
    #[error("pattern nests {{...}} groups more than 64 deep")]
    PatternTooDeep,
    /// A pattern uses syntax this crate does not support: a `{a..b}` number
    /// range, a `{...}` group or `[...]` class that holds a `/`, or an extglob
    /// such as `+(a|b)`.
    #[error("unsupported syntax in '{pattern}': {what}")]
    UnsupportedSyntax {
        /// The pattern that was refused.
        pattern: String,
        /// What was not supported.
        what: String,
    },
    /// The filesystem layer could not resolve or walk the tree.
    #[cfg(feature = "fs")]
    #[error("filesystem walk failed: {0}")]
    Io(#[from] std::io::Error),
}

impl Error {
    /// The stable code for this error, the same string as the TypeScript
    /// peer's `IntersectError.code`: `DUPLICATE_REGISTRY_ID`,
    /// `PATTERN_TOO_DEEP`, `UNSUPPORTED_SYNTAX` or `IO_ERROR`.
    pub fn code(&self) -> &'static str {
        match self {
            Error::DuplicateRegistryId(_) => "DUPLICATE_REGISTRY_ID",
            Error::PatternTooDeep => "PATTERN_TOO_DEEP",
            Error::UnsupportedSyntax { .. } => "UNSUPPORTED_SYNTAX",
            #[cfg(feature = "fs")]
            Error::Io(_) => "IO_ERROR",
        }
    }
}

#[cfg(feature = "fs")]
impl From<walkdir::Error> for Error {
    fn from(err: walkdir::Error) -> Self {
        // walkdir wraps an io::Error for every real failure; the loop-detection
        // case has none, so it is reported as its own message.
        match err.io_error() {
            Some(io) => Error::Io(std::io::Error::new(io.kind(), err.to_string())),
            None => Error::Io(std::io::Error::other(err.to_string())),
        }
    }
}
