//! The body link scanner: every link in a body, with its byte span.
//!
//! [`crate::body_links`] is this scanner with the spans dropped.
//! [`scan_body_with`] also reports each `[[` it gave up on, so a caller can
//! flag link syntax that was left in the text. The rules for
//! a markdown link are delegated ([`crate::is_vault_link_url`],
//! [`crate::md_link_target`]) rather than restated: two spellings of "is this
//! a link" is how two scanners start disagreeing about what the vault
//! contains.

use std::collections::{HashMap, HashSet};

use crate::code::{CodeRules, Region, blank, regions};
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
/// };
/// let links = body_links_spanned_with("<!-- [[hidden]] --> [[#Intro]]", &options);
/// assert_eq!(links.len(), 1);
/// assert_eq!(links[0].target, "");
/// assert_eq!(links[0].heading.as_deref(), Some("Intro"));
/// ```
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ScanOptions {
    /// Which rules decide what is code. Links in code are not links.
    pub code_rules: CodeRules,
    /// Skip links inside HTML comments, as [`crate::code`] finds them. Off by
    /// default: a comment's links are found.
    pub skip_html_comments: bool,
    /// Read a wikilink with no target and a `#` fragment, `[[#Heading]]` or
    /// `[[#^block]]`, as a link to the note it is written in, with an empty
    /// [`BodyLink::target`]. Off by default: such a link is dropped.
    pub self_links: bool,
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
    /// Whether a `!` came before the `[[`.
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
/// The span is what an editor decoration, a hover preview and a rename's
/// link rewrite need: which bytes to touch.
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
    let code_blanked = || {
        blank(
            body,
            regions
                .iter()
                .filter(|(_, region)| *region == Region::Code)
                .map(|(range, _)| range.clone()),
        )
    };
    let chars: Vec<char> = if options.skip_html_comments {
        blank(body, regions.iter().map(|(range, _)| range.clone()))
    } else {
        code_blanked()
    }
    .chars()
    .collect();
    // With comments blanked too, the chars with only code blanked, made the
    // first time an abandoned link needs them.
    let mut code_chars: Option<Vec<char>> = None;
    // char index -> byte offset, in the ORIGINAL body, plus an end sentinel so
    // an exclusive range that runs to the end of the body is representable.
    let mut at: Vec<usize> = body.char_indices().map(|(i, _)| i).collect();
    at.push(body.len());
    if chars.len() + 1 != at.len() {
        // `strip_code` must preserve the char count. If it ever does not,
        // reporting no links beats reporting spans that index the wrong bytes
        // and would splice mid-character.
        return BodyScan::default();
    }

    let brackets = Brackets::new(&chars, body, &at);
    // Made the first time a `](` is reached.
    let mut scan: Option<UrlScan> = None;
    let mut out = Vec::new();
    let mut abandoned = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i] == '[' && chars.get(i + 1) == Some(&'[') {
            let embed = i > 0 && chars[i - 1] == '!';
            let start = at[if embed { i - 1 } else { i }];
            let mut j = i + 2;
            let mut inner = String::new();
            let mut closed = false;
            let mut bracket = false;
            while j + 1 < chars.len() {
                if chars[j] == ']' && chars[j + 1] == ']' {
                    closed = true;
                    break;
                }
                // `[[` never nests, and `[`/`]` inside would be a malformed
                // link — bail rather than swallow the rest of the note.
                if chars[j] == '[' || chars[j] == ']' {
                    bracket = true;
                    break;
                }
                inner.push(chars[j]);
                j += 1;
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
                    byte_end: if bracket { at[j] } else { body.len() },
                });
            }
            if closed {
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
                            .get_or_insert_with(|| code_blanked().chars().collect())
                            .as_slice()
                    } else {
                        chars.as_slice()
                    };
                    let held_code = body[at[i + 2]..at[j]]
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
                        byte_end: at[j + 2],
                    });
                }
                if let Some(link) = parsed {
                    // Split at the pipe `parse_inner` used, found in the
                    // stripped chars so a `|` in code is not one, then read
                    // the alias from the body so code inside it is kept.
                    let alias = chars[i + 2..j]
                        .iter()
                        .position(|&c| c == '|')
                        .map(|p| body[at[i + 3 + p]..at[j]].trim())
                        .filter(|alias| !alias.is_empty())
                        .map(str::to_string);
                    drop_overlapped(&mut abandoned, at[i]);
                    out.push(BodyLink {
                        kind: if embed {
                            BodyLinkKind::Embed
                        } else {
                            BodyLinkKind::Wikilink
                        },
                        raw: inner,
                        target: link.target,
                        heading: link.heading,
                        block: link.block,
                        size: link.size,
                        alias,
                        // An embed's `!` is part of the syntax a rename has to
                        // rewrite, so it is inside the span.
                        byte_start: start,
                        byte_end: at[j + 2],
                    });
                }
                i = j + 2;
                continue;
            }
        }
        if chars[i] == '['
            && let Some(close) = brackets.text_end(i)
        {
            let scan = match chars.get(close + 1) {
                Some('(') => Some(scan.get_or_insert_with(|| UrlScan::new(body))),
                _ => None,
            };
            let destination = scan.as_deref().and_then(|scan| scan.destination(close));
            if overlaps(&abandoned, at[i])
                && (destination.is_some() || brackets.is_reference(&chars, i, close))
            {
                drop_overlapped(&mut abandoned, at[i]);
            }
            if let Some(destination) = destination
                && let Some(scan) = scan
                && let Some(link) = spanned_markdown_link(i, destination, &at, scan)
            {
                i = destination.end;
                out.push(link);
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
#[derive(Debug, Default)]
struct Brackets {
    /// The char index of each `]` that closes link text, by the index of its
    /// `[`. The brackets between balance, hold no `[[` and no `](` (a link's
    /// text holds no link), and no blank line comes between them. A `\[` or `\]` is not a bracket.
    text_end: HashMap<usize, usize>,
    /// Each `[label]: …` definition's label, as [`normalize_label`] gives it.
    labels: HashSet<String>,
}

impl Brackets {
    /// `chars` are the body's with code blanked, and `at` maps a char index
    /// to its byte offset in `body`. A blank line is read in `body`, so a
    /// line that is only code is not blank.
    fn new(chars: &[char], body: &str, at: &[usize]) -> Self {
        let mut brackets = Brackets::default();
        // Each open `[`, and how many `[[` and `](` had been seen when it was
        // pushed, counting a `[[` that it starts.
        let mut open: Vec<(usize, usize)> = Vec::new();
        let mut seen = 0usize;
        let mut k = 0usize;
        while k < chars.len() {
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
                        brackets.text_end.insert(start, k);
                    }
                    if chars.get(k + 1) == Some(&'(') {
                        seen += 1;
                    }
                }
                '\n' => {
                    let blank = body.as_bytes()[at[k + 1]..]
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
        self.text_end.get(&start).copied()
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

/// An inline link's destination: `(url)` or `(<url>)` after the `]` that
/// ends its text.
#[derive(Debug, Clone, Copy)]
struct Destination {
    /// The char index where the URL starts.
    url_start: usize,
    /// The char index just past the URL.
    url_end: usize,
    /// The char index just past the `)`.
    end: usize,
}

/// `[text](relative/note.md)` starting at `start`, with its `destination`.
/// `None` when it is not a link this dialect harvests.
///
/// [`is_vault_link_url`] decides "is this a reference" and [`md_link_target`]
/// "what does it point at". The URL is built only for a link, so a body of
/// failed attempts stays linear.
fn spanned_markdown_link(
    start: usize,
    destination: Destination,
    at: &[usize],
    scan: &mut UrlScan,
) -> Option<BodyLink> {
    let Destination {
        url_start,
        url_end,
        end,
    } = destination;
    if !scan.is_vault_link(url_start, url_end) || has_scheme(&scan.chars[url_start..url_end]) {
        // Not a link this dialect harvests. The caller advances ONE character
        // rather than skipping past the `[text](…)` it just walked, so a match
        // may start at an inner `[`: `[a[b](x.md)` is a link.
        return None;
    }
    let url: String = scan.chars[url_start..url_end].iter().collect();
    Some(BodyLink {
        kind: BodyLinkKind::Markdown,
        target: md_link_target(&url),
        heading: None,
        block: None,
        alias: None,
        size: None,
        raw: url,
        byte_start: at[start],
        byte_end: at[end],
    })
}

/// A body's chars as written, and tables over them that let each markdown
/// link attempt read its URL in constant time, whatever order the attempts
/// come in, so a body of failed attempts stays linear.
///
/// A destination is read as written, not with code blanked: a link's
/// destination is read where its `](` is, so no code or math starts in it,
/// and `[a](notes/$x$.md)` is a link.
#[derive(Debug)]
struct UrlScan {
    chars: Vec<char>,
    /// For each char index, the first `)`, `>` or whitespace at or after it.
    stop: Vec<usize>,
    /// For each char index, the last `.` or `/` before it.
    mark: Vec<Option<usize>>,
    /// [`is_vault_link_url`] of each URL tail asked so far, by its start and
    /// end.
    answers: HashMap<(usize, usize), bool>,
}

impl UrlScan {
    fn new(body: &str) -> Self {
        let chars: Vec<char> = body.chars().collect();
        let mut stop = vec![chars.len(); chars.len() + 1];
        for k in (0..chars.len()).rev() {
            stop[k] = if matches!(chars[k], ')' | '>') || chars[k].is_whitespace() {
                k
            } else {
                stop[k + 1]
            };
        }
        let mut mark = vec![None; chars.len() + 1];
        for k in 0..chars.len() {
            mark[k + 1] = if matches!(chars[k], '.' | '/') {
                Some(k)
            } else {
                mark[k]
            };
        }
        Self {
            chars,
            stop,
            mark,
            answers: HashMap::new(),
        }
    }

    /// The destination after the `]` at `close`, when its shape is the regex
    /// `\(<?([^)>\s]*)>?\)`. A URL containing whitespace is not one:
    /// `[c](<sp ace.md>)` has none.
    fn destination(&self, close: usize) -> Option<Destination> {
        let chars = &self.chars;
        if chars.get(close + 1) != Some(&'(') {
            return None;
        }
        let angled = chars.get(close + 2) == Some(&'<');
        let url_start = if angled { close + 3 } else { close + 2 };
        let url_end = self.stop[url_start.min(chars.len())];
        let mut end = url_end;
        if angled {
            if chars.get(end) != Some(&'>') {
                return None;
            }
            end += 1;
        }
        (chars.get(end) == Some(&')')).then_some(Destination {
            url_start,
            url_end,
            end: end + 1,
        })
    }

    /// [`is_vault_link_url`] of `chars[from..end]`. That answer depends only
    /// on whether the URL ends in `.md` after at least one character and on
    /// the extension of its last segment. So the URL from the character before
    /// its last `.` gives the same answer, and that tail is shared by every
    /// URL ending at `end`.
    fn is_vault_link(&mut self, from: usize, end: usize) -> bool {
        let chars = &self.chars;
        let Some(mark) = self.mark[end].filter(|&mark| mark >= from && chars[mark] == '.') else {
            return false;
        };
        let tail_start = from.max(mark.saturating_sub(1));
        *self.answers.entry((tail_start, end)).or_insert_with(|| {
            is_vault_link_url(&chars[tail_start..end].iter().collect::<String>())
        })
    }
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
