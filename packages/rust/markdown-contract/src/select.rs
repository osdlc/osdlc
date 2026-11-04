//! Selecting part of a note the way an Obsidian link fragment does:
//! `[[Note#Heading]]`, `[[Note#Parent#Child]]` and `[[Note#^block-id]]`.
//!
//! This reads the body as lines, not through the [`crate::DocTree`]
//! projection, because the two answer different questions. The tree makes
//! the first H1 the document title, while a link fragment treats every
//! heading the same: `#Title` selects the H1 section like any other heading.
//! The rules are Obsidian's:
//!
//! - **A heading** is an ATX heading (`#` to `######`, then whitespace, then
//!   text), up to three spaces in. A closing `#` run counts only after a
//!   space or tab, so `## Learn C#` is the heading `Learn C#`. Headings
//!   inside fenced code are not headings (fences as [`CodeRules::SkillExport`]
//!   reads them).
//! - **A section** is its heading line through the line before the next
//!   heading of the same or a shallower level, so subsections come with it.
//! - **A heading path** (`Parent#Child`) names the heading by its last
//!   segment; the segments before it must be the nearest headings above it,
//!   in order (plain heading ancestry: an H1 is an ancestor like any other
//!   heading). The first heading that matches wins.
//! - **A selector** is first tried as one heading's whole text, since a
//!   heading may contain `#`; only when no heading has that text is it split
//!   on `#` into a path.
//! - **A block** `^id` is labelled by a marker at the end of a line (after
//!   whitespace) or alone on a line. Alone on its line, it labels the
//!   paragraph or list above it, blank lines skipped. At the end of a list
//!   item it labels that one item. At the end of any other line it labels
//!   the paragraph the line ends, walked back to a blank line or a heading.
//!   The marker is never part of the selection.
//!
//! Every selection is trimmed of surrounding whitespace. The `*_range`
//! functions give the selection's bytes in the body; the others give the text,
//! which is the same bytes with each `\r\n` read as `\n`.
//!
//! The same rules back [`crate::DocTree::section_by_heading_path`],
//! [`crate::DocTree::section_by_selector`] and
//! [`crate::DocTree::block_range_by_id`].
//!
//! ```
//! use markdown_contract::{parse_document, select};
//!
//! let note = "---\ntitle: x\n---\n# Guide\n\n## Setup\n\nInstall it. ^install\n\n## Use\n";
//! let tree = parse_document(note);
//!
//! let range = tree.section_by_heading_path(&["Guide", "Setup"]).unwrap();
//! assert_eq!(&tree.body[range], "## Setup\n\nInstall it. ^install");
//! assert_eq!(select::block(&tree.body, "install").as_deref(), Some("Install it."));
//! assert_eq!(
//!     tree.block_by_id("install").unwrap().range(),
//!     tree.root.sections[0].blocks[0].range()
//! );
//! ```

use std::ops::Range;

use markdown_link::code::{CodeRules, FenceLine, Fences};

/// One body line: its text (terminator and a trailing `\r` stripped) and
/// where it starts.
struct Line<'a> {
    text: &'a str,
    start: usize,
}

fn lines_of(body: &str) -> Vec<Line<'_>> {
    let mut out = Vec::new();
    let mut start = 0;
    for raw in body.split('\n') {
        out.push(Line {
            text: raw.strip_suffix('\r').unwrap_or(raw),
            start,
        });
        start += raw.len() + 1;
    }
    out
}

/// The bytes from the start of line `from` to the end of line `to`'s text
/// (inclusive), trimmed of surrounding whitespace.
fn span(body: &str, lines: &[Line<'_>], from: usize, to: usize) -> Range<usize> {
    trimmed(
        body,
        lines[from].start..lines[to].start + lines[to].text.len(),
    )
}

/// `range` with leading and trailing whitespace dropped.
fn trimmed(body: &str, range: Range<usize>) -> Range<usize> {
    let slice = &body[range.clone()];
    let start = range.start + (slice.len() - slice.trim_start().len());
    let end = range.start + slice.trim_end().len();
    start..end.max(start)
}

/// The text of `range` in `body`, `\r\n` read as `\n`.
fn text_of(body: &str, range: Range<usize>) -> String {
    body[range].replace("\r\n", "\n")
}

/// An ATX heading's level and text: `^ {0,3}(#{1,6})\s+(.+?)\s*$`, with a
/// closing `#` run stripped when a space or tab precedes it. A bare `##` or
/// `## ` is not a heading; `##  ` (whitespace for text) is one with empty
/// text, which ends sections but can never be selected.
pub fn atx_heading(line: &str) -> Option<(usize, &str)> {
    let mut indent = 0;
    let bytes = line.as_bytes();
    while indent < 3 && bytes.get(indent) == Some(&b' ') {
        indent += 1;
    }
    let rest = &line[indent..];
    let hashes = rest.bytes().take_while(|b| *b == b'#').count();
    if hashes == 0 || hashes > 6 {
        return None;
    }
    let after = &rest[hashes..];
    let mut chars = after.chars();
    if !chars.next()?.is_whitespace() {
        return None;
    }
    chars.next()?;
    Some((hashes, without_closing_hashes(after.trim())))
}

/// Drops a closing `#` run, which CommonMark counts only when a space or tab
/// precedes it (or it is the whole text): `Learn C#` keeps its `#`.
fn without_closing_hashes(text: &str) -> &str {
    let before_hashes = text.trim_end_matches('#');
    if before_hashes.is_empty() || before_hashes.ends_with([' ', '\t']) {
        before_hashes.trim_end()
    } else {
        text
    }
}

/// [`atx_heading`] for each line, `None` inside fenced code.
fn live_headings<'a>(lines: &[Line<'a>]) -> Vec<Option<(usize, &'a str)>> {
    let mut fences = Fences::new(CodeRules::SkillExport);
    lines
        .iter()
        .map(|line| match fences.line(line.text.as_bytes()) {
            FenceLine::Outside => atx_heading(line.text),
            FenceLine::Marker | FenceLine::Inside => None,
        })
        .collect()
}

/// The section of the first heading whose text is `path`'s last segment and
/// whose nearest ancestors are the segments before it. Segments are compared
/// exactly, as given; an empty `path` selects nothing.
pub fn heading_path_range(body: &str, path: &[&str]) -> Option<Range<usize>> {
    let lines = lines_of(body);
    let headings = live_headings(&lines);
    select_heading_path(body, &lines, &headings, path)
}

/// [`heading_path_range`] as text.
pub fn heading_path(body: &str, path: &[&str]) -> Option<String> {
    heading_path_range(body, path).map(|r| text_of(body, r))
}

/// The section a link fragment's heading selector names: the whole trimmed
/// selector as one heading's text first, then the selector split on `#`
/// (empty segments dropped, each trimmed) as a heading path.
pub fn heading_range(body: &str, selector: &str) -> Option<Range<usize>> {
    let lines = lines_of(body);
    let headings = live_headings(&lines);
    let whole = [selector.trim()];
    let path: Vec<&str> = selector
        .split('#')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    select_heading_path(body, &lines, &headings, &whole)
        .or_else(|| select_heading_path(body, &lines, &headings, &path))
}

/// [`heading_range`] as text.
pub fn heading(body: &str, selector: &str) -> Option<String> {
    heading_range(body, selector).map(|r| text_of(body, r))
}

fn select_heading_path(
    body: &str,
    lines: &[Line<'_>],
    headings: &[Option<(usize, &str)>],
    wanted: &[&str],
) -> Option<Range<usize>> {
    // The open heading at each level, so the ancestry is known when a
    // candidate appears.
    let mut ancestry: [Option<&str>; 6] = [None; 6];

    for (index, heading) in headings.iter().enumerate() {
        let Some((level, text)) = *heading else {
            continue;
        };
        ancestry[level - 1] = Some(text);
        for deeper in ancestry.iter_mut().skip(level) {
            *deeper = None;
        }
        if wanted.last() != Some(&text) {
            continue;
        }
        if wanted.len() > 1 {
            let ancestors: Vec<&str> = ancestry[..level]
                .iter()
                .flatten()
                .filter(|t| !t.is_empty())
                .copied()
                .collect();
            let tail_start = ancestors.len().saturating_sub(wanted.len());
            if ancestors[tail_start..].join("#") != wanted.join("#") {
                continue;
            }
        }

        let mut end = index + 1;
        while end < lines.len() {
            if let Some((next_level, _)) = headings[end]
                && next_level <= level
            {
                break;
            }
            end += 1;
        }
        return Some(span(body, lines, index, end - 1));
    }

    None
}

/// The block `^id` labels; see the module doc for the three shapes.
pub fn block_range(body: &str, id: &str) -> Option<Range<usize>> {
    let lines = lines_of(body);

    for (index, line) in lines.iter().enumerate() {
        let Some(caret_at) = block_marker_position(line.text, id) else {
            continue;
        };

        if line.text.trim() == format!("^{id}") {
            let mut end = index as isize - 1;
            while end >= 0 && lines[end as usize].text.trim().is_empty() {
                end -= 1;
            }
            if end < 0 {
                // A marker with nothing above it labels nothing.
                break;
            }
            let end = end as usize;
            let mut start = end;
            while start > 0
                && !lines[start - 1].text.trim().is_empty()
                && atx_heading(lines[start - 1].text).is_none()
            {
                start -= 1;
            }
            return Some(span(body, &lines, start, end));
        }

        let cleaned_end = line.start + line.text[..caret_at].trim_end().len();
        if is_list_item(line.text) {
            return Some(trimmed(body, line.start..cleaned_end));
        }
        let mut start = index;
        while start > 0
            && !lines[start - 1].text.trim().is_empty()
            && atx_heading(lines[start - 1].text).is_none()
        {
            start -= 1;
        }
        return Some(trimmed(body, lines[start].start..cleaned_end));
    }

    None
}

/// [`block_range`] as text.
pub fn block(body: &str, id: &str) -> Option<String> {
    block_range(body, id).map(|r| text_of(body, r))
}

/// What a link fragment selects: no fragment the whole body, `^id` a block,
/// anything else a heading selector ([`heading_range`]). All trimmed.
pub fn fragment_range(body: &str, fragment: Option<&str>) -> Option<Range<usize>> {
    match fragment {
        None => Some(trimmed(body, 0..body.len())),
        Some(fragment) => match fragment.strip_prefix('^') {
            Some(id) => block_range(body, id),
            None => heading_range(body, fragment),
        },
    }
}

/// [`fragment_range`] as text.
pub fn fragment(body: &str, fragment: Option<&str>) -> Option<String> {
    fragment_range(body, fragment).map(|r| text_of(body, r))
}

/// `(?:^|\s)\^id\s*$`: the byte offset of the `^` when `line` ends with the
/// marker.
fn block_marker_position(line: &str, id: &str) -> Option<usize> {
    let trimmed = line.trim_end();
    let before_id = trimmed.strip_suffix(id)?;
    let before_caret = before_id.strip_suffix('^')?;
    if before_caret.is_empty() || before_caret.ends_with(|c: char| c.is_whitespace()) {
        Some(before_caret.len())
    } else {
        None
    }
}

/// `^\s*(?:[-+*]|\d+[.)])\s+`: is this line a list item?
fn is_list_item(line: &str) -> bool {
    let rest = line.trim_start();
    if let Some(after_bullet) = rest.strip_prefix(['-', '+', '*']) {
        return after_bullet.starts_with(|c: char| c.is_whitespace());
    }
    let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 {
        return false;
    }
    match rest[digits..].strip_prefix(['.', ')']) {
        Some(after_marker) => after_marker.starts_with(|c: char| c.is_whitespace()),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Ported from skillwright's compile.rs, whose extract_heading and
    // extract_block these functions replace.

    #[test]
    fn heading_and_block_extraction_follow_obsidian() {
        let body = "# Parent\n\n## Selected\n\nText.\n\n### Child\n\nChild text.\n\n## Later\n\n- Item one\n- Item two\n\n^list-block\n";
        let section = heading(body, "Parent#Selected").unwrap();
        assert!(section.contains("### Child"));
        assert!(!section.contains("## Later"));
        assert_eq!(block(body, "list-block").unwrap(), "- Item one\n- Item two");
    }

    #[test]
    fn a_heading_inside_a_fence_neither_ends_nor_starts_a_section() {
        let body = "## PR body\n\nTemplate:\n\n```md\n## Summary\n<why>\n\n~~~\n# Not closed by this\n~~~\n```\n\nAfter the fence.\n\n## Next\n\nOther.\n";
        let section = heading(body, "PR body").unwrap();
        assert!(section.contains("## Summary"), "{section}");
        assert!(section.ends_with("After the fence."), "{section}");
        assert_eq!(section.matches("```").count(), 2, "{section}");
        assert!(heading(body, "Summary").is_none());
    }

    #[test]
    fn a_closing_hash_run_is_stripped_only_after_whitespace() {
        let text_of = |line: &str| atx_heading(line).map(|(_, text)| text.to_owned());
        for (line, expected) in [
            ("## foo ##", "foo"),
            ("###   bar    ###", "bar"),
            ("# foo ##################################", "foo"),
            ("##### foo ##", "foo"),
            ("### foo ###     ", "foo"),
            ("### foo ### b", "foo ### b"),
            ("# foo#", "foo#"),
            ("### foo \\###", "foo \\###"),
            ("## foo #\\##", "foo #\\##"),
            ("# foo \\#", "foo \\#"),
            ("# #", ""),
            ("## Learn C#", "Learn C#"),
        ] {
            assert_eq!(text_of(line).as_deref(), Some(expected), "{line}");
        }
        assert_eq!(atx_heading("##"), None);
        assert_eq!(atx_heading("## "), None);
        assert_eq!(atx_heading("####### seven"), None);
        assert_eq!(atx_heading("    # four spaces"), None);
    }

    #[test]
    fn a_heading_ending_in_a_hash_is_not_selected_by_its_hashless_prefix() {
        let body = "## Learn C#\n\nbody\n\n## Next\n";
        assert!(heading(body, "Learn C").is_none());
    }

    #[test]
    fn a_selector_naming_a_heading_that_ends_in_a_hash_resolves() {
        let body = "## Learn C#\n\nbody\n\n## Next\n";
        assert_eq!(heading(body, "Learn C#").unwrap(), "## Learn C#\n\nbody");
    }

    #[test]
    fn a_whole_selector_match_wins_over_the_path_reading() {
        let body = "# A\n\npath\n\n## B\n\npath child\n\n# A#B\n\nwhole\n";
        assert_eq!(heading(body, "A#B").unwrap(), "# A#B\n\nwhole");
        // The path API never tries the whole reading.
        assert_eq!(
            heading_path(body, &["A", "B"]).unwrap(),
            "## B\n\npath child"
        );
    }

    #[test]
    fn a_block_marker_on_a_list_item_selects_that_item_alone() {
        let body = "- one ^here\n- two\n";
        assert_eq!(block(body, "here").unwrap(), "- one");
    }

    #[test]
    fn a_heading_selector_disambiguates_by_ancestry() {
        let body =
            "# First\n\n## Details\n\nfirst details\n\n# Second\n\n## Details\n\nsecond details\n";
        let section = heading(body, "Second#Details").unwrap();
        assert!(section.contains("second details"), "{section}");
        assert!(!section.contains("first details"), "{section}");
    }

    #[test]
    fn an_h1_is_a_plain_heading_not_a_title() {
        let body = "# Title\n\nintro\n\n## A\n\na\n";
        assert_eq!(heading(body, "Title").unwrap(), body.trim());
        assert_eq!(heading_path(body, &["Title", "A"]).unwrap(), "## A\n\na");
    }

    #[test]
    fn a_marker_at_the_end_of_a_paragraph_labels_the_whole_paragraph() {
        let body = "## H\nfirst line\nsecond line ^para\n\nnext\n";
        assert_eq!(block(body, "para").unwrap(), "first line\nsecond line");
        assert!(block(body, "missing").is_none());
        assert!(block("^alone\n", "alone").is_none(), "nothing above it");
        assert!(block("x^glued\n", "glued").is_none(), "needs whitespace");
    }

    #[test]
    fn ranges_point_into_the_body_and_text_reads_crlf_as_lf() {
        let body = "## A\r\n\r\nalpha ^id\r\n\r\n## B\r\n";
        let r = heading_range(body, "A").unwrap();
        assert_eq!(&body[r.clone()], "## A\r\n\r\nalpha ^id");
        assert_eq!(heading(body, "A").unwrap(), "## A\n\nalpha ^id");
        let r = block_range(body, "id").unwrap();
        assert_eq!(&body[r], "alpha");
    }

    #[test]
    fn a_fragment_is_a_block_a_heading_or_the_whole_body() {
        let body = "\n## A\n\nalpha ^id\n\n";
        assert_eq!(fragment(body, None).unwrap(), "## A\n\nalpha ^id");
        assert_eq!(fragment(body, Some("^id")).unwrap(), "alpha");
        assert_eq!(fragment(body, Some("A")).unwrap(), "## A\n\nalpha ^id");
        assert!(fragment(body, Some("Z")).is_none());
    }
}
