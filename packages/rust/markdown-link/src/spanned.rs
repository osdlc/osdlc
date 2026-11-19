//! The body link scanner: every link in a body, with its byte span.
//!
//! [`crate::body_links`] is this scanner with the spans dropped.
//! [`scan_body_with`] also reports each `[[` it gave up on, so a caller can
//! flag link syntax that was left in the text. The rules for
//! a markdown link are delegated ([`crate::is_vault_link_url`],
//! [`crate::md_link_target`]) rather than restated: two spellings of "is this
//! a link" is how two scanners start disagreeing about what the vault
//! contains.

use std::collections::HashSet;
use std::ops::Range;

use crate::code::{CodeRules, Region, regions};
use crate::{Size, is_vault_link_url, md_link_target, parse_inner, parse_inner_self};

/// What a body scan counts as a link. [`ScanOptions::default`] is what
/// [`body_links_spanned`] and [`crate::body_links`] use.
///
/// # Examples
///
/// ```
/// use markdown_link::code::CodeRules;
/// use markdown_link::{ScanOptions, body_links_spanned_with};
///
/// let options = ScanOptions {
///     code_rules: CodeRules::SkillExport,
///     skip_html_comments: true,
///     self_links: true,
///     all_markdown_links: false,
/// };
/// let links = body_links_spanned_with("<!-- [[hidden]] --> [[#Intro]]", &options);
/// assert_eq!(links.len(), 1);
/// assert_eq!(links[0].target, "");
/// assert_eq!(links[0].heading.as_deref(), Some("Intro"));
/// ```
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ScanOptions {
    /// Which rules decide what is code. Links in code are not links.
    /// [`CodeRules::None`] finds no code, for text that a markdown parser has
    /// already taken the code out of.
    pub code_rules: CodeRules,
    /// Skip links inside HTML comments, as [`crate::code`] finds them. Off by
    /// default: a comment's links are found.
    pub skip_html_comments: bool,
    /// Read a wikilink with no target and a `#` fragment, `[[#Heading]]` or
    /// `[[#^block]]`, as a link to the note it is written in, with an empty
    /// [`BodyLink::target`]. Off by default: such a link is dropped.
    pub self_links: bool,
    /// Read every relative inline Markdown link, whatever its target: a
    /// `.yaml` file, a folder, a name with no extension. Off by default: a
    /// Markdown link counts only when [`crate::is_vault_link_url`] accepts
    /// its URL. A link with a URI scheme, a URL starting with `//` or an empty
    /// destination is never read. The target keeps any `#fragment` or
    /// `?query` as written, and loses `.md` only at its end:
    /// `[a](a.md#Intro)` targets `a.md#Intro`, and `[x](#h)` targets `#h`.
    pub all_markdown_links: bool,
}

/// What syntax produced a [`BodyLink`].
///
/// Not the same three as [`crate::LinkKind`]: this scanner reads bodies only,
/// so there is no `Frontmatter`, and it harvests relative markdown links, which
/// the bracket dialect has no variant for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum BodyLinkKind {
    /// A `[[target]]` link.
    Wikilink,
    /// A `![[target]]` embed.
    Embed,
    /// A relative markdown link, `[text](path)`.
    Markdown,
}

/// One outgoing reference found in a body, with its span, before resolution.
///
/// Separate from a resolved link because extraction and resolution have
/// different lifetimes: a note's links change when the note is edited, and what
/// they *resolve to* changes when any other note in the vault is created or
/// renamed. A caller that caches the first and recomputes the second needs
/// them to be two types.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BodyLink {
    /// Which syntax produced the link.
    pub kind: BodyLinkKind,
    /// The reference as written between the delimiters, with any code inside it
    /// blanked to spaces.
    pub raw: String,
    /// What resolution runs against. A wikilink's `raw` minus `#heading` /
    /// `^block` / `|alias` and the `\` escaping the pipe; a markdown link's URL
    /// percent-decoded and minus a trailing `.md`. Empty for a link to the
    /// note it is written in (see [`ScanOptions::self_links`]).
    pub target: String,
    /// A wikilink's `#heading`, as [`crate::WikiLink::heading`]. `None` for a
    /// markdown link.
    pub heading: Option<String>,
    /// A markdown link's title, as written between its quotes or
    /// parentheses: `Hint` in `[a](a.md "Hint")`. `None` when it has none,
    /// and for a wikilink or embed.
    pub title: Option<String>,
    /// A wikilink's `#^block`, as [`crate::WikiLink::block`]. `None` for a
    /// markdown link.
    pub block: Option<String>,
    /// A wikilink's or embed's `|alias`: the text after the first `|` outside
    /// code, read from the body so code inside it is kept. `None` when there
    /// is none or it is empty, and for a markdown link.
    pub alias: Option<String>,
    /// An embed's size, `|300` or `|300x200`, as [`crate::WikiLink::size`].
    pub size: Option<Size>,
    /// Byte offset within the **body** where the whole link syntax starts. An
    /// embed's leading `!` is inside it.
    pub byte_start: usize,
    /// Byte offset within the **body** just past the end of the link syntax.
    pub byte_end: usize,
}

/// Why the scanner gave up on a `[[`. See [`AbandonedLink`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AbandonReason {
    /// A `[` or `]` came before the closing `]]`: `[[` never nests, so
    /// `[[a [1]]]` and `[[x]y]]` are not links.
    Bracket,
    /// Closed, but the target is empty once the code inside it is blanked:
    /// ``[[`Note`]]``.
    Code,
    /// Closed with an empty target: `[[]]`, `[[ |alias]]`, or `[[#Heading]]`
    /// when [`ScanOptions::self_links`] is off.
    EmptyTarget,
    /// No `]]` before the end of the body.
    Unclosed,
}

/// A `[[` the scanner found outside code and did not read as a link.
///
/// What a renderer or a publisher would otherwise leave in its output as
/// literal brackets. A `[[` inside code, or inside an HTML comment when
/// [`ScanOptions::skip_html_comments`] is on, is not reported. Nor is one
/// that a link found after it starts inside, `[[[Note]]` being a literal `[`
/// and a link, or one whose first or second `[` opens a Markdown link, of
/// any URL: `[[WIP] Fix](https://example.com)`, `[[Note](Note.md)]`, or
/// `[[1]` with a `[1]: …` definition in the body. A run of `[` with no link
/// after it, such as `[[[TODO`, is one entry: from the first `[[`, with the
/// reason and end of the last.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AbandonedLink {
    /// Why it is not a link.
    pub reason: AbandonReason,
    /// Whether an unescaped `!` came before the `[[`.
    pub embed: bool,
    /// Byte offset within the **body** of the `[[`, or of the `!` before it.
    pub byte_start: usize,
    /// Byte offset just past what the scanner read: past the `]]` for
    /// [`AbandonReason::Code`] and [`AbandonReason::EmptyTarget`], up to the
    /// `[` or `]` it stopped at for [`AbandonReason::Bracket`], and the end of
    /// the body for [`AbandonReason::Unclosed`].
    pub byte_end: usize,
}

/// What [`scan_body_with`] found: the links, and the `[[` it gave up on.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BodyScan {
    /// The links, as [`body_links_spanned_with`] returns them.
    pub links: Vec<BodyLink>,
    /// Each `[[` that is not a link, in encounter order.
    pub abandoned: Vec<AbandonedLink>,
}

/// Every wikilink, embed and relative markdown link in a body, in encounter
/// order, **with byte spans**.
///
/// Code is blanked before matching, `[[` never nests, and a markdown link
/// counts only when `is_vault_link_url` accepts its URL and it carries no
/// scheme. A markdown link's text may hold brackets that balance, but no
/// `[[`, no link and no blank line, so `[[WIP] Fix](fix.md)` is a link and
/// the wikilink in `[see [[Note]]](a.md)` stays a wikilink. A `\[` or `\]`
/// in it does not count as a bracket. Its destination is read as written.
/// A `!` after an odd run of `\` is escaped: `\![[Note]]` is a
/// [`BodyLinkKind::Wikilink`] that starts at the `[[`, with the `!` left
/// outside its span as literal text, where `![[Note]]` is an
/// [`BodyLinkKind::Embed`] that starts at the `!`. An even run, as in
/// `\\![[Note]]`, escapes the backslash and leaves an embed. The span is what
/// an editor decoration, a hover preview and a rename's link rewrite need:
/// which bytes to touch.
///
/// # Why the offsets need a char table
///
/// [`crate::strip_code`] preserves the **character** count of its input, not the byte
/// count — a multi-byte char inside a code span comes back as a one-byte space.
/// So a position found in the stripped text is a valid char index into the
/// original and never a valid byte index, and the two tables below are what
/// convert. Scanning the original directly is not an option: that is how
/// `[[example]]` inside a fenced block becomes a link.
///
/// # Examples
///
/// ```
/// use markdown_link::{BodyLinkKind, body_links_spanned};
///
/// let body = "é ![[img.png|300]] and [[Note#h|alias]]";
/// let links = body_links_spanned(body);
/// assert_eq!(links.len(), 2);
/// assert_eq!(links[0].kind, BodyLinkKind::Embed);
/// assert_eq!(links[0].target, "img.png");
/// assert_eq!(&body[links[0].byte_start..links[0].byte_end], "![[img.png|300]]");
/// assert_eq!(links[1].alias.as_deref(), Some("alias"));
/// assert_eq!(&body[links[1].byte_start..links[1].byte_end], "[[Note#h|alias]]");
/// ```
pub fn body_links_spanned(body: &str) -> Vec<BodyLink> {
    body_links_spanned_with(body, &ScanOptions::default())
}

/// [`body_links_spanned`] under `options`: which code rules apply, whether
/// HTML comments hide links, and whether `[[#Heading]]` is a link.
///
/// Code and comments are found in one pass, left to right, so a `<!--` inside
/// code does not open a comment and a backtick inside a comment does not open
/// code.
pub fn body_links_spanned_with(body: &str, options: &ScanOptions) -> Vec<BodyLink> {
    scan_body_with(body, options).links
}

/// [`body_links_spanned_with`], and each `[[` it gave up on
/// ([`AbandonedLink`]): one holding a `[` or `]`, one whose target is empty
/// or only code, and one never closed.
///
/// # Examples
///
/// ```
/// use markdown_link::{AbandonReason, ScanOptions, scan_body_with};
///
/// let body = "[[Note]] [[a [1]]] [[]]";
/// let scan = scan_body_with(body, &ScanOptions::default());
/// assert_eq!(scan.links.len(), 1);
/// let reasons: Vec<_> = scan.abandoned.iter().map(|a| a.reason).collect();
/// assert_eq!(reasons, [AbandonReason::Bracket, AbandonReason::EmptyTarget]);
/// let first = &scan.abandoned[0];
/// assert_eq!(&body[first.byte_start..first.byte_end], "[[a ");
/// ```
pub fn scan_body_with(body: &str, options: &ScanOptions) -> BodyScan {
    let regions = regions(body, options.code_rules);
    // The body's chars, and each one's byte offset in the body, plus an end
    // sentinel so an exclusive range that runs to the end of the body is
    // representable.
    if u32::try_from(body.len()).is_err() {
        // Offsets are `u32`. Reporting no links beats reporting wrong spans.
        return BodyScan::default();
    }
    let (mut chars, at) = Offsets::of_body(body);
    // A destination is read as written, with no code blanked, so the chars
    // as written are kept when anything is blanked.
    let blanked =
        options.skip_html_comments || regions.iter().any(|(_, region)| *region == Region::Code);
    let mut written: Option<Vec<char>> = None;
    // The char ranges blanked. In order and disjoint, since `regions` emits
    // them in one left-to-right pass: `inner_text` relies on it.
    let blanked_chars: Vec<Range<usize>> = regions
        .iter()
        .filter(|(_, region)| options.skip_html_comments || *region == Region::Code)
        .map(|(range, _)| at.char_range(range))
        .collect();
    blank_chars(&mut chars, blanked_chars.iter().cloned());
    // With comments blanked too, the chars with only code blanked, made the
    // first time an abandoned link needs them.
    let mut code_chars: Option<Vec<char>> = None;

    // Whether any markdown link can have a destination. Built the first time
    // a `[` could use it.
    let has_destination = body.contains("](");
    let mut brackets: Option<Brackets> = None;
    let mut scan = UrlScan::default();
    let mut out = Vec::new();
    let mut abandoned = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        // Only a `[` starts anything.
        match chars[i..].iter().position(|&c| c == '[') {
            Some(step) => i += step,
            None => break,
        }
        if chars.get(i + 1) == Some(&'[') {
            let embed = i > 0 && chars[i - 1] == '!' && !escaped_bang(&chars, i - 1);
            let start = at.of(if embed { i - 1 } else { i });
            // `[[` never nests, and `[`/`]` inside would be a malformed
            // link — bail rather than swallow the rest of the note.
            let mut j = i + 2;
            let mut closed = false;
            let mut bracket = false;
            if let Some(end) = next_bracket(&chars, j) {
                j = end;
                if chars[j] == ']' && chars[j + 1] == ']' {
                    closed = true;
                } else {
                    bracket = true;
                }
            }
            if !closed {
                abandoned.push(AbandonedLink {
                    reason: if bracket {
                        AbandonReason::Bracket
                    } else {
                        AbandonReason::Unclosed
                    },
                    embed,
                    byte_start: start,
                    byte_end: if bracket { at.of(j) } else { body.len() },
                });
            }
            if closed {
                let inner = inner_text(body, &chars, &at, &blanked_chars, i + 2..j);
                let parsed = if inner.is_empty() {
                    None
                } else if options.self_links {
                    parse_inner_self(&inner, embed)
                } else {
                    parse_inner(&inner, embed)
                };
                if parsed.is_none() {
                    // Code inside was blanked to spaces, so the body's bytes
                    // there differ from the code-blanked chars. A blanked
                    // comment is not code.
                    let code = if options.skip_html_comments {
                        code_chars
                            .get_or_insert_with(|| {
                                let mut code: Vec<char> = body.chars().collect();
                                blank_chars(
                                    &mut code,
                                    regions
                                        .iter()
                                        .filter(|(_, region)| *region == Region::Code)
                                        .map(|(range, _)| at.char_range(range)),
                                );
                                code
                            })
                            .as_slice()
                    } else {
                        chars.as_slice()
                    };
                    let held_code = body[at.of(i + 2)..at.of(j)]
                        .chars()
                        .ne(code[i + 2..j].iter().copied());
                    abandoned.push(AbandonedLink {
                        reason: if held_code {
                            AbandonReason::Code
                        } else {
                            AbandonReason::EmptyTarget
                        },
                        embed,
                        byte_start: start,
                        byte_end: at.of(j + 2),
                    });
                }
                if let Some(link) = parsed {
                    // Split at the pipe `parse_inner` used, found in the
                    // stripped chars so a `|` in code is not one, then read
                    // the alias from the body so code inside it is kept.
                    let alias = find_char(&chars[i + 2..j], |c| c == '|')
                        .map(|p| body[at.of(i + 3 + p)..at.of(j)].trim())
                        .filter(|alias| !alias.is_empty())
                        .map(str::to_string);
                    drop_overlapped(&mut abandoned, at.of(i));
                    out.push(BodyLink {
                        kind: if embed {
                            BodyLinkKind::Embed
                        } else {
                            BodyLinkKind::Wikilink
                        },
                        raw: inner,
                        target: link.target,
                        heading: link.heading,
                        title: None,
                        block: link.block,
                        size: link.size,
                        alias,
                        // An embed's `!` is part of the syntax a rename has to
                        // rewrite, so it is inside the span.
                        byte_start: start,
                        byte_end: at.of(j + 2),
                    });
                }
                i = j + 2;
                continue;
            }
        }
        if (has_destination || overlaps(&abandoned, at.of(i)))
            && let Some(close) = brackets
                .get_or_insert_with(|| Brackets::new(&chars, body, &at))
                .text_end(i)
        {
            let brackets = brackets.as_ref().expect("made above");
            let url_chars: &[char] = if blanked {
                written.get_or_insert_with(|| body.chars().collect())
            } else {
                &chars
            };
            let destination = scan.destination(url_chars, close);
            if overlaps(&abandoned, at.of(i))
                && (destination.is_some() || brackets.is_reference(&chars, i, close))
            {
                drop_overlapped(&mut abandoned, at.of(i));
            }
            if let Some(destination) = destination {
                // A Markdown link, kept or not: its destination and title
                // hold no link, so the scan moves past it.
                out.extend(spanned_markdown_link(
                    i,
                    destination,
                    url_chars,
                    &at,
                    &mut scan,
                    options.all_markdown_links,
                ));
                i = destination.end;
                continue;
            }
        }
        i += 1;
    }
    BodyScan {
        links: out,
        abandoned: merge_runs(abandoned),
    }
}

/// Each char of a body's byte offset, plus an end sentinel so an exclusive
/// range that runs to the end of the body is representable.
#[derive(Debug)]
enum Offsets {
    /// A body of ASCII: a char's offset is its index.
    Identity,
    /// Offsets as `u32`: a body of 4 GiB or more is not scanned.
    Table(Vec<u32>),
}

impl Offsets {
    /// The body's chars, and where each one starts.
    fn of_body(body: &str) -> (Vec<char>, Offsets) {
        if body.is_ascii() {
            return (body.bytes().map(char::from).collect(), Offsets::Identity);
        }
        let mut at: Vec<u32> = Vec::with_capacity(body.len() + 1);
        let mut chars: Vec<char> = Vec::with_capacity(body.len());
        for (offset, c) in body.char_indices() {
            at.push(offset as u32);
            chars.push(c);
        }
        at.push(body.len() as u32);
        (chars, Offsets::Table(at))
    }

    /// The byte offset of the char at `index`.
    fn of(&self, index: usize) -> usize {
        match self {
            Offsets::Identity => index,
            Offsets::Table(at) => at[index] as usize,
        }
    }

    /// The index of the char that starts at or after the byte `offset`.
    fn char_index(&self, offset: usize) -> usize {
        match self {
            Offsets::Identity => offset,
            Offsets::Table(at) => at.partition_point(|&start| (start as usize) < offset),
        }
    }

    /// The chars of a byte range.
    fn char_range(&self, bytes: &Range<usize>) -> Range<usize> {
        self.char_index(bytes.start)..self.char_index(bytes.end)
    }
}

/// Blanks the chars of each range to spaces, but `\n`, as [`blank`] does to
/// text.
fn blank_chars(chars: &mut [char], ranges: impl IntoIterator<Item = Range<usize>>) {
    for range in ranges {
        for c in &mut chars[range] {
            if *c != '\n' {
                *c = ' ';
            }
        }
    }
}

/// The index of the first `[` or `]` at or after `from`, but not the last
/// char, since the caller reads the char after it.
fn next_bracket(chars: &[char], from: usize) -> Option<usize> {
    let (_, text) = chars.get(from..)?.split_last()?;
    find_char(text, |c| c == '[' || c == ']').map(|p| from + p)
}

/// The index of the first char `is` accepts, as `position` would return it.
///
/// Tests the first sixteen chars one by one (most links are shorter), then
/// sixteen at a time as one or-reduction the compiler vectorizes. A loop
/// counter spilled to the stack in a large caller such as `scan_body_with`
/// then costs one store-to-load round trip per sixteen chars, not per char.
fn find_char(chars: &[char], is: impl Fn(char) -> bool) -> Option<usize> {
    let head = chars.len().min(16);
    if let Some(p) = chars[..head].iter().position(|&c| is(c)) {
        return Some(p);
    }
    let mut skipped = head;
    for chunk in chars[head..].as_chunks::<16>().0 {
        if chunk.iter().fold(false, |any, &c| any | is(c)) {
            break;
        }
        skipped += 16;
    }
    chars[skipped..]
        .iter()
        .position(|&c| is(c))
        .map(|p| skipped + p)
}

/// The chars of `range` as a string: the body's bytes there, or the blanked
/// chars when a blanked range reaches into it. `blanked` is in order and
/// disjoint, so only the first range that ends after `range` starts can.
fn inner_text(
    body: &str,
    chars: &[char],
    at: &Offsets,
    blanked: &[Range<usize>],
    range: Range<usize>,
) -> String {
    let next = blanked.partition_point(|b| b.end <= range.start);
    if blanked.get(next).is_some_and(|b| b.start < range.end) {
        chars[range].iter().collect()
    } else {
        body[at.of(range.start)..at.of(range.end)].to_string()
    }
}

/// Whether the `!` at `bang` follows an odd run of `\`: `\![[Note]]` is a
/// literal `!` and a wikilink, not an embed.
fn escaped_bang(chars: &[char], bang: usize) -> bool {
    chars[..bang]
        .iter()
        .rev()
        .take_while(|c| **c == '\\')
        .count()
        % 2
        == 1
}

/// Folds each abandoned `[[` that starts inside the one before it into that
/// one, so a run of `[` such as `[[[TODO` is one entry: from the first `[[`,
/// with the reason and end of the last. As in [`drop_overlapped`], an
/// embed's `!` does not count: in `[[x![[y` the embed is its own entry.
fn merge_runs(abandoned: Vec<AbandonedLink>) -> Vec<AbandonedLink> {
    let mut out: Vec<AbandonedLink> = Vec::with_capacity(abandoned.len());
    for next in abandoned {
        match out.last_mut() {
            Some(run) if next.byte_start + usize::from(next.embed) < run.byte_end => {
                run.reason = next.reason;
                run.byte_end = next.byte_end;
            }
            _ => out.push(next),
        }
    }
    out
}

/// Whether the last abandoned `[[` has its first or second `[` at or after
/// `bracket`, the byte offset of a `[`. An embed's `!` right after an
/// abandoned `[[`, as in `[[x![[B]]`, does not count.
fn overlaps(abandoned: &[AbandonedLink], bracket: usize) -> bool {
    abandoned
        .last()
        .is_some_and(|a| a.byte_start + usize::from(a.embed) + 2 > bracket)
}

/// Drops each abandoned `[[` whose first or second `[` opens a link:
/// `bracket` is the byte offset of the link's first `[`, after any `!`.
/// After a `[` or `]` the scanner moves on one char, so `[[[Note]]` is a
/// literal `[` and a link, not a `[[` given up on.
fn drop_overlapped(abandoned: &mut Vec<AbandonedLink>, bracket: usize) {
    while overlaps(abandoned, bracket) {
        abandoned.pop();
    }
}

/// The brackets of a body's Markdown links: where the text of each link
/// that a `[` could open ends, and the labels of the link reference
/// definitions.
#[derive(Debug)]
struct Brackets {
    /// The char index of each `]` that closes link text, by the index of its
    /// `[`. The brackets between balance, hold no `[[` and no `](` (a link's
    /// text holds no link), and no blank line comes between them. A `\[` or `\]` is not a bracket.
    /// Zero for a `[` that opens none: a `]` is never at index 0.
    text_end: Vec<u32>,
    /// Each `[label]: …` definition's label, as [`normalize_label`] gives it.
    labels: HashSet<String>,
}

impl Brackets {
    /// `chars` are the body's with code blanked, and `at` maps a char index
    /// to its byte offset in `body`. A blank line is read in `body`, so a
    /// line that is only code is not blank.
    fn new(chars: &[char], body: &str, at: &Offsets) -> Self {
        let mut brackets = Brackets {
            text_end: vec![0; chars.len()],
            labels: HashSet::new(),
        };
        // Each open `[`, and how many `[[` and `](` had been seen when it was
        // pushed, counting a `[[` that it starts.
        let mut open: Vec<(usize, usize)> = Vec::new();
        let mut seen = 0usize;
        let mut k = 0usize;
        while k < chars.len() {
            // Only a backslash, a bracket or a line break matters.
            match chars[k..]
                .iter()
                .position(|&c| c == '\n' || (c as u32).wrapping_sub('[' as u32) <= 2)
            {
                Some(step) => k += step,
                None => break,
            }
            match chars[k] {
                // An escaped character, `\[` and `\\` among them. A `\` at
                // the end of a line escapes nothing.
                '\\' if chars.get(k + 1).is_some_and(|c| *c != '\n') => k += 1,
                '[' => {
                    if chars.get(k + 1) == Some(&'[') {
                        seen += 1;
                    }
                    open.push((k, seen));
                }
                ']' => {
                    if let Some((start, before)) = open.pop()
                        && before == seen
                    {
                        brackets.text_end[start] = k as u32;
                    }
                    if chars.get(k + 1) == Some(&'(') {
                        seen += 1;
                    }
                }
                '\n' => {
                    let blank = body.as_bytes()[at.of(k + 1)..]
                        .iter()
                        .find(|b| !matches!(b, b' ' | b'\t' | b'\r'))
                        .is_none_or(|b| *b == b'\n');
                    if blank {
                        open.clear();
                    }
                    if let Some(label) = definition_label(&chars[k + 1..]) {
                        brackets.labels.insert(label);
                    }
                }
                _ => {}
            }
            k += 1;
        }
        if let Some(label) = definition_label(chars) {
            brackets.labels.insert(label);
        }
        brackets
    }

    /// The `]` that ends the text of a link opened by the `[` at `start`.
    fn text_end(&self, start: usize) -> Option<usize> {
        Some(self.text_end[start] as usize).filter(|&end| end != 0)
    }

    /// Whether the `[` at `start`, whose text ends at `close`, opens a
    /// reference link whose label a definition in the body names:
    /// `[text][label]`, `[label][]` or `[label]`.
    fn is_reference(&self, chars: &[char], start: usize, close: usize) -> bool {
        let text = &chars[start + 1..close];
        let label = match chars.get(close + 1) {
            Some('[') => {
                let rest = &chars[close + 2..];
                match rest.iter().position(|c| matches!(c, '[' | ']')) {
                    Some(end)
                        if rest[end] == ']' && rest[..end].iter().all(|c| c.is_whitespace()) =>
                    {
                        text
                    }
                    Some(end) if rest[end] == ']' => &rest[..end],
                    _ => return false,
                }
            }
            _ => text,
        };
        self.labels.contains(&normalize_label(label))
    }
}

/// The label of a link reference definition, `[label]:` after up to three
/// spaces, at the start of `line`.
fn definition_label(line: &[char]) -> Option<String> {
    let indent = line.iter().take(3).take_while(|c| **c == ' ').count();
    let rest = line[indent..].strip_prefix(&['['])?;
    let end = rest.iter().position(|c| matches!(c, '[' | ']' | '\n'))?;
    let label = normalize_label(&rest[..end]);
    (rest[end] == ']' && rest.get(end + 1) == Some(&':') && !label.is_empty()).then_some(label)
}

/// A link label as a definition and a reference match it: lowercase, with
/// each run of whitespace one space and none at either end. Empty for a
/// label of only whitespace, which no reference matches.
fn normalize_label(label: &[char]) -> String {
    let text: String = label.iter().collect();
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// An inline link's destination and title, after the `]` that ends its
/// text.
#[derive(Debug, Clone, Copy)]
struct Destination {
    /// The char index where the URL starts.
    url_start: usize,
    /// The char index just past the URL.
    url_end: usize,
    /// The char range of the title, without its delimiters.
    title: Option<(usize, usize)>,
    /// The char index just past the `)`.
    end: usize,
}

/// `[text](url)` starting at `start`, with its `destination`. `None` when it
/// is not a link this dialect harvests: `all_markdown_links` reads every
/// relative URL, and otherwise [`is_vault_link_url`] decides. The URL is built
/// only for a link, so a body of failed attempts stays linear.
fn spanned_markdown_link(
    start: usize,
    destination: Destination,
    chars: &[char],
    at: &Offsets,
    scan: &mut UrlScan,
    all_markdown_links: bool,
) -> Option<BodyLink> {
    let Destination {
        url_start,
        url_end,
        title,
        end,
    } = destination;
    let harvested = if all_markdown_links {
        url_end > url_start
    } else {
        scan.is_vault_link(chars, url_start, url_end)
    };
    if !harvested || is_external(&chars[url_start..url_end]) {
        return None;
    }
    let url: String = chars[url_start..url_end].iter().collect();
    Some(BodyLink {
        kind: BodyLinkKind::Markdown,
        target: md_link_target(&url),
        heading: None,
        title: title.map(|(from, to)| chars[from..to].iter().collect()),
        block: None,
        alias: None,
        size: None,
        raw: url,
        byte_start: at.of(start),
        byte_end: at.of(end),
    })
}

/// How many chars of a URL are read in place before a run or the tables take
/// over.
const IN_PLACE: usize = 64;

/// What earlier markdown link attempts learned about the destinations they
/// read, in a body's chars as written, so that a body of failed attempts stays
/// linear. Each attempt starts later than the one before. The last answer of
/// each kind is remembered. A URL too long to read in place leaves the
/// parentheses of its run, which answer later starts in that run. When a run
/// is not enough, tables answer every start.
///
/// A destination and title are read as written, not with code blanked, as
/// CommonMark reads them where the link's `](` is: `[a](notes/$x$.md)` is a
/// link, and the title of ``[a](a.md "`")`` is a backtick. The code lexer
/// does not know links, so it may still open code at such a backtick, which
/// can hide text after the link.
#[derive(Debug, Default)]
struct UrlScan {
    /// The run of non-whitespace chars the last long URL started in.
    run: Option<Run>,
    /// Made when a long URL is not answered by `run`.
    tables: Option<UrlTables>,
    tail: Option<UrlTail>,
}

/// What a run of non-whitespace chars from `start` to `end` holds of
/// parentheses, when it holds at most one unescaped `)`. It answers where an
/// unbracketed URL starting in the run ends, in constant time.
#[derive(Debug)]
struct Run {
    start: usize,
    /// The first whitespace after `start`, or the body's length.
    end: usize,
    /// The unescaped `)`, if there is one.
    close: Option<usize>,
    /// The last two unescaped `(` before `close`, or before `end` when there
    /// is no `)`, latest first.
    opens: [Option<usize>; 2],
    /// The last unescaped `(` after `close`.
    open_after: Option<usize>,
}

impl Run {
    /// The run from `start` to the next whitespace, or `None` when it holds
    /// more than one unescaped `)`.
    fn new(chars: &[char], start: usize) -> Option<Self> {
        let n = chars.len();
        let mut close = None;
        let mut end = n;
        // The index of the char a `\` just before it escapes.
        let mut escaped = usize::MAX;
        let mut k = start;
        loop {
            k = next_stop(chars, k);
            let Some(&c) = chars.get(k) else { break };
            match c {
                '\\' if escaped != k => escaped = k + 1,
                ')' if escaped != k => {
                    if close.is_some() {
                        return None;
                    }
                    close = Some(k);
                }
                _ if is_space(c) => {
                    end = k;
                    break;
                }
                _ => {}
            }
            k += 1;
        }
        let mut opens = unescaped_opens(chars, start, close.unwrap_or(end));
        let open_after = close.and_then(|close| unescaped_opens(chars, close + 1, end).next());
        Some(Run {
            start,
            end,
            close,
            opens: [opens.next(), opens.next()],
            open_after,
        })
    }

    /// Where the URL at `from` ends: `None` when `from` is outside the run,
    /// `Some(None)` when no URL starts there.
    fn url_end(&self, from: usize, body_len: usize) -> Option<Option<usize>> {
        if !(self.start..self.end).contains(&from) {
            return None;
        }
        let at_or_after = |open: Option<usize>| open.is_some_and(|open| open >= from);
        let to_space = |balanced: bool| (balanced && self.end < body_len).then_some(self.end);
        Some(match self.close {
            Some(close) if from <= close => {
                match (at_or_after(self.opens[0]), at_or_after(self.opens[1])) {
                    (false, _) => Some(close),
                    (true, false) => to_space(self.open_after.is_none()),
                    (true, true) => None,
                }
            }
            Some(_) => to_space(!at_or_after(self.open_after)),
            None => to_space(!at_or_after(self.opens[0])),
        })
    }
}

/// A table over a body's chars that gives a URL's end in constant time.
#[derive(Debug)]
struct UrlTables {
    /// For each char index, where an unbracketed URL starting there ends, or
    /// `NO_END` when none does.
    end: Vec<u32>,
}

const NO_END: u32 = u32::MAX;

impl UrlTables {
    fn new(chars: &[char]) -> Self {
        let n = chars.len();
        let mut end = vec![NO_END; n + 1];
        // From the right, within the run of non-whitespace chars after
        // `space`: the unescaped `)` that no `(` after the char `k` closes,
        // nearest last, and how many unescaped `(` after `k` close no `)`.
        let mut space = n;
        let mut closes: Vec<u32> = Vec::new();
        let mut unclosed = 0usize;
        for k in (0..n).rev() {
            let c = chars[k];
            if is_space(c) {
                space = k;
                closes.clear();
                unclosed = 0;
                continue;
            }
            if (c == '(' || c == ')') && !is_escaped(chars, k) {
                if c == ')' {
                    closes.push(k as u32);
                } else if closes.pop().is_none() {
                    unclosed += 1;
                }
            }
            if let Some(&paren) = closes.last() {
                end[k] = paren;
            } else if space < n && unclosed == 0 {
                end[k] = space as u32;
            }
        }
        Self { end }
    }
}

/// How many chars [`Run::new`] tests at once.
const CHUNK: usize = 32;

/// Whether [`Run::new`] must look at `c`. Non-ASCII is included because it
/// may be Unicode whitespace.
fn is_stop(c: char) -> bool {
    (c <= ' ') | (c == ')') | (c == '\\') | (c >= '\u{80}')
}

/// The index of the first char at or after `from` that [`is_stop`], or the
/// body's length.
fn next_stop(chars: &[char], from: usize) -> usize {
    let mut at = from;
    for chunk in chars[from..].chunks(CHUNK) {
        if chunk.iter().fold(false, |any, &c| any | is_stop(c)) {
            return at + chunk.iter().position(|&c| is_stop(c)).unwrap_or(0);
        }
        at += chunk.len();
    }
    at
}

/// The indexes of the unescaped `(` in `chars[from..to]`, last first.
fn unescaped_opens(chars: &[char], from: usize, to: usize) -> impl Iterator<Item = usize> + '_ {
    (from..to)
        .rev()
        .filter(move |&k| chars[k] == '(' && !is_escaped(chars, k))
}

/// Whether an odd run of `\` comes just before `chars[at]`.
fn is_escaped(chars: &[char], at: usize) -> bool {
    chars[..at].iter().rev().take_while(|&&c| c == '\\').count() % 2 == 1
}

/// URLs ending at `end`: the last `.` or `/` at or after `from`, and
/// [`is_vault_link_url`] of each URL tail asked so far, by its start.
#[derive(Debug)]
struct UrlTail {
    end: usize,
    from: usize,
    mark: Option<usize>,
    answers: Vec<(usize, bool)>,
}

impl UrlScan {
    /// The destination and title after the `]` at `close`, much as CommonMark
    /// reads an inline link: `(`, then a URL, then a title in `"…"`, `'…'` or
    /// `(…)` after whitespace, then `)`, with whitespace and at most one line
    /// break between the parts. The URL is `<…>`, which may hold spaces but no
    /// `<` or line break, or a run with no whitespace whose parentheses
    /// balance. A `\` escapes the next character, but not a line break.
    /// Unlike CommonMark, a title stays on one line, and no line break comes
    /// before an unbracketed URL.
    fn destination(&mut self, chars: &[char], close: usize) -> Option<Destination> {
        if chars.get(close + 1) != Some(&'(') {
            return None;
        }
        let from = skip_space(chars, close + 2);
        let (url_start, url_end, after_url) = if chars.get(from) == Some(&'<') {
            let end = delimited(chars, from + 1, '>', &['<'])?;
            (from + 1, end, end + 1)
        } else if chars[close + 2..from].contains(&'\n') {
            // A line break before an unbracketed URL could put it on a line
            // that starts a block quote, heading or list item.
            return None;
        } else {
            let end = self.bare_url_end(chars, from)?;
            (from, end, end)
        };
        let mut end = skip_space(chars, after_url);
        let mut title = None;
        if end > after_url {
            let close_with = match chars.get(end) {
                Some('"') => Some(('"', &[][..])),
                Some('\'') => Some(('\'', &[][..])),
                Some('(') => Some((')', &['('][..])),
                _ => None,
            };
            if let Some((delimiter, refused)) = close_with {
                let title_end = delimited(chars, end + 1, delimiter, refused)?;
                title = Some((end + 1, title_end));
                end = skip_space(chars, title_end + 1);
            }
        }
        (chars.get(end) == Some(&')')).then_some(Destination {
            url_start,
            url_end,
            title,
            end: end + 1,
        })
    }

    /// Where the unbracketed URL at `from` ends, or `None` when it is not
    /// one: it runs to the first whitespace or the first unescaped `)` that no
    /// `(` in it opens, and its parentheses balance. A short URL is read in
    /// place; a long one from a run or the tables, so that a body of long
    /// failed attempts stays linear.
    fn bare_url_end(&mut self, chars: &[char], from: usize) -> Option<usize> {
        if let Some(answer) = self
            .run
            .as_ref()
            .and_then(|run| run.url_end(from, chars.len()))
        {
            return answer;
        }
        // Once the tables are made, they answer every read.
        let stop = if self.tables.is_none() {
            chars.len().min(from + IN_PLACE)
        } else {
            from
        };
        let mut depth = 0usize;
        let mut escaped = false;
        for (k, &c) in chars[from..stop].iter().enumerate() {
            let k = from + k;
            if is_space(c) {
                return (k > from && depth == 0).then_some(k);
            }
            match (c, escaped) {
                ('(', false) => depth += 1,
                (')', false) if depth == 0 => return Some(k),
                (')', false) => depth -= 1,
                _ => {}
            }
            escaped = !escaped && c == '\\';
        }
        if stop == chars.len() {
            return None;
        }
        // A run is made for a start past the last run, so that runs do not
        // overlap and reading them stays linear.
        if self.tables.is_none() && self.run.as_ref().is_none_or(|run| from >= run.end) {
            self.run = Run::new(chars, from);
            if let Some(answer) = self
                .run
                .as_ref()
                .and_then(|run| run.url_end(from, chars.len()))
            {
                return answer;
            }
        }
        let tables = self.tables.get_or_insert_with(|| UrlTables::new(chars));
        let end = tables.end[from];
        (end != NO_END).then_some(end as usize)
    }

    /// [`is_vault_link_url`] of `chars[from..end]`. That answer depends only
    /// on whether the URL ends in `.md` after at least one character and on
    /// the extension of its last segment. So the URL from the character before
    /// its last `.` gives the same answer, and that tail is shared by every
    /// attempt ending at `end`.
    fn is_vault_link(&mut self, chars: &[char], from: usize, end: usize) -> bool {
        let tail = match &mut self.tail {
            Some(tail) if tail.end == end && tail.from <= from => tail,
            slot => slot.insert(UrlTail {
                end,
                from,
                mark: chars[from..end]
                    .iter()
                    .rposition(|c| matches!(c, '.' | '/'))
                    .map(|i| from + i),
                answers: Vec::new(),
            }),
        };
        let Some(mark) = tail.mark.filter(|&mark| mark >= from && chars[mark] == '.') else {
            return false;
        };
        let tail_start = from.max(mark.saturating_sub(1));
        if let Some(&(_, answer)) = tail.answers.iter().find(|(at, _)| *at == tail_start) {
            return answer;
        }
        let answer = is_vault_link_url(&chars[tail_start..end].iter().collect::<String>());
        tail.answers.push((tail_start, answer));
        answer
    }
}

/// [`char::is_whitespace`], with a quick path for ASCII.
fn is_space(c: char) -> bool {
    matches!(c, ' ' | '\t'..='\r') || (!c.is_ascii() && c.is_whitespace())
}

/// The index past the spaces and tabs from `at`, and at most one line break
/// among them. A `\r` counts only before a `\n`.
fn skip_space(chars: &[char], mut at: usize) -> usize {
    let mut line_break = false;
    loop {
        match chars.get(at) {
            Some(' ' | '\t') => at += 1,
            Some('\r') if chars.get(at + 1) == Some(&'\n') => at += 1,
            Some('\n') if !line_break => {
                line_break = true;
                at += 1;
            }
            _ => return at,
        }
    }
}

/// The index of the first unescaped `close` at or after `from` on the same
/// line, when no unescaped char of `refused` comes before it.
fn delimited(chars: &[char], from: usize, close: char, refused: &[char]) -> Option<usize> {
    let mut at = from;
    loop {
        let c = *chars.get(at)?;
        if c == close {
            return Some(at);
        }
        if c == '\n' || refused.contains(&c) {
            return None;
        }
        if c == '\\' && chars.get(at + 1).is_some_and(|next| *next != '\n') {
            at += 1;
        }
        at += 1;
    }
}

/// Whether a URL points outside the vault: it has a URI scheme, or starts
/// with `//`.
fn is_external(url: &[char]) -> bool {
    url.starts_with(&['/', '/']) || has_scheme(url)
}

/// `http:`, `mailto:`, an app-specific scheme — anything with a URI scheme is external.
fn has_scheme(url: &[char]) -> bool {
    let mut chars = url.iter();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    for &c in chars {
        if c == ':' {
            return true;
        }
        if !(c.is_ascii_alphanumeric() || c == '+' || c == '.' || c == '-') {
            return false;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The end of the unbracketed URL at `from`, read char by char.
    fn url_end_by_hand(chars: &[char], from: usize) -> Option<usize> {
        let mut depth = 0usize;
        let mut escaped = false;
        for (k, &c) in chars.iter().enumerate().skip(from) {
            if is_space(c) {
                return (k > from && depth == 0).then_some(k);
            }
            match (c, escaped) {
                ('(', false) => depth += 1,
                (')', false) if depth == 0 => return Some(k),
                (')', false) => depth -= 1,
                _ => {}
            }
            escaped = !escaped && c == '\\';
        }
        None
    }

    #[test]
    fn long_urls_end_where_reading_them_char_by_char_ends() {
        let alphabet: Vec<char> = "((()))\\\\ \na\u{a0}é".chars().collect();
        let mut seed = 7u64;
        let mut next = move |bound: usize| {
            seed = seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (seed >> 33) as usize % bound
        };
        for round in 0..400 {
            let n = 70 + next(160);
            let spread = 1 + next(alphabet.len());
            let chars: Vec<char> = (0..n)
                .map(|_| {
                    if next(8) == 0 {
                        alphabet[next(spread)]
                    } else {
                        'a'
                    }
                })
                .collect();
            let mut scan = UrlScan::default();
            let mut from = 0;
            while from < n {
                if round % 2 == 1 {
                    from = next(n);
                }
                if from == 0 || chars[from - 1] != '\\' {
                    assert_eq!(
                        scan.bare_url_end(&chars, from),
                        url_end_by_hand(&chars, from),
                        "{from} in {chars:?}"
                    );
                }
                from += 1 + next(30);
            }
        }
    }

    #[test]
    fn find_char_finds_what_position_finds() {
        for len in 0..80 {
            for at in (0..len).map(Some).chain([None]) {
                let mut chars = vec!['a'; len];
                if let Some(at) = at {
                    chars[at] = '|';
                    // A later match in another block must not win.
                    chars[len - 1] = '|';
                }
                assert_eq!(
                    find_char(&chars, |c| c == '|'),
                    chars.iter().position(|&c| c == '|'),
                    "{at:?} in {len}"
                );
            }
        }
    }

    /// A `]]`, `|`, stray `]` or code span at every distance from the `[[`,
    /// across the sixteen-char blocks `find_char` reads.
    #[test]
    fn long_wikilinks_read_like_short_ones() {
        let options = ScanOptions::default();
        for n in 1..80 {
            let a = "a".repeat(n);
            let link = |body: &str| {
                let scan = scan_body_with(body, &options);
                assert!(scan.abandoned.is_empty(), "{body}: {:?}", scan.abandoned);
                let [link] = <[BodyLink; 1]>::try_from(scan.links)
                    .unwrap_or_else(|links| panic!("{body}: {links:?}"));
                link
            };
            let abandoned = |body: &str| {
                let scan = scan_body_with(body, &options);
                assert!(scan.links.is_empty(), "{body}: {:?}", scan.links);
                let ends: Vec<_> = scan
                    .abandoned
                    .iter()
                    .map(|a| (a.reason, a.byte_end))
                    .collect();
                ends
            };

            let plain = link(&format!("[[{a}]]"));
            assert_eq!((plain.raw.as_str(), plain.byte_end), (a.as_str(), n + 4));
            let aliased = link(&format!("[[{a}|b]]"));
            assert_eq!(
                (aliased.target.as_str(), aliased.alias.as_deref()),
                (a.as_str(), Some("b"))
            );
            // The raw text comes from the code-blanked chars, not the body.
            let code = link(&format!("[[{a}`c`]]"));
            assert_eq!(
                (code.raw, code.target.as_str(), code.byte_end),
                (format!("{a}   "), a.as_str(), n + 7)
            );
            assert_eq!(
                abandoned(&format!("[[{a}]x]]")),
                [(AbandonReason::Bracket, n + 2)]
            );
            assert_eq!(
                abandoned(&format!("[[{a}]")),
                [(AbandonReason::Unclosed, n + 3)]
            );
        }
    }

    /// A quadratic URL, bracket or code scan takes tens of seconds on the
    /// largest of these in a debug build; a linear one takes well under a second, even on a loaded
    /// machine. The bound is that wide on purpose: it catches the shape of the
    /// cost, not a slowdown.
    #[test]
    fn a_scan_is_linear_in_failed_link_and_code_attempts() {
        for n in [25_000, 50_000, 100_000] {
            for body in [
                "[](a".repeat(n),
                format!("{})", "[](a".repeat(n)),
                format!("{}.md)", "[](a:".repeat(n)),
                format!("{}.x)", "[](a/".repeat(n)),
                "[".repeat(n),
                "[[a]".repeat(n),
                "[a]".repeat(n),
                "$x ".repeat(n),
                "<a:".repeat(n),
                "- x\n  ".repeat(n),
                format!("{}{}", "[a".repeat(n), "](x".repeat(n)),
                "a <!-- ".repeat(n),
                "](a".repeat(n),
                "[](a \"".repeat(n),
                "[](a '".repeat(n),
                "[](a (".repeat(n),
                "[](<a ".repeat(n),
                "[](a(".repeat(n),
                format!("{}{}", "[](a ".repeat(n), "\"".repeat(n)),
            ] {
                let started = std::time::Instant::now();
                assert!(body_links_spanned(&body).is_empty());
                let elapsed = started.elapsed();
                assert!(
                    elapsed < std::time::Duration::from_secs(10),
                    "{} KB took {elapsed:?}",
                    body.len() / 1000
                );
            }
        }
    }
}
