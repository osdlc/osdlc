//! `^block-id` anchors — the addressing primitive (BASE dialect, always on).
//!
//! A line-terminal `^identifier` token binds to the block it terminates
//! (`BlockNode` anchor) or, standalone with no preceding block, to the section
//! (`SectionNode.anchors`). Ports the TS `dialect/anchors.ts` behavior exactly:
//! ids are `[A-Za-z0-9_-]+`, only a *line-terminal* token on the final line binds.

use std::sync::OnceLock;

use regex::Regex;

/// Line-terminal `^block-id` on one line: preceded by start-of-line or whitespace,
/// optionally followed by trailing whitespace.
fn anchor_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?:^|\s)\^([A-Za-z0-9_-]+)\s*$").expect("static regex"))
}

fn standalone_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\^([A-Za-z0-9_-]+)$").expect("static regex"))
}

/// The result of lifting a trailing anchor: the id and the text without the token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrailingAnchor {
    /// the anchor id, without the `^`
    pub id: String,
    /// the text with the anchor token removed
    pub rest: String,
}

/// If `text` ends with a line-terminal `^block-id`, return the id and the text with that
/// token removed; otherwise `None`. Operates on the *last line* so a multi-line paragraph
/// whose final line is `^summary` binds correctly.
pub fn extract_trailing_anchor(text: &str) -> Option<TrailingAnchor> {
    let trimmed = text.trim_end();
    let mut lines: Vec<&str> = trimmed.split('\n').collect();
    let last = *lines.last()?;
    let m = anchor_re().captures(last)?;
    let id = m.get(1)?.as_str().to_string();
    let stripped_last = last[..m.get(0).expect("whole match").start()].trim_end();
    if stripped_last.is_empty() {
        lines.pop();
    } else {
        let idx = lines.len() - 1;
        lines[idx] = stripped_last;
    }
    Some(TrailingAnchor {
        id,
        rest: lines.join("\n").trim_end().to_string(),
    })
}

/// `Some(id)` iff `text`, trimmed, is *only* a `^block-id` token (a standalone anchor
/// paragraph); `None` otherwise.
pub fn is_standalone_anchor(text: &str) -> Option<&str> {
    standalone_re()
        .captures(text.trim())
        .and_then(|c| c.get(1))
        .map(|m| m.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lifted(id: &str, rest: &str) -> Option<TrailingAnchor> {
        Some(TrailingAnchor {
            id: id.into(),
            rest: rest.into(),
        })
    }

    // Ported from the TS anchors.test.ts — each case is an input and its exact output.
    #[test]
    fn anchor_on_its_own_final_line_is_lifted() {
        assert_eq!(
            extract_trailing_anchor("We will adopt the widget protocol.\n^summary"),
            lifted("summary", "We will adopt the widget protocol.")
        );
    }

    #[test]
    fn anchor_trailing_the_same_line_as_text_binds_and_is_stripped() {
        assert_eq!(
            extract_trailing_anchor("Some prose ^note"),
            lifted("note", "Some prose")
        );
    }

    #[test]
    fn ids_may_contain_letters_digits_hyphen_underscore() {
        assert_eq!(
            extract_trailing_anchor("x\n^block-id_2"),
            lifted("block-id_2", "x")
        );
    }

    #[test]
    fn no_trailing_anchor_is_none() {
        assert_eq!(extract_trailing_anchor("Just a paragraph."), None);
    }

    #[test]
    fn non_line_terminal_anchor_does_not_bind() {
        assert_eq!(extract_trailing_anchor("see ^foo for details"), None);
    }

    #[test]
    fn lone_anchor_is_standalone() {
        assert_eq!(is_standalone_anchor("^summary"), Some("summary"));
    }

    #[test]
    fn surrounding_whitespace_is_tolerated() {
        assert_eq!(is_standalone_anchor("  ^summary  "), Some("summary"));
    }

    #[test]
    fn anything_more_than_the_bare_token_is_not_standalone() {
        assert_eq!(is_standalone_anchor("text ^summary"), None);
        assert_eq!(is_standalone_anchor("summary"), None);
    }
}
