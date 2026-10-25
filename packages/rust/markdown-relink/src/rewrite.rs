//! One link at a time: where its target sits, and what that target should say.
//!
//! Two functions, and the split between them is the load-bearing part.
//! [`target_span`] answers "which bytes name the file" — never the whole link,
//! only the target — so an alias, a heading anchor, a block ref and an embed's
//! `!` are outside the span the rewrite touches and therefore survive byte for
//! byte without any code being written to preserve them. [`plan_link`] answers
//! "what should those bytes say now", against the corpus as it will be *after*
//! the move.
//!
//! # The four decisions, stated once
//!
//! | situation | outcome |
//! |---|---|
//! | the text as written still names the moved file, uniquely | **no edit** — a pure folder move leaves `[[Alpha]]` alone, and a case-only rename leaves everything alone |
//! | it no longer names it (a rename, or a pathed link whose folder changed) | rewrite to the shortest form that does, **at least as qualified as the author wrote it** |
//! | the bare name would now be ambiguous | rewrite qualified, and say so (`ambiguous_link`) |
//! | it never named it (a link broken before the rename) | not this module's business — the planner filters those out and diagnoses them |
//!
//! The "at least as qualified as the author wrote it" clause is what keeps
//! `[[Projects/Alpha]]` becoming `[[Projects/Beta]]` rather than `[[Beta]]`.
//! Both resolve; only one leaves the note looking like the person who wrote it
//! still wrote it.

use std::fmt::Write as _;
use std::ops::Range;

use markdown_link::BodyLink;
use markdown_link::BodyLinkKind;

use crate::plan::{Corpus, Resolution};

/// What to do with one inbound link.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LinkOutcome {
    /// The link already says the right thing. Not an absence of an answer — a
    /// *verified* one: the text was resolved against the post-move corpus and
    /// found to still name the moved file on its own.
    Unchanged,
    /// Replace the link target with `text`.
    Rewrite {
        /// The new target text.
        text: String,
        /// The bare name would have been ambiguous, so the form is qualified.
        qualified: bool,
    },
}

/// The byte range **within `body`** that names the target file.
///
/// `None` when the link's own syntax cannot be found where the scanner said it
/// was — possible where a link straddles a code-span boundary, because
/// `strip_code` blanks by character and a blanked multi-byte character is one
/// byte shorter than it was. A missed link is reported; a splice at a guessed
/// offset would corrupt the note.
pub fn target_span(body: &str, link: &BodyLink) -> Option<Range<usize>> {
    match link.kind {
        BodyLinkKind::Wikilink | BodyLinkKind::Embed => {
            // `body_links` puts an embed's `!` inside the span, because a
            // rename has to be able to see it. The inner text therefore starts
            // three bytes in for an embed and two for a wikilink — all ASCII,
            // so the arithmetic is safe.
            let inner_start = link.byte_start
                + if link.kind == BodyLinkKind::Embed {
                    3
                } else {
                    2
                };
            if body.get(inner_start..inner_start + link.raw.len()) != Some(link.raw.as_str()) {
                return None;
            }
            let target = markdown_link::target_range(&link.raw)?;
            Some(inner_start + target.start..inner_start + target.end)
        }
        BodyLinkKind::Markdown => {
            let span = body.get(link.byte_start..link.byte_end)?;
            // The label cannot contain `]` — the scanner stops there — so
            // there is exactly one `](` and it is the one before the URL.
            let paren = span.find("](")?;
            let mut url_start = paren + 2;
            if span.as_bytes().get(url_start) == Some(&b'<') {
                url_start += 1;
            }
            let url_end = url_start + link.raw.len();
            if span.get(url_start..url_end) != Some(link.raw.as_str()) {
                return None;
            }
            Some(link.byte_start + url_start..link.byte_start + url_end)
        }
    }
}

/// What one inbound link's target should say after the move.
///
/// `post` is the corpus **as it will be**, `to` the destination path, and
/// `current` the exact bytes [`target_span`] picked out.
pub fn plan_link(post: &Corpus, to: &str, link: &BodyLink, current: &str) -> LinkOutcome {
    // The no-edit rule, and the only one that needs the hypothetical corpus to
    // state at all: does the text the author wrote still name the moved file,
    // on its own, unambiguously? A pure folder move that keeps the basename
    // answers yes for every bare-name link in the vault, and the correct number
    // of bytes to change is zero.
    if let Resolution::Unique(hit) = post.resolve_strict(&link.target)
        && hit == to
    {
        return LinkOutcome::Unchanged;
    }

    let (text, qualified) = match link.kind {
        // A markdown link's URL is a path, so there is no "bare name" to
        // preserve and no ambiguity to resolve: the full vault-relative path is
        // unambiguous under this vault's suffix resolution and under a reader
        // that treats the URL as vault-absolute. Recomputing it relative to the
        // linking note is a real feature and belongs with folder moves (v2),
        // where the linking note can itself be the thing that moved.
        BodyLinkKind::Markdown => (encode_md_url(to), false),
        BodyLinkKind::Wikilink | BodyLinkKind::Embed => {
            let author_depth = current.split('/').filter(|s| !s.is_empty()).count();
            post.qualified_form(to, author_depth)
        }
    };

    if text == current {
        LinkOutcome::Unchanged
    } else {
        LinkOutcome::Rewrite { text, qualified }
    }
}

/// Percent-encode a vault-relative path for a markdown link URL.
///
/// The set is deliberately minimal — exactly the characters that would end the
/// URL early under this dialect's own grammar (`[^)>\s]+?\.md`) or under a
/// markdown parser, plus `%` so a literal one survives the round trip through
/// [`markdown_link::percent_decode`]. Non-ASCII is left alone: a
/// vault full of Cyrillic and CJK note names reads better unencoded, every
/// consumer here decodes UTF-8 fine, and encoding it would churn every
/// such link the first time one is touched.
pub fn encode_md_url(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for ch in path.chars() {
        match ch {
            ' ' | '\t' | '\n' | '\r' | '(' | ')' | '<' | '>' | '%' | '#' | '?' | '[' | ']' => {
                let mut buf = [0u8; 4];
                for b in ch.encode_utf8(&mut buf).as_bytes() {
                    let _ = write!(out, "%{b:02X}");
                }
            }
            _ => out.push(ch),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use markdown_link::body_links_spanned as body_links;

    fn one(body: &str) -> BodyLink {
        body_links(body).into_iter().next().expect("one link")
    }

    fn span_text(body: &str) -> String {
        let link = one(body);
        let span = target_span(body, &link).expect("span");
        body[span].to_string()
    }

    #[test]
    fn the_span_is_the_target_and_nothing_else() {
        assert_eq!(span_text("see [[Alpha]]"), "Alpha");
        assert_eq!(
            span_text("see [[Projects/Alpha|the alpha]]"),
            "Projects/Alpha"
        );
        assert_eq!(span_text("see [[Alpha#Goals]]"), "Alpha");
        assert_eq!(span_text("see [[Alpha#^goals-block]]"), "Alpha");
        assert_eq!(span_text("see ![[Alpha]]"), "Alpha");
        assert_eq!(span_text("see [[ Alpha ]]"), "Alpha");
        assert_eq!(span_text("| [[Alpha\\|a]] |"), "Alpha");
        assert_eq!(span_text("| [[ Alpha \\|a]] |"), "Alpha");
        assert_eq!(span_text("see [t](Projects/Alpha.md)"), "Projects/Alpha.md");
        assert_eq!(span_text("see [t](My%20Note.md)"), "My%20Note.md");
    }

    #[test]
    fn the_span_survives_multibyte_neighbours() {
        // The `at` table in the scanner is what makes this work; a byte-count
        // assumption here would splice mid-character.
        let body = "Привет [[Заметка|псевдоним]] конец";
        assert_eq!(span_text(body), "Заметка");
    }

    #[test]
    fn url_encoding_covers_the_terminators_and_leaves_unicode_alone() {
        assert_eq!(encode_md_url("A B/C.md"), "A%20B/C.md");
        assert_eq!(encode_md_url("100%/x.md"), "100%25/x.md");
        assert_eq!(encode_md_url("a(b).md"), "a%28b%29.md");
        assert_eq!(encode_md_url("Заметки/Привет.md"), "Заметки/Привет.md");
        // `&` is legal in a URL path and legal under the dialect's grammar.
        assert_eq!(
            encode_md_url("Special Chars & Spaces.md"),
            "Special%20Chars%20&%20Spaces.md"
        );
    }

    #[test]
    fn the_encoding_round_trips_through_the_decoder_that_reads_it() {
        // The encoder writes what the resolver later reads, so the pair has to
        // be exact: a character this encodes and `percent_decode` does not
        // restore is a link that stops resolving the moment a rename touches it.
        use markdown_link::percent_decode;
        for path in [
            "A B/C.md",
            "100%/x.md",
            "a(b).md",
            "Notes/Q? #1.md",
            "Notes/[bracketed].md",
            "Заметки/Привет.md",
        ] {
            assert_eq!(
                percent_decode(&encode_md_url(path)),
                path,
                "round trip: {path}"
            );
        }
        // `#` and `?` specifically. A raw one ends the URL early — `#` starts a
        // heading anchor and `?` a query — under this dialect's grammar and
        // under a markdown parser alike.
        assert_eq!(encode_md_url("Q? #1.md"), "Q%3F%20%231.md");
    }
}
