//! Code, and blanking it so a lexer never harvests out of it.
//!
//! One lexer for every caller. This crate's link scanners, a `#tag` lexer and
//! any tool that rewrites markdown all ask "is this code", and a second copy
//! would be a second answer. [`code_ranges`] says where the code is, and
//! [`strip_code_with`] blanks it.
//!
//! Code is text a renderer shows as written, so a link in it is not a link:
//!
//! - **Fenced code.** [`CodeRules`] sets the rules for fences and spans.
//! - **Indented code.** A line indented four or more columns past where its
//!   block's text starts (the line start, or the text of the list item it is
//!   in), unless it continues a paragraph. A tab moves to the next multiple
//!   of four columns.
//! - **Inline code spans.**
//! - **Math.** `$$` up to the next `$$` in its block, as a span stays in its
//!   block, and `$` up to the next `$` on the same line. The opening `$` must
//!   have a character other than a space or tab after it. The closing `$`
//!   must have one before it and no digit after it, so `$5 and $10` is not
//!   math. A `$` escaped by a `\` (an odd number of them) does neither, and
//!   one right after an ASCII letter or digit, as in `5$` or `A$B`, opens
//!   nothing.
//! - **Raw HTML blocks.** A line starting with `<pre`, `<script`, `<style` or
//!   `<textarea`, through the line holding a closing tag of any of the four,
//!   or the end of the input.
//! - **Autolinks**, such as `<https://example.com/[[a]]>`.
//!
//! An HTML comment, `<!--` to `-->`, is not code, but the lexer steps over
//! it: a backtick, `$` or fence inside a comment opens nothing. A comment
//! that starts a line runs to the next `-->` or the end of the input. One
//! later in a line with no `-->` in its block is text. Inline, whichever of
//! a span, math, a comment or an autolink starts first wins, and the text up
//! to its close is read as written. A comment later in a line stays in its block, as a span does. A
//! line that starts with `<!--` is a block of its own, so indented code may
//! follow it.
//!
//! A span or `$$` does not reach a line that opens a fence, a raw HTML block
//! or a comment.
//!
//! [`CodeRules`] picks between three rule sets.
//!
//! [`CodeRules::CommonMark`], the default, follows CommonMark for fences and
//! spans:
//!
//! - A fence opens on a line of up to three spaces past where its block's
//!   text starts and a run of three or more backticks or tildes. A backtick
//!   fence's info string may not hold a backtick. The fence closes on a line
//!   holding only a run of the same character, at least as long, and
//!   whitespace. An unclosed fence runs to the end of the input.
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
//! Math, raw HTML blocks, autolinks and indented code follow the same rules
//! under both, except that `$$` stays in its block as a span does under each.
//!
//! [`CodeRules::None`] finds no code: [`strip_code_with`] returns its input
//! unchanged. A caller that has already parsed the code, with a markdown
//! parser, uses it to scan a run of text without code rules.
//!
//! Under [`CodeRules::CommonMark`] a fence is found inside a list item or a
//! block quote too, as CommonMark has it. The lexer tracks the open block
//! quotes and list items line by line. A fence opens on a line whose marker
//! is indented at most three columns past its container's content, so
//! `10. item` followed by a fence indented to column 4 opens one. A fence
//! closes on a line of its own container, and it ends, closed or not, at the
//! first line that is no longer in that container: a line with no `>` for a
//! block quote, a non-blank line indented less than the content column for a
//! list item, or a blank line inside a block quote. An unclosed fence in a
//! container runs to the end of that container, not of the input. A fence
//! marker line, container markers included, becomes spaces. Lazy
//! continuation lines are not tracked: a line of a paragraph that is not
//! indented to its list item ends the item here, where CommonMark keeps it.
//! A list item interrupts a paragraph only as CommonMark lets it: an ordered
//! item must start at 1 and no item may be empty. The line before is taken to
//! be a paragraph when it is text outside a fence other than a heading, a
//! thematic break or a setext underline, so a table row counts as one.
//! [`CodeRules::SkillExport`] reads one line at a time and knows no
//! containers for fences, as the renderers it matches do.
//!
//! Indented code and raw HTML blocks follow list items under both rule sets,
//! by one small tracker of its own, and do not know block quotes: indented
//! code in a block quote is missed. A raw HTML block in a list item ends at a
//! line indented less than the item's text, as the item does.
//!
//! Under [`CodeRules::CommonMark`] a list item or block quote marker ends a
//! span's block at any indent and with any start number, even with no text
//! after it, so it may end a span that CommonMark would continue. Nested
//! items are indented, and ending a span early keeps text visible.
//!
//! [`CodeRules::CommonMark`] also treats a line starting with `|` after up to
//! three spaces as a one-line block, table or not, and reads it as a table
//! row: GFM splits a row into cells at every `|` that is not escaped as `\|`
//! before it reads spans, so a span cannot cross a cell, and a `|` inside
//! backticks still ends the cell. The row is found after a container's
//! markers too, so a table in a list item or a block quote works the same. GFM
//! reads a pipe line without a delimiter row as paragraph text; this lexer
//! cannot tell, so a span in such a line stays inside one cell.
//!
//! Every marker is ASCII, so a byte scan never splits a UTF-8 character.
//!
//! ```
//! use markdown_link::code::{CodeRules, code_ranges, strip_code_with};
//!
//! let text = "keep [[a]] `[[b]]` $[[c]]$\n\n    [[d]]";
//! let blanked = strip_code_with(text, CodeRules::CommonMark);
//! assert_eq!(blanked, "keep [[a]]                \n\n         ");
//! let ranges = code_ranges(text, CodeRules::CommonMark);
//! assert_eq!(ranges, [11..18, 19..26, 28..37]);
//! ```

use std::ops::Range;

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
    /// No code: nothing is blanked. For a caller that has already parsed the
    /// code and scans a run of text that holds none.
    None,
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
    if rules == CodeRules::None {
        return None;
    }
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

/// A block that can hold a fence: a block quote, or a list item with the
/// column its content starts at.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Container {
    Quote,
    Item(usize),
}

/// A fence that is open, and how many containers it is inside.
#[derive(Debug, Clone, Copy)]
struct OpenFence {
    character: u8,
    length: usize,
    depth: usize,
}

/// The fence state of a line-by-line scan: which fence, if any, is open, and
/// under [`CodeRules::CommonMark`] the block quotes and list items around
/// it.
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
///
/// // A fence in a list item closes on a line of the same item.
/// assert_eq!(fences.line(b"- ```"), FenceLine::Marker);
/// assert_eq!(fences.line(b"  code"), FenceLine::Inside);
/// assert_eq!(fences.line(b"  ```"), FenceLine::Marker);
/// ```
#[derive(Debug, Clone, Default)]
pub struct Fences {
    rules: CodeRules,
    open: Option<OpenFence>,
    containers: Vec<Container>,
    /// Where the outermost block quote in `containers` is.
    first_quote: Option<usize>,
    /// Whether the last line was paragraph text, which a list item may
    /// interrupt only as CommonMark lets it.
    paragraph: bool,
    content: usize,
}

impl Fences {
    /// A scan with no fence open, following `rules`.
    pub fn new(rules: CodeRules) -> Self {
        Self {
            rules,
            ..Self::default()
        }
    }

    /// Classify the next line and step past it. `line` excludes its `\n`.
    pub fn line(&mut self, line: &[u8]) -> FenceLine {
        self.content = 0;
        match self.rules {
            CodeRules::None => FenceLine::Outside,
            CodeRules::SkillExport => self.line_flat(line),
            CodeRules::CommonMark => self.line_in_containers(line),
        }
    }

    /// Where the text of the line last given to [`Fences::line`] starts, past
    /// the block quote and list item markers and the indent they take, as a
    /// byte index into it. Zero outside [`CodeRules::CommonMark`]. A line of
    /// four columns of indent or more starts up to four bytes early, so a
    /// block quote's marker is never part of the text but an indented-code
    /// line still reads as one.
    pub fn content_start(&self) -> usize {
        self.content
    }

    /// One line at a time, knowing no containers.
    fn line_flat(&mut self, line: &[u8]) -> FenceLine {
        let rules = self.rules;
        match self.open {
            None => match opens_fence(line, rules) {
                Some((character, length)) => {
                    self.open = Some(OpenFence {
                        character,
                        length,
                        depth: 0,
                    });
                    FenceLine::Marker
                }
                None => FenceLine::Outside,
            },
            Some(fence) => {
                if closes_fence(line, (fence.character, fence.length), rules) {
                    self.open = None;
                    FenceLine::Marker
                } else if fence_run(line).is_some() {
                    FenceLine::Marker
                } else {
                    FenceLine::Inside
                }
            }
        }
    }

    fn truncate(&mut self, depth: usize) {
        self.containers.truncate(depth);
        if self.first_quote.is_some_and(|at| at >= depth) {
            self.first_quote = None;
        }
    }

    fn push(&mut self, container: Container) {
        if container == Container::Quote && self.first_quote.is_none() {
            self.first_quote = Some(self.containers.len());
        }
        self.containers.push(container);
    }

    /// CommonMark's containers, as far as a fence needs them. The blocks that
    /// continue on this line are matched first, then a new block quote or
    /// list item may start, then the rest of the line may open a fence. A
    /// pass costs the characters of the markers and indent it reads.
    fn line_in_containers(&mut self, line: &[u8]) -> FenceLine {
        // The common line: outside every block, and starting with a byte that
        // opens no container and no fence.
        if self.open.is_none()
            && self.containers.is_empty()
            && !matches!(
                line.first(),
                Some(b' ' | b'\t' | b'>' | b'-' | b'*' | b'+' | b'0'..=b'9' | b'`' | b'~')
            )
        {
            // A lone `\r` is the blank line of a CRLF file.
            let text = line.strip_suffix(b"\r").unwrap_or(line);
            self.paragraph = !text.is_empty() && !leaves_paragraph(text, self.paragraph);
            return FenceLine::Outside;
        }
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        let blank = is_blank(line);
        let depth = self.containers.len();
        let mut cursor = Cursor::start(line);
        let was_paragraph = std::mem::take(&mut self.paragraph);
        let mut matched = 0;
        if blank {
            // A blank line continues every list item and ends a block quote.
            matched = self.first_quote.unwrap_or(depth);
        } else {
            while matched < depth {
                match self.containers[matched] {
                    Container::Quote if cursor.quote() => {}
                    // A line blank after its markers continues a list item.
                    Container::Item(content)
                        if cursor.text_pos >= line.len() || cursor.text_col >= content =>
                    {
                        cursor.base = content;
                    }
                    _ => break,
                }
                matched += 1;
            }
        }

        if let Some(fence) = self.open {
            if matched >= fence.depth {
                self.content = cursor.content_start();
                if !blank
                    && cursor.indent() <= 3
                    && closes_fence(
                        &line[cursor.text_pos..],
                        (fence.character, fence.length),
                        self.rules,
                    )
                {
                    self.open = None;
                    return FenceLine::Marker;
                }
                return FenceLine::Inside;
            }
            // The fence's container ended before this line.
            self.open = None;
        }

        self.truncate(matched);
        if !blank {
            // A list item starting on a paragraph's continuation line may only
            // interrupt it as CommonMark lets it.
            let mut interrupts = was_paragraph && matched == depth;
            while cursor.indent() <= 3 {
                if cursor.quote() {
                    self.push(Container::Quote);
                } else if let Some(content) = cursor.item_start(interrupts) {
                    self.push(Container::Item(content));
                } else {
                    break;
                }
                interrupts = false;
            }
            if cursor.indent() <= 3
                && let Some((character, length)) = opens_fence(&line[cursor.text_pos..], self.rules)
            {
                self.open = Some(OpenFence {
                    character,
                    length,
                    depth: self.containers.len(),
                });
                self.content = cursor.content_start();
                return FenceLine::Marker;
            }
        }
        self.content = cursor.content_start();
        // An indented line starts code, not a paragraph, unless it continues one.
        let text = &line[cursor.text_pos..];
        self.paragraph = cursor.text_pos < line.len()
            && (cursor.indent() <= 3 || was_paragraph)
            && !(cursor.indent() <= 3 && leaves_paragraph(text, was_paragraph));
        FenceLine::Outside
    }
}

/// Where a line has been read to: `base` is the column that containers have
/// taken, and `text_pos` and `text_col` are the first byte that is not a
/// space or tab from there on, with its column. A tab goes to the next
/// multiple of four.
struct Cursor<'a> {
    line: &'a [u8],
    base: usize,
    text_pos: usize,
    text_col: usize,
}

fn next_col(byte: u8, col: usize) -> usize {
    if byte == b'\t' {
        col + 4 - col % 4
    } else {
        col + 1
    }
}

impl<'a> Cursor<'a> {
    fn start(line: &'a [u8]) -> Self {
        let mut cursor = Self {
            line,
            base: 0,
            text_pos: 0,
            text_col: 0,
        };
        cursor.skip_space(0, 0);
        cursor
    }

    /// Set the text position to the first byte from `pos`, at column `col`,
    /// that is not a space or tab.
    fn skip_space(&mut self, mut pos: usize, mut col: usize) {
        while let Some(&byte) = self.line.get(pos)
            && (byte == b' ' || byte == b'\t')
        {
            col = next_col(byte, col);
            pos += 1;
        }
        self.text_pos = pos;
        self.text_col = col;
    }

    /// Columns of indent between what containers took and the text.
    fn indent(&self) -> usize {
        self.text_col.saturating_sub(self.base)
    }

    /// Where the text starts for a caller that reads its first characters,
    /// or four bytes before it when it is indented four columns or more.
    fn content_start(&self) -> usize {
        if self.indent() > 3 {
            self.text_pos.saturating_sub(4)
        } else {
            self.text_pos
        }
    }

    /// Step past a `>` at the text and the one space or tab after it.
    fn after_quote_marker(&mut self) {
        let pos = self.text_pos + 1;
        let col = self.text_col + 1;
        // The marker takes one space or the first column of a tab after it.
        self.base = if matches!(self.line.get(pos), Some(b' ' | b'\t')) {
            col + 1
        } else {
            col
        };
        self.skip_space(pos, col);
    }

    /// A block quote's `>` continues the quote: step past it.
    fn quote(&mut self) -> bool {
        let found = self.indent() <= 3 && self.line.get(self.text_pos) == Some(&b'>');
        if found {
            self.after_quote_marker();
        }
        found
    }

    /// A list marker at the text starts a list item: step past it, and give
    /// the column its content starts at.
    fn item_start(&mut self, interrupts: bool) -> Option<usize> {
        let rest = &self.line[self.text_pos..];
        let marker = match rest.first()? {
            b'-' | b'*' | b'+' => 1,
            b'0'..=b'9' => {
                let digits = rest.iter().take_while(|b| b.is_ascii_digit()).count();
                if digits > 9 || !matches!(rest.get(digits), Some(b'.' | b')')) {
                    return None;
                }
                // An ordered list interrupts a paragraph only when it starts at 1.
                if interrupts
                    && rest[..digits]
                        .iter()
                        .fold(0u32, |n, &b| n * 10 + u32::from(b - b'0'))
                        != 1
                {
                    return None;
                }
                digits + 1
            }
            _ => return None,
        };
        if !matches!(rest.get(marker), None | Some(b' ' | b'\t')) || thematic_break(rest) {
            return None;
        }
        // An empty item cannot interrupt a paragraph.
        if interrupts && is_blank(&rest[marker..]) {
            return None;
        }
        let marker_end = self.text_col + marker;
        let after = self.text_pos + marker;
        self.skip_space(after, marker_end);
        let content = if self.text_pos >= self.line.len() || self.text_col - marker_end >= 5 {
            // Nothing after the marker, or an indented code block: the
            // content starts one column past the marker.
            marker_end + 1
        } else {
            self.text_col
        };
        self.base = content;
        Some(content)
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
    /// What the current line lets a span do.
    block: SpanBlock,
    no_close: Option<BlockRuns>,
}

/// What the line a span opened on lets it do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SpanBlock {
    /// The span may run on to later lines of its block.
    Paragraph,
    /// The span stays on its line.
    Heading,
    /// The span stays in its cell of a table row.
    TableRow,
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
            block: SpanBlock::Paragraph,
            no_close: None,
        }
    }

    /// Note the line the scan has reached. `line` excludes its `\n`; for a
    /// line in a list item or a block quote, pass the text past the markers
    /// ([`Fences::content_start`]). Under [`CodeRules::CommonMark`], a span
    /// opened on an ATX heading stays on that line, and one opened on a line
    /// starting with `|` stays in its cell: it closes before the next `|`
    /// that is not escaped as `\|`, or not at all.
    pub fn line(&mut self, line: &[u8]) {
        self.block = if self.rules != CodeRules::CommonMark {
            SpanBlock::Paragraph
        } else {
            let indented = &line[leading_spaces(line, 3)..];
            if atx_heading(indented) {
                SpanBlock::Heading
            } else if indented.first() == Some(&b'|') {
                SpanBlock::TableRow
            } else {
                SpanBlock::Paragraph
            }
        };
    }

    /// The backtick run that starts at `start`: its length, and where the
    /// span it opens closes (the start of the closing run), if it does.
    /// `start` is a backtick. The run is the backticks from `start` on, which
    /// under [`CodeRules::SkillExport`] may be the rest of a closing run.
    pub fn close(&mut self, start: usize) -> (usize, Option<usize>) {
        self.close_in(start, &|_| false)
    }

    /// [`Spans::close`], where a line that `ends` accepts also ends a span's
    /// block. `ends` must give the same answer for a line each time.
    pub(crate) fn close_in(
        &mut self,
        start: usize,
        ends: &dyn Fn(&[u8]) -> bool,
    ) -> (usize, Option<usize>) {
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
        match self.search(length, from, ends) {
            Ok(close) => (length, Some(close)),
            Err(end) => {
                self.no_close = Some(BlockRuns::new(self.bytes, from, end, self.rules));
                (length, None)
            }
        }
    }

    /// The close, or the end of the block when there is none.
    fn search(
        &self,
        length: usize,
        from: usize,
        ends: &dyn Fn(&[u8]) -> bool,
    ) -> Result<usize, usize> {
        let bytes = self.bytes;
        self.in_block(from, ends, |mut at| {
            while at < bytes.len() && bytes[at] != b'\n' {
                if self.block == SpanBlock::TableRow && bytes[at] == b'|' && !escaped(bytes, at) {
                    return Err(at);
                }
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
            Err(at)
        })
    }

    /// Calls `find(at)` on the rest of the current line from `from`, then on
    /// each later line of the block a span opened there may reach, until it
    /// finds something. `find` returns what it found, or the end of the line
    /// when it found nothing. `Err` with the end of the block when nothing is
    /// found. A line that `ends` accepts ends the block too.
    pub(crate) fn in_block<T>(
        &self,
        from: usize,
        ends: &dyn Fn(&[u8]) -> bool,
        mut find: impl FnMut(usize) -> Result<T, usize>,
    ) -> Result<T, usize> {
        let bytes = self.bytes;
        let mut at = from;
        loop {
            let end = match find(at) {
                Ok(found) => return Ok(found),
                Err(end) => end,
            };
            let next = end + 1;
            if self.block != SpanBlock::Paragraph || next >= bytes.len() {
                return Err(next.min(bytes.len()));
            }
            let line = &bytes[next..line_end(bytes, next)];
            if ends_span_block(line, self.rules) || ends(line) {
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
        CodeRules::None => false,
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
        CodeRules::None => false,
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

/// Whether a line outside a fence, starting after any indent, is not
/// paragraph text: an ATX heading, a thematic break, or a setext underline
/// directly under a paragraph.
fn leaves_paragraph(text: &[u8], after_paragraph: bool) -> bool {
    let underline = text.first().is_some_and(|&c| c == b'=' || c == b'-') && {
        let mark = text[0];
        let run = text.iter().take_while(|b| **b == mark).count();
        text[run..].iter().all(|b| matches!(b, b' ' | b'\t'))
    };
    atx_heading(text) || thematic_break(text) || (after_paragraph && underline)
}

/// An ATX heading, a line starting with `|`, a setext underline, a thematic
/// break, a block quote or a list item.
fn starts_block(line: &[u8]) -> bool {
    let indented = &line[leading_spaces(line, 3)..];
    let rest = &line[line
        .iter()
        .take_while(|b| matches!(b, b' ' | b'\t'))
        .count()..];
    let equals = indented.iter().take_while(|b| **b == b'=').count();
    let setext = equals > 0 && is_blank(&indented[equals..]);
    let quote = rest.first() == Some(&b'>');
    is_one_line_block(line)
        || setext
        || quote
        || list_marker(rest).is_some()
        || thematic_break(indented)
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

/// Blank out code so links and tags inside it are not harvested.
/// [`strip_code_with`] under [`CodeRules::CommonMark`].
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

/// Blank out the code under `rules`: each of [`code_ranges`].
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
    blank(text, code_ranges(text, rules))
}

/// The byte ranges of `text` that are code under `rules`, as the module doc
/// describes: what [`strip_code_with`] blanks.
///
/// The ranges are in order and do not overlap. Each holds its delimiters: a
/// span's backticks, a fence's marker lines, an autolink's `<` and `>`. Two
/// ranges that touch, or that only a line break separates, are one, so a
/// fence or a run of indented code lines is one range. HTML comments are in
/// none.
///
/// # Examples
///
/// ```
/// use markdown_link::code::{CodeRules, code_ranges};
///
/// let text = "a `b` c\n```\nd\n```\n<!-- `e` -->";
/// let ranges = code_ranges(text, CodeRules::CommonMark);
/// assert_eq!(ranges, [2..5, 8..17]);
/// assert_eq!(&text[ranges[1].clone()], "```\nd\n```");
/// ```
pub fn code_ranges(text: &str, rules: CodeRules) -> Vec<Range<usize>> {
    regions(text, rules)
        .into_iter()
        .filter_map(|(range, region)| (region == Region::Code).then_some(range))
        .collect()
}

/// What a range of [`regions`] holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Region {
    /// Code: what [`code_ranges`] returns.
    Code,
    /// An HTML comment, as the module doc describes.
    Comment,
}

/// The code and the HTML comments in `text`, in order, from one left-to-right
/// pass. Ranges of the same kind that touch, or that only a line break
/// separates, are merged.
pub(crate) fn regions(text: &str, rules: CodeRules) -> Vec<(Range<usize>, Region)> {
    let bytes = text.as_bytes();
    let mut out: Vec<(Range<usize>, Region)> = Vec::new();
    let mut push = |range: Range<usize>, region: Region| {
        if let Some((last, kind)) = out.last_mut()
            && *kind == region
            && (last.end == range.start
                || (last.end + 1 == range.start && bytes[last.end] == b'\n'))
        {
            last.end = range.end;
        } else if !range.is_empty() {
            out.push((range, region));
        }
    };
    let mut blocks = Blocks::new(rules);
    let mut spans = Spans::new(rules, bytes);
    let mut math = MathClose::default();
    // Whether a `-->` comes after the last comment that starts a line. Once
    // one does not, none after it does either.
    let mut comment_closes = true;
    // The end of the block in which a comment later in a line found no
    // `-->`. No later one in that block does either.
    let mut no_comment_close_until = 0usize;
    let mut offset = 0usize;
    while offset < bytes.len() {
        if offset == 0 || bytes[offset - 1] == b'\n' {
            let end = line_end(bytes, offset);
            let line = &bytes[offset..end];
            if blocks.code_line(line) {
                push(offset..end, Region::Code);
                offset = end + 1;
                continue;
            }
            spans.line(&line[blocks.content_start()..]);
        }
        let start = offset;
        let (region, end) = match bytes[offset] {
            // A `\`` outside a span is a literal backtick, so a run opens at
            // the next one. Inside a span a `\` is literal, so a close is
            // never escaped.
            b'`' | b'$' if rules == CodeRules::None => {
                offset += 1;
                continue;
            }
            b'`' if rules == CodeRules::CommonMark && escaped(bytes, offset) => {
                offset += 1;
                continue;
            }
            b'`' => {
                let (run, close) = spans.close_in(offset, &|line| blocks.opens_block(line));
                match close {
                    Some(close) => (Region::Code, close + run),
                    None => {
                        offset += run;
                        continue;
                    }
                }
            }
            // A `$` right after a letter or digit, as in `5$` or `A$B`, is
            // text.
            b'$' if !(escaped(bytes, offset)
                || (offset > 0 && bytes[offset - 1].is_ascii_alphanumeric())) =>
            {
                match math_end(bytes, offset, &spans, &blocks, &mut math) {
                    Ok(end) => (Region::Code, end),
                    Err(skip) => {
                        offset += skip;
                        continue;
                    }
                }
            }
            // A comment that starts a line is an HTML block: it runs to the
            // next `-->`, or the end of the input.
            b'<' if bytes[offset..].starts_with(b"<!--") && starts_line(bytes, offset) => {
                let close = if comment_closes {
                    text[offset + 4..].find("-->")
                } else {
                    None
                };
                comment_closes = close.is_some();
                let end = close.map_or(bytes.len(), |at| offset + 4 + at + 3);
                (Region::Comment, end)
            }
            // One later in a line stays in its block, as a span does, and is
            // text when it does not close there.
            b'<' if bytes[offset..].starts_with(b"<!--") => {
                let close = if offset < no_comment_close_until {
                    Err(no_comment_close_until)
                } else {
                    spans.in_block(offset + 4, &|line| blocks.opens_block(line), |mut at| {
                        while at < bytes.len() && bytes[at] != b'\n' {
                            if bytes[at..].starts_with(b"-->") {
                                return Ok(at);
                            }
                            at += 1;
                        }
                        Err(at)
                    })
                };
                match close {
                    Ok(at) => (Region::Comment, at + 3),
                    Err(block_end) => {
                        no_comment_close_until = block_end;
                        offset += 1;
                        continue;
                    }
                }
            }
            b'<' if rules != CodeRules::None => match autolink_end(bytes, offset) {
                Some(end) => (Region::Code, end),
                None => {
                    offset += 1;
                    continue;
                }
            },
            _ => {
                // Plain text: on to the next byte that starts something, or
                // the start of the next line.
                offset += 1;
                while offset < bytes.len()
                    && !matches!(bytes[offset], b'`' | b'$' | b'<')
                    && bytes[offset - 1] != b'\n'
                {
                    offset += 1;
                }
                continue;
            }
        };
        push(start..end, region);
        offset = end;
    }
    out
}

/// `text` with every character in `ranges` but `\n` made a space. `ranges`
/// are byte ranges, in order and not overlapping. The character count does
/// not change.
pub(crate) fn blank(text: &str, ranges: impl IntoIterator<Item = Range<usize>>) -> String {
    let mut out = String::with_capacity(text.len());
    let mut written_up_to = 0usize;
    for range in ranges {
        out.push_str(&text[written_up_to..range.start]);
        out.extend(
            text[range.clone()]
                .chars()
                .map(|c| if c == '\n' { '\n' } else { ' ' }),
        );
        written_up_to = range.end;
    }
    out.push_str(&text[written_up_to..]);
    out
}

/// The block state of a line-by-line scan: the open fence, from [`Fences`],
/// the open raw HTML block, the list items that indented code and raw HTML
/// follow, and whether the line before was paragraph text.
#[derive(Debug, Clone)]
struct Blocks {
    rules: CodeRules,
    fences: Fences,
    /// Where the text of the list item that the open raw HTML block is in
    /// starts.
    base: usize,
    /// Whether a `<pre>`, `<script>`, `<style>` or `<textarea>` block is open.
    raw_html: bool,
    /// The column where each open list item's text starts, innermost last.
    items: Vec<usize>,
    /// Whether the line before was paragraph text, which a line indented four
    /// or more columns continues rather than starting indented code.
    paragraph: bool,
}

impl Blocks {
    fn new(rules: CodeRules) -> Self {
        Self {
            rules,
            fences: Fences::new(rules),
            base: 0,
            raw_html: false,
            items: Vec::new(),
            paragraph: false,
        }
    }

    /// Where the text of the line last given to [`Blocks::code_line`] starts,
    /// past the markers of the containers [`Fences`] follows.
    fn content_start(&self) -> usize {
        self.fences.content_start()
    }

    /// Whether `line`, which excludes its `\n`, is code from end to end: a
    /// line of a fence, of indented code or of a raw HTML block. Steps past
    /// it.
    fn code_line(&mut self, line: &[u8]) -> bool {
        if self.rules == CodeRules::None {
            return false;
        }
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        let (column, width) = indent(line, 0, 0);
        let rest = &line[width..];
        if self.raw_html {
            if column >= self.base || is_blank(rest) {
                self.raw_html = !closes_raw_html(line);
                return true;
            }
            // A line indented less than the text of the list item the block
            // is in ends the item, and the block with it.
            self.raw_html = false;
        }
        match self.fences.line(line) {
            FenceLine::Outside => {}
            FenceLine::Inside => {
                self.paragraph = false;
                return true;
            }
            FenceLine::Marker => {
                self.items.retain(|&item| item <= column);
                self.paragraph = false;
                return true;
            }
        }
        if is_blank(rest) {
            self.paragraph = false;
            return false;
        }
        let base = self.base_at(column);
        let relative = column - base;
        if self.paragraph && (relative >= 4 || !self.interrupts(rest)) {
            // A lazy or indented continuation line: the paragraph and the
            // list items it is in go on.
            return false;
        }
        self.items.retain(|&item| item <= column);
        if relative >= 4 {
            return true;
        }
        if opens_raw_html(rest) {
            self.base = base;
            self.raw_html = !closes_raw_html(line);
            self.paragraph = false;
            return true;
        }
        if thematic_break(rest)
            || atx_heading(rest)
            || is_setext(rest, self.paragraph)
            || rest.starts_with(b"<!--")
        {
            self.paragraph = false;
        } else if let Some((marker, text)) = list_marker(rest) {
            let (spaces_end, text_at) = indent(line, width + marker, column + marker);
            let gap = spaces_end - (column + marker);
            let item = if text_at == line.len() || gap > 4 {
                column + marker + 1
            } else {
                spaces_end
            };
            self.items.push(item);
            self.paragraph = text;
        } else {
            self.paragraph = true;
        }
        false
    }

    /// Where the text of the innermost open list item that a line starting
    /// at `column` is in starts, or 0.
    fn base_at(&self, column: usize) -> usize {
        self.items
            .iter()
            .rev()
            .find(|&&item| item <= column)
            .copied()
            .unwrap_or(0)
    }

    /// Whether `line`, read as the next line of a paragraph, opens a fence, a
    /// raw HTML block or an HTML comment block: where an inline span or math
    /// must stop.
    fn opens_block(&self, line: &[u8]) -> bool {
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        let (column, width) = indent(line, 0, 0);
        let rest = &line[width..];
        column - self.base_at(column) <= 3
            && ((self.rules == CodeRules::CommonMark && opens_fence(rest, self.rules).is_some())
                || opens_raw_html(rest)
                || rest.starts_with(b"<!--"))
    }

    /// Whether `rest`, a line from its first character that is not a space
    /// or tab, starts a block that ends a paragraph. A list item does when a
    /// list is open, or when it has text and is a bullet or starts at 1.
    fn interrupts(&self, rest: &[u8]) -> bool {
        opens_fence(rest, self.rules).is_some()
            || opens_raw_html(rest)
            || rest.starts_with(b"<!--")
            || thematic_break(rest)
            || atx_heading(rest)
            || is_setext(rest, true)
            || rest.first() == Some(&b'>')
            || list_marker(rest).is_some_and(|(length, text)| {
                !self.items.is_empty() || (text && (length == 1 || rest[..length - 1] == *b"1"))
            })
    }
}

/// The column of the first character from `at` that is not a space or tab,
/// and its index, when `at` is at `column`. A tab moves to the next multiple
/// of four columns.
fn indent(line: &[u8], mut at: usize, mut column: usize) -> (usize, usize) {
    while let Some(&byte) = line.get(at) {
        match byte {
            b' ' => column += 1,
            b'\t' => column += 4 - column % 4,
            _ => break,
        }
        at += 1;
    }
    (column, at)
}

/// A list item marker at the start of `rest`, `-`, `*`, `+`, or one to nine
/// digits and `.` or `)`, followed by a space, a tab or the end of the line:
/// the marker's length, and whether text follows it.
fn list_marker(rest: &[u8]) -> Option<(usize, bool)> {
    let digits = rest.iter().take_while(|b| b.is_ascii_digit()).count();
    let length = match rest.first()? {
        b'-' | b'*' | b'+' => 1,
        _ if (1..=9).contains(&digits) && matches!(rest.get(digits), Some(b'.' | b')')) => {
            digits + 1
        }
        _ => return None,
    };
    match rest.get(length) {
        None | Some(b'\r') => Some((length, false)),
        Some(b' ' | b'\t') => Some((length, !is_blank(&rest[length..]))),
        Some(_) => None,
    }
}

/// A line of only `=`, or of only `-` after a paragraph, then whitespace.
fn is_setext(rest: &[u8], after_paragraph: bool) -> bool {
    let Some(&mark @ (b'=' | b'-')) = rest.first() else {
        return false;
    };
    let run = rest.iter().take_while(|b| **b == mark).count();
    after_paragraph && is_blank(&rest[run..])
}

/// The tags whose HTML block holds text as written.
const RAW_HTML_TAGS: [&[u8]; 4] = [b"pre", b"script", b"style", b"textarea"];

/// `<pre`, `<script`, `<style` or `<textarea`, any case, then a space, a
/// tab, `>` or the end of the line, at the start of `rest`.
fn opens_raw_html(rest: &[u8]) -> bool {
    let Some(name) = rest.strip_prefix(b"<") else {
        return false;
    };
    RAW_HTML_TAGS.iter().any(|tag| {
        name.len() >= tag.len()
            && name[..tag.len()].eq_ignore_ascii_case(tag)
            && matches!(
                name.get(tag.len()),
                None | Some(b' ' | b'\t' | b'>' | b'\r')
            )
    })
}

/// Whether `line` holds `</pre>`, `</script>`, `</style>` or `</textarea>`,
/// in any case.
fn closes_raw_html(line: &[u8]) -> bool {
    line.windows(2).enumerate().any(|(at, pair)| {
        pair == b"</"
            && RAW_HTML_TAGS.iter().any(|tag| {
                let name = &line[at + 2..];
                name.len() > tag.len()
                    && name[..tag.len()].eq_ignore_ascii_case(tag)
                    && name[tag.len()] == b'>'
            })
    })
}

/// Whether the character at `at` is escaped: an odd number of `\` comes
/// right before it.
fn escaped(bytes: &[u8], at: usize) -> bool {
    bytes[..at]
        .iter()
        .rev()
        .take_while(|b| **b == b'\\')
        .count()
        % 2
        == 1
}

/// The math that the `$` at `at` opens: `Ok` with the index just past its
/// close, or `Err` with how many `$` to step past as text. `$$` closes at the
/// next `$$` in the block a span opened there would stay in.
fn math_end(
    bytes: &[u8],
    at: usize,
    spans: &Spans<'_>,
    blocks: &Blocks,
    inline: &mut MathClose,
) -> Result<usize, usize> {
    if bytes.get(at + 1) == Some(&b'$') {
        let close = spans.in_block(at + 2, &|line| blocks.opens_block(line), |mut at| {
            while at < bytes.len() && bytes[at] != b'\n' {
                if bytes[at..].starts_with(b"$$") && !escaped(bytes, at) {
                    return Ok(at);
                }
                at += 1;
            }
            Err(at)
        });
        return close.map(|close| close + 2).map_err(|_| 2);
    }
    if bytes
        .get(at + 1)
        .is_none_or(|b| matches!(b, b' ' | b'\t' | b'\r' | b'\n'))
    {
        return Err(1);
    }
    inline.find(bytes, at + 1).map(|close| close + 1).ok_or(1)
}

/// Finds the `$` that closes inline math, for a scan that asks at positions
/// that only move forward. A `$` closes math whatever opened it, and the scan
/// steps past each close it is given, so only a search that found nothing is
/// worth keeping: no later search on its line finds anything either.
#[derive(Debug, Default)]
struct MathClose {
    /// The end of the line on which a search found no close.
    none_until: Option<usize>,
}

impl MathClose {
    fn find(&mut self, bytes: &[u8], from: usize) -> Option<usize> {
        if self.none_until.is_some_and(|end| from <= end) {
            return None;
        }
        let mut at = from;
        while at < bytes.len() && bytes[at] != b'\n' {
            if bytes[at] == b'$'
                && !matches!(bytes[at - 1], b' ' | b'\t')
                && !escaped(bytes, at)
                && !bytes.get(at + 1).is_some_and(u8::is_ascii_digit)
            {
                return Some(at);
            }
            at += 1;
        }
        self.none_until = Some(at);
        None
    }
}

/// Whether only spaces and tabs come before `at` on its line.
fn starts_line(bytes: &[u8], at: usize) -> bool {
    let before = bytes[..at]
        .iter()
        .rev()
        .take_while(|b| matches!(b, b' ' | b'\t'))
        .count();
    at == before || bytes[at - before - 1] == b'\n'
}

/// The index just past the autolink `<scheme:…>` that starts at `at`, if
/// one does. A scheme is a letter, then 1 to 31 letters, digits, `+`, `.` or
/// `-`. The rest holds no space, control character, `<` or `>`.
fn autolink_end(bytes: &[u8], at: usize) -> Option<usize> {
    let rest = &bytes[at + 1..];
    if !rest.first()?.is_ascii_alphabetic() {
        return None;
    }
    let scheme = rest
        .iter()
        .take_while(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'.' | b'-'))
        .count();
    if !(2..=32).contains(&scheme) || rest.get(scheme) != Some(&b':') {
        return None;
    }
    let body = &rest[scheme + 1..];
    let close = body
        .iter()
        .position(|b| *b == b'>' || *b == b'<' || *b <= b' ' || *b == 0x7f)?;
    (body[close] == b'>').then_some(at + 1 + scheme + 1 + close + 1)
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
                CodeRules::SkillExport | CodeRules::None => FenceLine::Marker,
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
        let long_math = "$a$ [[x]] $$b$$ ".repeat(100_000);
        fn unclosed(lengths: impl Iterator<Item = usize>) -> String {
            lengths
                .map(|n| format!("x {} text\n", "`".repeat(n)))
                .collect()
        }
        let rising = unclosed(1..=2000);
        let falling = unclosed((1..=2000).rev());
        // Container blocks: a deep chain of list items and block quotes, then
        // a long run of blank lines and indented lines under it, and a table
        // row of many cells each holding an unclosed run.
        let nested = format!("{}x\n{}", "- > ".repeat(20_000), "\n    y\n".repeat(20_000));
        let quotes = format!("{}x\n{}", "> ".repeat(100_000), "> text\n".repeat(50_000));
        let cells = format!("| {}|\n", "`a | ".repeat(200_000));
        for rules in BOTH {
            for text in [
                &long_line, &long_math, &rising, &falling, &nested, &quotes, &cells,
            ] {
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

    // The cases for fences in containers and table rows are in the shared suite.
    #[test]
    fn skill_export_and_none_know_no_containers() {
        let text = "- ```\n  [[a]]\n  ```\n[[b]]";
        assert_eq!(strip_code_with(text, CodeRules::None), text);
        // Flat rules: the first line opens no fence, the third does, and
        // nothing closes it.
        assert_eq!(
            strip_code_with(text, CodeRules::SkillExport),
            "- ```\n  [[a]]\n     \n     "
        );
    }

    #[test]
    fn skill_export_reads_a_table_row_as_any_line() {
        assert_eq!(
            strip_code_with("| `a | [[x]] | b` |", CodeRules::SkillExport),
            "|                 |"
        );
    }
}
