//! Inline tags, through a lexer the caller supplies.
//!
//! What counts as a `#tag` differs between tools (Obsidian's rules, a plain
//! Unicode word, ASCII only), so this crate does not decide. A [`TagLexer`]
//! returns one list per dialect it knows, in its own order, and the graph
//! keeps every list from the one read of each body. A caller reads a dialect
//! by its slot. [`NoTags`], the default, finds none.

/// Finds the inline tags in a note body.
pub trait TagLexer {
    /// The tags in `body`, one list per dialect, in the lexer's own order.
    /// The graph dedupes each list, keeping the first occurrence.
    fn lex(&self, body: &str) -> Vec<Vec<String>>;
}

/// A lexer that finds no tags.
#[derive(Debug, Clone, Copy, Default)]
pub struct NoTags;

impl TagLexer for NoTags {
    fn lex(&self, _body: &str) -> Vec<Vec<String>> {
        Vec::new()
    }
}

/// Every closure from a body to its per-dialect lists is a lexer.
impl<F> TagLexer for F
where
    F: Fn(&str) -> Vec<Vec<String>>,
{
    fn lex(&self, body: &str) -> Vec<Vec<String>> {
        self(body)
    }
}

/// Counts tags across notes: one count per note that carries the tag (not
/// per occurrence), sorted by count descending, then tag ascending.
pub fn census(per_note: impl IntoIterator<Item = Vec<String>>) -> Vec<TagCount> {
    let mut counts: std::collections::BTreeMap<String, u64> = Default::default();
    for tags in per_note {
        let mut seen = std::collections::HashSet::new();
        for tag in tags {
            if seen.insert(tag.clone()) {
                *counts.entry(tag).or_insert(0) += 1;
            }
        }
    }
    let mut out: Vec<TagCount> = counts
        .into_iter()
        .map(|(tag, count)| TagCount { tag, count })
        .collect();
    out.sort_by(|a, b| b.count.cmp(&a.count).then(a.tag.cmp(&b.tag)));
    out
}

/// One tag and how many notes carry it. See [`census`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TagCount {
    /// The tag, without `#`.
    pub tag: String,
    /// How many notes carry it.
    pub count: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn census_counts_notes_not_occurrences() {
        let got = census(vec![
            vec!["a".into(), "a".into(), "b".into()],
            vec!["a".into()],
        ]);
        assert_eq!(
            got,
            vec![
                TagCount {
                    tag: "a".into(),
                    count: 2
                },
                TagCount {
                    tag: "b".into(),
                    count: 1
                },
            ]
        );
    }

    #[test]
    fn a_closure_is_a_lexer_and_no_tags_finds_none() {
        let lexer = |body: &str| vec![body.split_whitespace().map(str::to_string).collect()];
        assert_eq!(lexer.lex("x y"), vec![vec!["x", "y"]]);
        assert!(NoTags.lex("#a").is_empty());
    }
}
