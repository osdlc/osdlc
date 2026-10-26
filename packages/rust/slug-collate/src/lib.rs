//! Slugify and deterministic collation.
//!
//! **Slugify.** Turn a human title into a filename or an id. For non-ASCII
//! titles the normalisation form matters. NFKD followed by dropping the
//! combining marks turns `café` into `cafe`, not `caf`. A naive `[^a-z0-9]`
//! filter would collapse `Ärzte` and `Rzte` to the same slug, which is a
//! filename collision in a folder a person reads.
//!
//! **Collation.** JavaScript's `localeCompare` depends on ICU data and the
//! host locale, so two machines can disagree about sort order. That matters
//! when the order ends up hashed or rendered. [`compare`] is a portable
//! substitute: case-insensitive, accent-folded, with ties broken by the raw
//! bytes so the order is total. It is not a reimplementation of ICU. A
//! caller that needs locale-aware ordering should use a collation library.

#![doc = include_str!("../README.md")]

use unicode_normalization::UnicodeNormalization;

/// Options for [`slugify_with`].
///
/// `SlugOptions` is `#[non_exhaustive]`, so build it with a constructor and
/// then set the fields you care about, never a struct literal:
///
/// ```
/// use slug_collate::SlugOptions;
/// let mut o = SlugOptions::new();
/// o.drop_apostrophes = false;
/// ```
///
/// Use [`SlugOptions::with_max_len`] to start from a length cap:
///
/// ```
/// use slug_collate::SlugOptions;
/// let o = SlugOptions::with_max_len(40);
/// assert_eq!(o.max_len, Some(40));
/// ```
#[derive(Debug, Clone)]
#[non_exhaustive]
pub struct SlugOptions {
    /// Trim to at most this many characters (after slugification).
    pub max_len: Option<usize>,
    /// Drop apostrophes instead of turning them into separators, so
    /// `Sam's Note` becomes `sams-note` rather than `sam-s-note`.
    pub drop_apostrophes: bool,
    /// The character that joins words and replaces runs of non-alphanumerics.
    pub separator: char,
}

impl Default for SlugOptions {
    fn default() -> Self {
        SlugOptions {
            max_len: None,
            drop_apostrophes: true,
            separator: '-',
        }
    }
}

impl SlugOptions {
    /// The default options: no length cap, apostrophes dropped, `-` separator.
    ///
    /// # Examples
    ///
    /// ```
    /// use slug_collate::{slugify_with, SlugOptions};
    /// let mut o = SlugOptions::new();
    /// o.drop_apostrophes = false;
    /// assert_eq!(slugify_with("Sam's Note", &o), "sam-s-note");
    /// ```
    pub fn new() -> Self {
        Self::default()
    }

    /// The default options with `max_len` set to `len`.
    ///
    /// # Examples
    ///
    /// ```
    /// use slug_collate::{slugify_with, SlugOptions};
    /// let o = SlugOptions::with_max_len(11);
    /// assert_eq!(slugify_with("hello world again", &o), "hello-world");
    /// ```
    pub fn with_max_len(len: usize) -> Self {
        SlugOptions {
            max_len: Some(len),
            ..Default::default()
        }
    }
}

/// Slugify with the default rules.
///
/// # Examples
///
/// ```
/// use slug_collate::slugify;
/// assert_eq!(slugify("Café au Lait"), "cafe-au-lait");
/// assert_eq!(slugify("Sam's Note"), "sams-note");
/// ```
pub fn slugify(input: &str) -> String {
    slugify_with(input, &SlugOptions::default())
}

/// Lowercase, NFKD, strip combining marks, non-alphanumerics to the
/// separator, collapse runs, trim, cap length.
///
/// # Examples
///
/// ```
/// use slug_collate::{slugify_with, SlugOptions};
/// let mut o = SlugOptions::new();
/// o.separator = '_';
/// assert_eq!(slugify_with("Hello World", &o), "hello_world");
/// ```
pub fn slugify_with(input: &str, opts: &SlugOptions) -> String {
    let sep = opts.separator;
    let mut decomposed = String::with_capacity(input.len());
    for c in input.nfkd() {
        // Drop the combining-diacritic blocks NFKD splits off Latin, Greek and
        // Cyrillic letters. Other scripts' marks are not stripped here.
        if is_combining_mark(c) {
            continue;
        }
        decomposed.push(c);
    }

    let mut out = String::with_capacity(decomposed.len());
    let mut last_was_sep = true; // suppresses a leading separator
    for c in decomposed.chars() {
        if opts.drop_apostrophes && matches!(c, '\'' | '\u{2019}') {
            continue;
        }
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            last_was_sep = false;
        } else if c.is_alphanumeric() {
            // Non-Latin scripts survive NFKD intact; keep them rather than
            // slugging a Cyrillic title down to nothing.
            out.extend(c.to_lowercase());
            last_was_sep = false;
        } else if !last_was_sep {
            out.push(sep);
            last_was_sep = true;
        }
    }
    while out.ends_with(sep) {
        out.pop();
    }

    if let Some(max) = opts.max_len
        && out.chars().count() > max
    {
        let truncated: String = out.chars().take(max).collect();
        out = truncated.trim_end_matches(sep).to_string();
    }
    out
}

fn is_combining_mark(c: char) -> bool {
    matches!(c as u32,
        0x0300..=0x036F   // combining diacritical marks
        | 0x1AB0..=0x1AFF
        | 0x1DC0..=0x1DFF
        | 0x20D0..=0x20FF
        | 0xFE20..=0xFE2F)
}

/// Deterministic, portable string comparison. See the module docs for why
/// this exists instead of `localeCompare`.
///
/// # Examples
///
/// ```
/// use slug_collate::compare;
/// use std::cmp::Ordering;
/// // Case and accents fold, but the order is total: ties break by raw bytes.
/// assert_eq!(compare("café", "cafe"), Ordering::Greater);
/// assert_eq!(compare("Zebra", "apple"), Ordering::Greater);
/// ```
pub fn compare(a: &str, b: &str) -> std::cmp::Ordering {
    let ka = collation_key(a);
    let kb = collation_key(b);
    ka.cmp(&kb).then_with(|| a.cmp(b))
}

/// The key [`compare_paths`] orders by, for `sort_by_cached_key`: per segment,
/// the collation key with the raw segment as its tiebreak (matching
/// [`compare`]). Sorting by this key produces exactly `compare_paths`' order
/// while building each key once instead of on every comparison.
///
/// # Examples
///
/// ```
/// use slug_collate::{compare_paths, path_sort_key};
/// let mut paths = vec!["Notes/b.md", "Notes/a.md", "Notes"];
/// paths.sort_by_cached_key(|p| path_sort_key(p));
/// assert_eq!(paths, vec!["Notes", "Notes/a.md", "Notes/b.md"]);
/// // Sorting by the key matches compare_paths exactly.
/// let mut by_cmp = paths.clone();
/// by_cmp.sort_by(|a, b| compare_paths(a, b));
/// assert_eq!(paths, by_cmp);
/// ```
pub fn path_sort_key(path: &str) -> Vec<(String, String)> {
    path.split('/')
        .map(|seg| (collation_key(seg), seg.to_string()))
        .collect()
}

/// Path comparison: segment by segment, so `a/b` sorts before `a-b/c` the way
/// a human reading a tree expects rather than the way raw bytes order `/`.
///
/// # Examples
///
/// ```
/// use slug_collate::compare_paths;
/// use std::cmp::Ordering;
/// // Byte order puts `a-b/c` first because `-` < `/`; segment order does not.
/// assert_eq!(compare_paths("a/b", "a-b/c"), Ordering::Less);
/// assert_eq!(compare_paths("Notes", "Notes/a.md"), Ordering::Less);
/// ```
pub fn compare_paths(a: &str, b: &str) -> std::cmp::Ordering {
    let mut ai = a.split('/');
    let mut bi = b.split('/');
    loop {
        match (ai.next(), bi.next()) {
            (None, None) => return a.cmp(b),
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (Some(x), Some(y)) => {
                let ord = compare(x, y);
                if ord != std::cmp::Ordering::Equal {
                    return ord;
                }
            }
        }
    }
}

fn collation_key(s: &str) -> String {
    s.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(|c| c.to_lowercase())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_slugs() {
        assert_eq!(slugify("Hello World"), "hello-world");
        assert_eq!(slugify("  Leading and trailing  "), "leading-and-trailing");
        assert_eq!(slugify("Multiple   spaces"), "multiple-spaces");
        assert_eq!(slugify("Punctuation!?;: here"), "punctuation-here");
        assert_eq!(slugify(""), "");
        assert_eq!(slugify("!!!"), "");
    }

    #[test]
    fn nfkd_folds_accents_rather_than_dropping_letters() {
        // The reason NFKD is specified: a naive ASCII filter turns `café`
        // into `caf`, which collides with a different note.
        assert_eq!(slugify("café"), "cafe");
        assert_eq!(slugify("Ärzte"), "arzte");
        assert_eq!(slugify("naïve résumé"), "naive-resume");
        assert_ne!(slugify("Ärzte"), slugify("rzte"));
    }

    #[test]
    fn apostrophes_do_not_split_words_by_default() {
        assert_eq!(slugify("Sam's Note"), "sams-note");
        assert_eq!(slugify("Sam\u{2019}s Note"), "sams-note");
        let opts = SlugOptions {
            drop_apostrophes: false,
            ..Default::default()
        };
        assert_eq!(slugify_with("Sam's Note", &opts), "sam-s-note");
    }

    #[test]
    fn length_caps_never_leave_a_trailing_separator() {
        let opts = SlugOptions::with_max_len(11);
        assert_eq!(slugify_with("hello world again", &opts), "hello-world");
        let opts = SlugOptions::with_max_len(6);
        assert_eq!(slugify_with("hello world", &opts), "hello");
    }

    #[test]
    fn non_latin_scripts_survive() {
        assert_eq!(slugify("Привет мир"), "привет-мир");
        assert_eq!(slugify("中文 标题"), "中文-标题");
    }

    #[test]
    fn collation_is_case_and_accent_insensitive_but_total() {
        use std::cmp::Ordering;
        assert_eq!(compare("apple", "Apple"), Ordering::Greater); // tie broken by bytes
        assert_eq!(compare("apple", "banana"), Ordering::Less);
        assert_eq!(compare("café", "cafe"), Ordering::Greater); // folds equal, bytes break the tie
        assert_eq!(compare("Zebra", "apple"), Ordering::Greater); // NOT byte order, where Z < a
    }

    #[test]
    fn collation_is_deterministic_and_a_total_order() {
        let mut v = vec!["Zebra", "apple", "Apple", "éclair", "eclair", "banana"];
        v.sort_by(|a, b| compare(a, b));
        let once = v.clone();
        v.sort_by(|a, b| compare(a, b));
        assert_eq!(v, once, "sorting an already-sorted list must be stable");
        assert_eq!(
            v,
            vec!["Apple", "apple", "banana", "eclair", "éclair", "Zebra"]
        );
    }

    #[test]
    fn path_comparison_is_segment_wise() {
        use std::cmp::Ordering;
        // Byte order puts `a-b/c` before `a/b` because `-` < `/`; segment
        // order does not, which is what a tree view expects.
        assert_eq!(compare_paths("a/b", "a-b/c"), Ordering::Less);
        assert_eq!(compare_paths("Notes/a.md", "Notes/b.md"), Ordering::Less);
        assert_eq!(compare_paths("Notes", "Notes/a.md"), Ordering::Less);
    }

    #[test]
    fn the_sort_key_orders_exactly_like_compare_paths() {
        let mut by_cmp = vec![
            "a/b",
            "a-b/c",
            "Notes/a.md",
            "Notes",
            "Ürsula/x",
            "ursula/y",
            "a/b/c",
            "A/B",
        ];
        let mut by_key = by_cmp.clone();
        by_cmp.sort_by(|a, b| compare_paths(a, b));
        by_key.sort_by_cached_key(|p| path_sort_key(p));
        assert_eq!(by_cmp, by_key);
    }
}
