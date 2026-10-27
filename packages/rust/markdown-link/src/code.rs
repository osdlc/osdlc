//! Code fences and inline code spans: finding them, and blanking them so a
//! lexer never harvests out of them.
//!
//! One lexer for every caller. This crate's link scanners, a `#tag` lexer and
//! any tool that rewrites markdown all ask "is this code", and a second copy
//! would be a second answer.
//!
//! [`CodeRules`] picks between two rule sets.
//!
//! [`CodeRules::CommonMark`], the default, follows CommonMark:
//!
//! - A fence opens on a line of up to three spaces and a run of three or more
//!   backticks or tildes. A backtick fence's info string may not hold a
//!   backtick. The fence closes on a line holding only a run of the same
//!   character, at least as long, and whitespace. An unclosed fence runs to
//!   the end of the input.
//! - An inline span opens on a run of backticks and closes on the next run of
//!   exactly that many. A run with no close is literal text.
//! - A span stays inside its block. A blank line, a fence, an ATX heading, a
//!   setext underline, a thematic break, a block quote or a list item ends the
//!   block. A span opened on an ATX heading stays on that line.
//!
//! [`CodeRules::SkillExport`] keeps the looser rules of some agent-skill
//! renderers, for tools that must match them:
//!
//! - A backtick fence's info string may hold backticks.
//! - Any fence marker line of the same character and at least the same length
//!   closes a fence, whatever follows the run.
//! - A longer backtick run closes a shorter span.
//! - Only a blank line or a fence marker line ends a span's block.
//!
//! Both rule sets read one line at a time, so neither knows about container
//! blocks. Indented code blocks are not code. A fence is found only when its
//! marker starts within three spaces of the line start, so a fence nested in
//! a list item or a block quote is missed. A list item or block quote marker
//! ends a span's block at any indent and with any start number, even with no
//! text after it, so it may end a span that CommonMark would continue. Nested
//! items are indented, and ending a span early keeps text visible.
//!
//! [`CodeRules::CommonMark`] also treats a line starting with `|` after up to
//! three spaces as a one-line block, table or not. A span cannot enter or
//! leave that line, but a span in it may cross a cell. GFM reads a pipe line
//! without a delimiter row as paragraph text, and splits a table row into
//! cells before it reads spans.
//!
//! Every marker is ASCII, so a byte scan never splits a UTF-8 character.
//!
//! ```
//! use markdown_link::code::{CodeRules, strip_code_with};
//!
//! let text = "keep [[a]] `[[b]]`";
//! let blanked = strip_code_with(text, CodeRules::CommonMark);
//! assert_eq!(blanked, "keep [[a]]        ");
//! ```

/// Which rules the lexer follows. See the module doc.
///
/// # Examples
///
/// ```
/// use markdown_link::code::{CodeRules, strip_code_with};
///
/// // A longer backtick run closes a shorter span under `SkillExport` only.
/// // (It closes with the first backtick of the run; the rest stays.)
/// let text = "`a`` b";
/// assert_eq!(strip_code_with(text, CodeRules::CommonMark), text);
/// assert_eq!(strip_code_with(text, CodeRules::SkillExport), "   ` b");
/// assert_eq!(CodeRules::default(), CodeRules::CommonMark);
/// ```
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum CodeRules {
    #[default]
    /// CommonMark's rules.
    CommonMark,
    /// The looser rules of some agent-skill renderers. See the module doc.
    SkillExport,
}

/// `^ {0,3}(`{3,}|~{3,})` — the character and run length of a fence marker
/// line, and the index just past the run, or `None`. `line` excludes its
/// `\n`. This is the marker's shape only; [`Fences`] applies the rules for
/// opening and closing.
fn fence_run(line: &[u8]) -> Option<(u8, usize, usize)> {
    let at = leading_spaces(line, 3);
    let character = *line.get(at)?;
    if character != b'`' && character != b'~' {
        return None;
    }
    let length = line[at..].iter().take_while(|b| **b == character).count();
    (length >= 3).then_some((character, length, at + length))
}

fn opens_fence(line: &[u8], rules: CodeRules) -> Option<(u8, usize)> {
    let (character, length, end) = fence_run(line)?;
    let backtick_in_info = character == b'`' && line[end..].contains(&b'`');
    if rules == CodeRules::CommonMark && backtick_in_info {
        return None;
    }
    Some((character, length))
}

fn closes_fence(line: &[u8], (open_char, open_len): (u8, usize), rules: CodeRules) -> bool {
    let Some((character, length, end)) = fence_run(line) else {
        return false;
    };
    character == open_char
        && length >= open_len
        && (rules == CodeRules::SkillExport || is_blank(&line[end..]))
}

/// Where a line sits relative to fenced code, as [`Fences::line`] reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FenceLine {
    /// A line that opens or closes a fence. Under [`CodeRules::SkillExport`],
    /// also any other fence marker line inside an open fence.
    Marker,
    /// A line inside an open fence.
    Inside,
    /// A line outside every fence.
    Outside,
}

/// The fence state of a line-by-line scan: which fence, if any, is open.
///
/// # Examples
///
/// ```
/// use markdown_link::code::{CodeRules, FenceLine, Fences};
///
/// let mut fences = Fences::new(CodeRules::CommonMark);
/// assert_eq!(fences.line(b"text"), FenceLine::Outside);
/// assert_eq!(fences.line(b"```rust"), FenceLine::Marker);
/// assert_eq!(fences.line(b"[[not-a-link]]"), FenceLine::Inside);
/// assert_eq!(fences.line(b"```"), FenceLine::Marker);
/// assert_eq!(fences.line(b"text"), FenceLine::Outside);
/// ```
#[derive(Debug, Clone, Copy, Default)]
pub struct Fences {
    rules: CodeRules,
    open: Option<(u8, usize)>,
}

impl Fences {
    /// A scan with no fence open, following `rules`.
    pub fn new(rules: CodeRules) -> Self {
        Self { rules, open: None }
    }

    /// Classify the next line and step past it. `line` excludes its `\n`.
    pub fn line(&mut self, line: &[u8]) -> FenceLine {
        match self.open {
            None => match opens_fence(line, self.rules) {
                Some(fence) => {
                    self.open = Some(fence);
                    FenceLine::Marker
                }
                None => FenceLine::Outside,
            },
            Some(fence) => {
                if closes_fence(line, fence, self.rules) {
                    self.open = None;
                    FenceLine::Marker
                } else if self.rules == CodeRules::SkillExport && fence_run(line).is_some() {
                    FenceLine::Marker
                } else {
                    FenceLine::Inside
                }
            }
        }
    }
}

/// Finds where inline code spans close, for a scan that reads its input once,
/// left to right.
///
/// Call [`Spans::line`] at each line start the scan reaches outside a fence,
/// and [`Spans::close`] at each backtick run it reaches. A whole pass is
/// linear in the size of its input.
///
/// # Examples
///
/// ```
/// use markdown_link::code::{CodeRules, Spans};
///
/// let bytes = b"`a` b";
/// let mut spans = Spans::new(CodeRules::CommonMark, bytes);
/// spans.line(bytes);
/// // A one-backtick span opens at byte 0 and closes at byte 2.
/// assert_eq!(spans.close(0), (1, Some(2)));
///
/// let open = b"`a b";
/// let mut spans = Spans::new(CodeRules::CommonMark, open);
/// spans.line(open);
/// // No closing run: the backtick is literal text.
/// assert_eq!(spans.close(0), (1, None));
/// ```
#[derive(Debug, Clone)]
pub struct Spans<'a> {
    bytes: &'a [u8],
    rules: CodeRules,
    /// Whether the current line is one a span cannot leave.
    one_line: bool,
    no_close: Option<BlockRuns>,
}

/// The backtick runs in `start..end`, the rest of a block from where a search
/// found no close.
#[derive(Debug, Clone)]
struct BlockRuns {
    rules: CodeRules,
    start: usize,
    end: usize,
    /// `(length, start)` for each run length that occurs, sorted by length:
    /// where the last run that would close a span of that length starts.
    last_close: Vec<(usize, usize)>,
}

impl<'a> Spans<'a> {
    /// A scanner over `bytes`, the whole input, following `rules`.
    pub fn new(rules: CodeRules, bytes: &'a [u8]) -> Self {
        Self {
            bytes,
            rules,
            one_line: false,
            no_close: None,
        }
    }

    /// Note the line the scan has reached. `line` excludes its `\n`. Under
    /// [`CodeRules::CommonMark`], a span opened on an ATX heading or a line
    /// starting with `|` stays on that line.
    pub fn line(&mut self, line: &[u8]) {
        self.one_line = self.rules == CodeRules::CommonMark && is_one_line_block(line);
    }

    /// The backtick run that starts at `start`: its length, and where the
    /// span it opens closes (the start of the closing run), if it does.
    /// `start` is a backtick. The run is the backticks from `start` on, which
    /// under [`CodeRules::SkillExport`] may be the rest of a closing run.
    pub fn close(&mut self, start: usize) -> (usize, Option<usize>) {
        debug_assert_eq!(self.bytes.get(start), Some(&b'`'));
        let length = run_length(self.bytes, start);
        let from = start + length;
        if let Some(runs) = &self.no_close
            && runs.start <= from
            && from < runs.end
            && !runs.has_close(length, from)
        {
            return (length, None);
        }
        match self.search(length, from) {
            Ok(close) => (length, Some(close)),
            Err(end) => {
                self.no_close = Some(BlockRuns::new(self.bytes, from, end, self.rules));
                (length, None)
            }
        }
    }

    /// The close, or the end of the block when there is none.
    fn search(&self, length: usize, from: usize) -> Result<usize, usize> {
        let bytes = self.bytes;
        let mut at = from;
        loop {
            while at < bytes.len() && bytes[at] != b'\n' {
                if bytes[at] != b'`' {
                    at += 1;
                    continue;
                }
                let run = run_length(bytes, at);
                if closes(run, length, self.rules) {
                    return Ok(at);
                }
                at += run;
            }
            let next = at + 1;
            if self.one_line || next >= bytes.len() {
                return Err(next.min(bytes.len()));
            }
            if ends_span_block(&bytes[next..line_end(bytes, next)], self.rules) {
                return Err(next);
            }
            at = next;
        }
    }
}

impl BlockRuns {
    fn new(bytes: &[u8], start: usize, end: usize, rules: CodeRules) -> Self {
        let mut last = std::collections::BTreeMap::new();
        let mut at = start;
        while at < end {
            if bytes[at] != b'`' {
                at += 1;
                continue;
            }
            let run = run_length(&bytes[..end], at);
            last.insert(run, at);
            at += run;
        }
        let mut last_close: Vec<(usize, usize)> = last.into_iter().collect();
        if rules == CodeRules::SkillExport {
            // A longer run closes a shorter span too.
            for i in (0..last_close.len().saturating_sub(1)).rev() {
                last_close[i].1 = last_close[i].1.max(last_close[i + 1].1);
            }
        }
        Self {
            rules,
            start,
            end,
            last_close,
        }
    }

    /// Whether a run at or after `from` closes a span opened by `length`
    /// backticks.
    fn has_close(&self, length: usize, from: usize) -> bool {
        let at = self.last_close.partition_point(|(run, _)| *run < length);
        self.last_close.get(at).is_some_and(|&(run, start)| {
            start >= from && (run == length || self.rules == CodeRules::SkillExport)
        })
    }
}

fn closes(run: usize, length: usize, rules: CodeRules) -> bool {
    match rules {
        CodeRules::CommonMark => run == length,
        CodeRules::SkillExport => run >= length,
    }
}

fn run_length(bytes: &[u8], at: usize) -> usize {
    bytes[at..].iter().take_while(|b| **b == b'`').count()
}

/// Whether `line` starts a block that a span cannot reach into.
fn ends_span_block(line: &[u8], rules: CodeRules) -> bool {
    let line = line.strip_suffix(b"\r").unwrap_or(line);
    if is_blank(line) {
        return true;
    }
    match rules {
        CodeRules::SkillExport => fence_run(line).is_some(),
        CodeRules::CommonMark => opens_fence(line, rules).is_some() || starts_block(line),
    }
}

/// An ATX heading or a line starting with `|`: a block that is one line long.
fn is_one_line_block(line: &[u8]) -> bool {
    let indented = &line[leading_spaces(line, 3)..];
    atx_heading(indented) || indented.first() == Some(&b'|')
}

/// `#{1,6}` then a space, a tab or the end of the line. `line` starts after
/// any indent.
fn atx_heading(line: &[u8]) -> bool {
    let hashes = line.iter().take_while(|b| **b == b'#').count();
    (1..=6).contains(&hashes) && matches!(line.get(hashes), None | Some(b' ' | b'\t' | b'\r'))
}

/// An ATX heading, a line starting with `|`, a setext underline, a thematic
/// break, a block quote or a list item.
fn starts_block(line: &[u8]) -> bool {
    let indented = &line[leading_spaces(line, 3)..];
    let rest = &line[line
        .iter()
        .take_while(|b| matches!(b, b' ' | b'\t'))
        .count()..];
    let ends_marker = |at: usize, text: &[u8]| matches!(text.get(at), None | Some(b' ' | b'\t'));

    let equals = indented.iter().take_while(|b| **b == b'=').count();
    let setext = equals > 0 && is_blank(&indented[equals..]);
    let quote = rest.first() == Some(&b'>');
    let bullet = matches!(rest.first(), Some(b'-' | b'*' | b'+')) && ends_marker(1, rest);
    let digits = rest.iter().take_while(|b| b.is_ascii_digit()).count();
    let ordered = (1..=9).contains(&digits)
        && matches!(rest.get(digits), Some(b'.' | b')'))
        && ends_marker(digits + 1, rest);
    is_one_line_block(line) || setext || quote || bullet || ordered || thematic_break(indented)
}

/// Three or more of one of `-`, `*` or `_`, with only spaces or tabs between.
fn thematic_break(line: &[u8]) -> bool {
    let Some(&mark @ (b'-' | b'*' | b'_')) = line.first() else {
        return false;
    };
    line.iter()
        .all(|b| matches!(*b, b' ' | b'\t') || *b == mark)
        && line.iter().filter(|b| **b == mark).count() >= 3
}

fn leading_spaces(line: &[u8], max: usize) -> usize {
    line.iter().take(max).take_while(|b| **b == b' ').count()
}

fn is_blank(text: &[u8]) -> bool {
    text.iter().all(|b| matches!(b, b' ' | b'\t' | b'\r'))
}

/// The index of the `\n` ending the line that holds `from`, or the end of
/// input.
fn line_end(bytes: &[u8], from: usize) -> usize {
    bytes[from..]
        .iter()
        .position(|b| *b == b'\n')
        .map_or(bytes.len(), |i| from + i)
}

/// Blank out fenced and inline code so links and tags inside it are not
/// harvested. [`strip_code_with`] under [`CodeRules::CommonMark`].
///
/// # Examples
///
/// ```
/// use markdown_link::strip_code;
///
/// let text = "a `[[x]]` b\n```\n[[y]]\n```\n[[z]]";
/// let blanked = strip_code(text);
/// assert!(!blanked.contains("[[x]]"));
/// assert!(!blanked.contains("[[y]]"));
/// assert!(blanked.contains("[[z]]"));
/// assert_eq!(blanked.chars().count(), text.chars().count());
/// ```
pub fn strip_code(text: &str) -> String {
    strip_code_with(text, CodeRules::CommonMark)
}

/// Blank out fenced and inline code under `rules`.
///
/// Every character of code, fence marker lines included, becomes a space, and
/// every `\n` stays. The output has the same number of **characters** as the
/// input, so a char index into it is a char index into the input. It is not a
/// byte index: a multi-byte character in code becomes a one-byte space.
///
/// # Examples
///
/// ```
/// use markdown_link::code::{CodeRules, strip_code_with};
///
/// let blanked = strip_code_with("`é` x", CodeRules::CommonMark);
/// assert_eq!(blanked, "    x"); // 3 chars of code, now 3 one-byte spaces
/// ```
pub fn strip_code_with(text: &str, rules: CodeRules) -> String {
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut fences = Fences::new(rules);
    let mut spans = Spans::new(rules, bytes);
    let mut written_up_to = 0usize;
    let mut blank = |out: &mut String, start: usize, end: usize| {
        out.push_str(&text[written_up_to..start]);
        out.extend(
            text[start..end]
                .chars()
                .map(|c| if c == '\n' { '\n' } else { ' ' }),
        );
        written_up_to = end;
    };

    let mut offset = 0usize;
    while offset < bytes.len() {
        if offset == 0 || bytes[offset - 1] == b'\n' {
            let end = line_end(bytes, offset);
            let line = &bytes[offset..end];
            if fences.line(line) != FenceLine::Outside {
                blank(&mut out, offset, end);
                offset = end + 1;
                continue;
            }
            spans.line(line);
        }
        if bytes[offset] == b'`' {
            let (run, close) = spans.close(offset);
            offset = match close {
                Some(close) => {
                    blank(&mut out, offset, close + run);
                    close + run
                }
                None => offset + run,
            };
            continue;
        }
        offset += 1;
    }
    out.push_str(&text[written_up_to..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const BOTH: [CodeRules; 2] = [CodeRules::CommonMark, CodeRules::SkillExport];

    /// [`Spans::close`] for a span opened by the one backtick at the start of
    /// `bytes`.
    fn find_span_close(bytes: &[u8], rules: CodeRules) -> Option<usize> {
        let mut spans = Spans::new(rules, bytes);
        spans.line(&bytes[..line_end(bytes, 0)]);
        spans.close(0).1
    }

    #[test]
    fn a_fence_becomes_spaces_and_keeps_its_newlines() {
        let out = strip_code("a\n```\nhidden\n```\nb\n");
        assert_eq!(out, "a\n   \n      \n   \nb\n");
    }

    #[test]
    fn an_inline_span_becomes_spaces() {
        assert_eq!(strip_code("a `x` b"), "a     b");
    }

    #[test]
    fn an_unterminated_inline_backtick_is_left_alone() {
        assert_eq!(strip_code("a `x b"), "a `x b");
    }

    #[test]
    fn the_char_count_is_preserved_exactly() {
        // A CHAR count, not a byte count: `é` inside a span becomes one space.
        for rules in BOTH {
            for src in [
                "`é` after",
                "```\nsanté\n```\n",
                "~~~\nsanté\n",
                "``a ` é``",
                "plain text",
                "a `x` b `y`",
            ] {
                assert_eq!(
                    strip_code_with(src, rules).chars().count(),
                    src.chars().count(),
                    "for {src:?} under {rules:?}"
                );
            }
        }
    }

    #[test]
    fn fence_markers_take_up_to_three_spaces_and_three_or_more_characters() {
        assert_eq!(fence_run(b"```"), Some((b'`', 3, 3)));
        assert_eq!(fence_run(b"   ~~~~ info"), Some((b'~', 4, 7)));
        assert_eq!(fence_run(b"    ```"), None);
        assert_eq!(fence_run(b"``"), None);
        assert_eq!(fence_run(b"text ```"), None);
    }

    #[test]
    fn a_fence_closes_only_on_its_own_character_at_its_length_or_more() {
        for rules in BOTH {
            let mut fences = Fences::new(rules);
            let kinds: Vec<FenceLine> = ["````", "```", "~~~~~", "x", "`````", "y"]
                .iter()
                .map(|line| fences.line(line.as_bytes()))
                .collect();
            let inner_marker = match rules {
                CodeRules::CommonMark => FenceLine::Inside,
                CodeRules::SkillExport => FenceLine::Marker,
            };
            assert_eq!(
                kinds,
                vec![
                    FenceLine::Marker,
                    inner_marker,
                    inner_marker,
                    FenceLine::Inside,
                    FenceLine::Marker,
                    FenceLine::Outside,
                ],
                "under {rules:?}"
            );
        }
    }

    #[test]
    fn a_span_does_not_cross_a_blank_line_or_a_fence_line() {
        for rules in BOTH {
            assert_eq!(find_span_close(b"`a\nb`", rules), Some(4));
            assert_eq!(find_span_close(b"`a\n\nb`", rules), None);
            assert_eq!(find_span_close(b"`a\n```\nb`", rules), None);
        }
    }

    #[test]
    fn block_starts_end_a_commonmark_span_only() {
        for next in [
            "# h",
            "###### h",
            "===",
            "***",
            "_ _ _",
            "> q",
            "- i",
            "  * i",
            "    + nested",
            "1. i",
            "12) i",
        ] {
            let src = format!("`a\n{next}\nb`");
            let bytes = src.as_bytes();
            assert_eq!(
                find_span_close(bytes, CodeRules::CommonMark),
                None,
                "{next:?}"
            );
            assert!(
                find_span_close(bytes, CodeRules::SkillExport).is_some(),
                "{next:?}"
            );
        }
        for next in [
            "#hashtag",
            "####### seven",
            "-dash",
            "1.5 kg",
            "    # indented",
        ] {
            let src = format!("`a\n{next}\nb`");
            assert!(
                find_span_close(src.as_bytes(), CodeRules::CommonMark).is_some(),
                "{next:?}"
            );
        }
    }

    /// A quadratic pass takes tens of seconds on these inputs in a debug build;
    /// a linear one takes well under a second, even on a loaded machine. The bound is
    /// that wide on purpose: it catches the shape of the cost, not a slowdown.
    #[test]
    fn a_pass_is_linear_on_long_lines_and_unclosed_runs() {
        let long_line = "`a` [[x]] ".repeat(200_000);
        fn unclosed(lengths: impl Iterator<Item = usize>) -> String {
            lengths
                .map(|n| format!("x {} text\n", "`".repeat(n)))
                .collect()
        }
        let rising = unclosed(1..=2000);
        let falling = unclosed((1..=2000).rev());
        for rules in BOTH {
            for text in [&long_line, &rising, &falling] {
                let started = std::time::Instant::now();
                let out = strip_code_with(text, rules);
                let elapsed = started.elapsed();
                assert_eq!(out.len(), text.len());
                assert!(
                    elapsed < std::time::Duration::from_secs(10),
                    "{} KB under {rules:?} took {elapsed:?}",
                    text.len() / 1000
                );
            }
        }
    }

    #[test]
    fn commonmark_closes_a_span_only_on_a_run_of_its_own_length() {
        assert_eq!(find_span_close(b"`a``b`", CodeRules::CommonMark), Some(5));
        assert_eq!(find_span_close(b"`a``b`", CodeRules::SkillExport), Some(2));
    }
}
