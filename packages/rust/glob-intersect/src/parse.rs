//! L1 — parse a path-like glob string into a segment pattern.
//!
//! The seam between path strings and the segment core: it splits a path-like
//! glob on the separator into segments, each of which is a glob token taken
//! verbatim. No inference — there is NO directory/file/ambiguity classification,
//! so a bare path (`src/siteA/components`) is an exact-path match and a subtree
//! is written explicitly (`src/siteA/components/**`).

/// The separator the path API splits on, and joins a witness back with.
pub const SEPARATOR: &str = "/";

/// Split a path-like glob into segments on `/`.
///
/// Each segment is a glob token, verbatim — no classification. A trailing
/// separator (which splits into an empty final segment) is normalized off, so
/// `src/api/` == `src/api`. Nothing else is collapsed or inferred.
///
/// ```
/// use glob_intersect::parse;
///
/// assert_eq!(parse("src/api/**"), ["src", "api", "**"]);
/// assert_eq!(parse("src/api/"), ["src", "api"]); // trailing separator normalized off
/// assert_eq!(parse("README.md"), ["README.md"]); // no wildcards → an exact-path match
/// ```
pub fn parse(path_like: &str) -> Vec<String> {
    parse_with(path_like, SEPARATOR)
}

/// [`parse`] with an explicit separator.
///
/// An empty `separator` is treated as `/` — splitting on nothing has no
/// meaningful path reading.
pub fn parse_with(path_like: &str, separator: &str) -> Vec<String> {
    let sep = if separator.is_empty() {
        SEPARATOR
    } else {
        separator
    };
    let mut segments: Vec<String> = path_like.split(sep).map(str::to_string).collect();
    // Normalize off a trailing separator: an empty final segment from a path
    // that ends with the separator. Only the one trailing empty is dropped.
    if segments.len() > 1 && segments.last().is_some_and(String::is_empty) {
        segments.pop();
    }
    segments
}

/// The characters the segment tokenizer reads as glob syntax (and `(`, which
/// opens an extglob).
const GLOB_META: [char; 8] = ['\\', '*', '?', '[', ']', '{', '}', '('];

/// Quote a concrete path so the pattern parser reads it as the literal name it
/// is. The root `matches` family runs a real path through this
/// before parsing, so `pages/[id].vue` is that name and not a character class.
pub(crate) fn literal(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for ch in path.chars() {
        if GLOB_META.contains(&ch) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_one_trailing_empty_segment_is_dropped() {
        assert_eq!(parse("src/api//"), ["src", "api", ""]);
        assert_eq!(parse("/"), [""]);
        assert_eq!(parse(""), [""]);
    }

    #[test]
    fn literal_quotes_every_glob_character() {
        assert_eq!(literal("pages/[id].vue"), "pages/\\[id\\].vue");
        assert_eq!(literal("a*?{}(\\"), "a\\*\\?\\{\\}\\(\\\\");
        assert_eq!(literal("plain/path.ts"), "plain/path.ts");
    }

    #[test]
    fn a_custom_separator_splits_on_the_whole_string() {
        assert_eq!(parse_with("a::b::c", "::"), ["a", "b", "c"]);
        assert_eq!(parse_with("a/b", ""), ["a", "b"]);
    }
}
