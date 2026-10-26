//! Slugify and deterministic collation.
//!
//! **Slugify.** Turn a human title into a filename or an id. For non-ASCII
//! titles the normalisation form matters. NFKC, splitting the marks off and
//! dropping only the decorative ones, turns `café` into `cafe`, not `caf`. A
//! naive `[^a-z0-9]` filter would collapse `Ärzte` and `Rzte` to the same
//! slug, which is a filename collision in a folder a person reads. Marks that
//! tell words apart, such as kana voicing marks or Thai tone marks, stay in
//! the word with their letter.
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

/// Lowercase, NFKC, drop the decorative marks, non-alphanumerics to the
/// separator, collapse runs, trim, cap length. Each word comes out in NFC.
///
/// A combining mark stays in the word with its letter, so it never splits a
/// word or becomes a separator. Only optional decoration is dropped: Latin,
/// Greek and Cyrillic diacritics (`café` becomes `cafe`), Hebrew niqqud and
/// cantillation, and Arabic harakat. Every other mark is kept, because it
/// tells words apart: kana voicing marks (`ガイド` is not `カイト`), Indic
/// viramas and vowel signs, Thai tone and vowel marks.
///
/// # Examples
///
/// ```
/// use slug_collate::{slugify, slugify_with, SlugOptions};
/// let mut o = SlugOptions::new();
/// o.separator = '_';
/// assert_eq!(slugify_with("Hello World", &o), "hello_world");
/// // The voicing mark stays on its kana.
/// assert_eq!(slugify("ガイド"), "ガイド");
/// assert_ne!(slugify("ガイド"), slugify("カイト"));
/// ```
pub fn slugify_with(input: &str, opts: &SlugOptions) -> String {
    let sep = opts.separator;
    let mut out = String::with_capacity(input.len());
    // The word being built, flushed through NFC at each separator so the kept
    // marks recompose with their letters (and Hangul jamo into syllables).
    let mut word = String::new();
    // NFKD is NFD of NFKC: the compatibility fold, with every mark split off
    // its letter so the decorative ones can be dropped one by one.
    for c in input.nfkd() {
        if is_decorative_mark(c) {
            continue;
        }
        if opts.drop_apostrophes && matches!(c, '\'' | '\u{2019}') {
            continue;
        }
        if unicode_normalization::char::is_combining_mark(c) {
            // A kept mark belongs to the letter before it. One with no letter
            // before it in the word has nothing to attach to and is dropped.
            if !word.is_empty() {
                word.push(c);
            }
        } else if c.is_ascii_alphanumeric() {
            word.push(c.to_ascii_lowercase());
        } else if c.is_alphanumeric() {
            // Non-Latin scripts survive the fold intact; keep them rather than
            // slugging a Cyrillic title down to nothing.
            word.extend(c.to_lowercase());
        } else if !word.is_empty() {
            // An empty word here is a leading separator or a run; skip it.
            out.extend(word.nfc());
            word.clear();
            out.push(sep);
        }
    }
    out.extend(word.nfc());
    while out.ends_with(sep) {
        out.pop();
    }

    if let Some(max) = opts.max_len
        && out.chars().count() > max
    {
        let chars: Vec<char> = out.chars().collect();
        // Never cut a letter off its marks: when the cut lands before a mark,
        // move it back to before that mark's letter.
        let mut end = max;
        while end > 0 && unicode_normalization::char::is_combining_mark(chars[end]) {
            end -= 1;
        }
        let truncated: String = chars[..end].iter().collect();
        out = truncated.trim_end_matches(sep).to_string();
    }
    out
}

/// The combining-diacritic blocks NFKD splits off Latin, Greek and Cyrillic
/// letters. [`compare`] folds exactly these, and slugs drop them too.
fn is_folded_diacritic(c: char) -> bool {
    matches!(c as u32,
        0x0300..=0x036F   // combining diacritical marks
        | 0x1AB0..=0x1AFF
        | 0x1DC0..=0x1DFF
        | 0x20D0..=0x20FF
        | 0xFE20..=0xFE2F)
}

/// The marks a slug drops as optional decoration: the folded diacritics, the
/// Cyrillic combining marks, Hebrew niqqud and cantillation, and Arabic
/// harakat and Quranic annotation. Arabic madda and hamza (`U+0653`-`U+0655`)
/// are kept: they are part of letters such as `أ` and recompose under NFC.
fn is_decorative_mark(c: char) -> bool {
    if is_folded_diacritic(c) {
        return true;
    }
    matches!(c as u32,
        // Cyrillic: titlo and the other combining marks.
        0x0483..=0x0489
        | 0x2DE0..=0x2DFF
        | 0xA66F..=0xA672
        | 0xA674..=0xA67D
        | 0xA69E..=0xA69F
        // Hebrew: cantillation and niqqud (not the maqaf or sof pasuq).
        | 0x0591..=0x05BD
        | 0x05BF
        | 0x05C1..=0x05C2
        | 0x05C4..=0x05C5
        | 0x05C7
        // Arabic: harakat, superscript alef and Quranic marks.
        | 0x0610..=0x061A
        | 0x064B..=0x0652
        | 0x0656..=0x065F
        | 0x0670
        | 0x06D6..=0x06DC
        | 0x06DF..=0x06E4
        | 0x06E7..=0x06E8
        | 0x06EA..=0x06ED
        | 0x0898..=0x089F
        | 0x08CA..=0x08E1
        | 0x08E3..=0x08FF)
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
        .filter(|c| !is_folded_diacritic(*c))
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
    fn marks_that_tell_words_apart_do_not_collide() {
        // Thai: ก่า and ก้า differ only in the tone mark. Both used to slug to
        // `ก-า`.
        let mai_ek = "\u{0E01}\u{0E48}\u{0E32}";
        let mai_tho = "\u{0E01}\u{0E49}\u{0E32}";
        assert_eq!(slugify(mai_ek), mai_ek);
        assert_eq!(slugify(mai_tho), mai_tho);
        assert_ne!(slugify(mai_ek), slugify(mai_tho));

        // Kana: カイド and カイト differ only in the voicing mark on the last
        // kana. Both used to slug to `カイト`.
        let kaido = "\u{30AB}\u{30A4}\u{30C9}";
        let kaito = "\u{30AB}\u{30A4}\u{30C8}";
        assert_eq!(slugify(kaido), kaido);
        assert_eq!(slugify(kaito), kaito);
        assert_ne!(slugify(kaido), slugify(kaito));
    }

    #[test]
    fn a_kept_mark_never_splits_a_word() {
        // ガイド: NFKD splits ガ and ド into a kana and U+3099. The mark used
        // to become a separator, giving `カ-イト`.
        let gaido = "\u{30AC}\u{30A4}\u{30C9}";
        assert_eq!(slugify(gaido), gaido);
        // The decomposed spelling and the halfwidth one fold to the same slug.
        assert_eq!(slugify("\u{30AB}\u{3099}\u{30A4}\u{30C8}\u{3099}"), gaido);
        assert_eq!(slugify("\u{FF76}\u{FF9E}\u{FF72}\u{FF84}\u{FF9E}"), gaido);

        // नमस्ते: the virama U+094D used to split it into `नमस-ते`.
        let namaste = "\u{0928}\u{092E}\u{0938}\u{094D}\u{0924}\u{0947}";
        let duniya = "\u{0926}\u{0941}\u{0928}\u{093F}\u{092F}\u{093E}";
        assert_eq!(slugify(namaste), namaste);
        assert_eq!(
            slugify(&format!("{namaste} {duniya}")),
            format!("{namaste}-{duniya}")
        );

        // A mark with no letter before it in its word is dropped, not turned
        // into a separator.
        assert_eq!(slugify("\u{3099}\u{30AB}"), "\u{30AB}");
        assert_eq!(slugify("\u{30AB} \u{3099}"), "\u{30AB}");
    }

    #[test]
    fn hangul_comes_out_as_precomposed_syllables() {
        // 한국어. NFKD splits each syllable into jamo; the slug recomposes them.
        let hangugeo = "\u{D55C}\u{AD6D}\u{C5B4}";
        assert_eq!(slugify(hangugeo), hangugeo);
        // Jamo input composes too.
        assert_eq!(slugify("\u{1112}\u{1161}\u{11AB}"), "\u{D55C}");
    }

    #[test]
    fn decorative_marks_are_still_dropped() {
        assert_eq!(slugify("café"), "cafe");
        assert_eq!(slugify("cafe\u{0301}"), "cafe");
        // Hebrew niqqud: שָׁלוֹם becomes שלום.
        assert_eq!(
            slugify("\u{05E9}\u{05C1}\u{05B8}\u{05DC}\u{05D5}\u{05B9}\u{05DD}"),
            "\u{05E9}\u{05DC}\u{05D5}\u{05DD}"
        );
        // Arabic harakat: مَرْحَبًا becomes مرحبا.
        assert_eq!(
            slugify("\u{0645}\u{064E}\u{0631}\u{0652}\u{062D}\u{064E}\u{0628}\u{064B}\u{0627}"),
            "\u{0645}\u{0631}\u{062D}\u{0628}\u{0627}"
        );
        // Hamza is part of the letter, not decoration: أ stays أ, not ا.
        assert_eq!(slugify("\u{0623}"), "\u{0623}");
    }

    #[test]
    fn a_length_cap_never_cuts_a_letter_off_its_marks() {
        // "ab ก่า" slugs to `ab-ก่า`; a cap of 4 lands between ก and its tone
        // mark, so the cut moves back before ก and the trailing separator goes.
        let opts = SlugOptions::with_max_len(4);
        assert_eq!(slugify_with("ab \u{0E01}\u{0E48}\u{0E32}", &opts), "ab");
        let opts = SlugOptions::with_max_len(5);
        assert_eq!(
            slugify_with("ab \u{0E01}\u{0E48}\u{0E32}", &opts),
            "ab-\u{0E01}\u{0E48}"
        );
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
