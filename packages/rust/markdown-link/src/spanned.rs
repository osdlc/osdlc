//! The body link scanner: every link in a body, with its byte span.
//!
//! [`crate::body_links`] is this scanner with the spans dropped.
//! [`scan_body_with`] also reports each `[[` it gave up on, so a caller can
//! flag link syntax that was left in the text. The rules for
//! a markdown link are delegated ([`crate::is_vault_link_url`],
//! [`crate::md_link_target`]) rather than restated: two spellings of "is this
//! a link" is how two scanners start disagreeing about what the vault
//! contains.

use crate::code::{CodeRules, strip_code_with};
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
    /// Skip links inside HTML comments, `<!--` to `-->` or the end of the
    /// body. Off by default: a comment's links are found.
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
/// [`ScanOptions::skip_html_comments`] is on, is not reported, and nor is one
/// that a link found after it starts inside: `[[[Note]]` is a literal `[`
/// and a link. A run of `[` with no link after it, such as `[[[TODO`, is
/// one entry: from the first `[[`, with the reason and end of the last.
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
/// scheme. The span is what an editor decoration, a hover preview and a
/// rename's link rewrite need: which bytes to touch.
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
/// A comment is found after code is blanked, so a `<!--` inside code does not
/// open one.
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
    let code_blanked = strip_code_with(body, options.code_rules);
    let comments_blanked = options
        .skip_html_comments
        .then(|| blank_comments(&code_blanked));
    let chars: Vec<char> = comments_blanked
        .as_deref()
        .unwrap_or(&code_blanked)
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

    let mut out = Vec::new();
    let mut abandoned = Vec::new();
    let mut scan = UrlScan::default();
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
                    let code = match comments_blanked {
                        Some(_) => code_chars
                            .get_or_insert_with(|| code_blanked.chars().collect())
                            .as_slice(),
                        None => chars.as_slice(),
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
            && let Some(link) = spanned_markdown_link(&chars, i, &at, &mut scan)
        {
            drop_overlapped(&mut abandoned, at[i]);
            i = link.1;
            out.push(link.0);
            continue;
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

/// Drops each abandoned `[[` whose second `[` opens a link: `bracket` is the
/// byte offset of the link's first `[`, after any `!`. After a `[` or `]` the
/// scanner moves on one char, so `[[[Note]]` is a literal `[` and a link,
/// not a `[[` given up on. An embed's `!` right after an abandoned `[[`, as
/// in `[[x![[B]]`, does not count.
fn drop_overlapped(abandoned: &mut Vec<AbandonedLink>, bracket: usize) {
    while abandoned
        .last()
        .is_some_and(|a| a.byte_start + usize::from(a.embed) + 2 > bracket)
    {
        abandoned.pop();
    }
}

/// `text` with every HTML comment, `<!--` to `-->` or the end, blanked to
/// spaces, newlines kept. The character count does not change.
fn blank_comments(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find("<!--") {
        out.push_str(&rest[..open]);
        let after = &rest[open + 4..];
        let end = after.find("-->").map_or(rest.len(), |at| open + 4 + at + 3);
        out.extend(
            rest[open..end]
                .chars()
                .map(|c| if c == '\n' { '\n' } else { ' ' }),
        );
        rest = &rest[end..];
    }
    out.push_str(rest);
    out
}

/// `[text](relative/note.md)` starting at `start`, and the char index just
/// past it. `None` when this is not one.
///
/// The shape is the regex `\[[^\]]*\]\(<?([^)>\s]+?)>?\)`, walked by hand so
/// positions index the original body. [`is_vault_link_url`] decides "is this a
/// reference" and [`md_link_target`] "what does it point at". A URL containing
/// whitespace is not a link: `[c](<sp ace.md>)` matches nothing. The URL is
/// read in place and built only for a link, so a body of failed attempts
/// stays linear.
fn spanned_markdown_link(
    chars: &[char],
    start: usize,
    at: &[usize],
    scan: &mut UrlScan,
) -> Option<(BodyLink, usize)> {
    let mut j = start + 1;
    while j < chars.len() && chars[j] != ']' && chars[j] != '[' {
        j += 1;
    }
    if chars.get(j) != Some(&']') || chars.get(j + 1) != Some(&'(') {
        return None;
    }
    let angled = chars.get(j + 2) == Some(&'<');
    let url_start = if angled { j + 3 } else { j + 2 };
    let url_end = scan.url_end(chars, url_start);
    let mut end = url_end;
    if angled {
        if chars.get(end) != Some(&'>') {
            return None;
        }
        end += 1;
    }
    if chars.get(end) != Some(&')') {
        return None;
    }
    end += 1;
    if !scan.is_vault_link(chars, url_start, url_end) || has_scheme(&chars[url_start..url_end]) {
        // Not a link this dialect harvests. The caller advances ONE character
        // rather than skipping past the `[text](…)` it just walked, so a match
        // may start at an inner `[`: `[a[b](x.md)` is a link.
        return None;
    }
    let url: String = chars[url_start..url_end].iter().collect();
    Some((
        BodyLink {
            kind: BodyLinkKind::Markdown,
            target: md_link_target(&url),
            heading: None,
            block: None,
            alias: None,
            size: None,
            raw: url,
            byte_start: at[start],
            byte_end: at[end],
        },
        end,
    ))
}

/// What earlier markdown link attempts learned about the URLs they read. Each
/// attempt starts later than the one before, so remembering the last answer
/// of each kind keeps a body of failed attempts linear.
#[derive(Debug, Default)]
struct UrlScan {
    /// `(from, stop)`: the first `)`, `>` or whitespace at or after `from` is
    /// at `stop`.
    stop: Option<(usize, usize)>,
    tail: Option<UrlTail>,
}

/// URLs ending at `end`: the last `.` or `/` at or after `from`, and
/// [`is_vault_link_url`] of each tail asked so far, by its start.
#[derive(Debug)]
struct UrlTail {
    end: usize,
    from: usize,
    mark: Option<usize>,
    answers: Vec<(usize, bool)>,
}

impl UrlScan {
    /// Where a URL starting at `from` ends: the first `)`, `>` or whitespace.
    fn url_end(&mut self, chars: &[char], from: usize) -> usize {
        if let Some((start, stop)) = self.stop
            && (start..=stop).contains(&from)
        {
            return stop;
        }
        let mut k = from;
        while k < chars.len() && !matches!(chars[k], ')' | '>') && !chars[k].is_whitespace() {
            k += 1;
        }
        self.stop = Some((from, k));
        k
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

    /// A quadratic URL scan takes tens of seconds on the largest of these in a
    /// debug build; a linear one takes well under a second, even on a loaded
    /// machine. The bound is that wide on purpose: it catches the shape of the
    /// cost, not a slowdown.
    #[test]
    fn the_url_scan_is_linear_in_failed_link_attempts() {
        for n in [25_000, 50_000, 100_000] {
            for body in [
                "[](a".repeat(n),
                format!("{})", "[](a".repeat(n)),
                format!("{}.md)", "[](a:".repeat(n)),
                format!("{}.x)", "[](a/".repeat(n)),
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
