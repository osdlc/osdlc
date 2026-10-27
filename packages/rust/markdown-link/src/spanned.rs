//! The body link scanner: every link in a body, with its byte span.
//!
//! [`crate::body_links`] is this scanner with the spans dropped. The rules for
//! a markdown link are delegated ([`crate::is_vault_link_url`],
//! [`crate::md_link_target`]) rather than restated: two spellings of "is this
//! a link" is how two scanners start disagreeing about what the vault
//! contains.

use crate::{is_vault_link_url, md_link_target, parse_inner, strip_code};

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
    /// percent-decoded and minus a trailing `.md`.
    pub target: String,
    /// A wikilink's or embed's `|alias`: the text after the first `|` outside
    /// code, read from the body so code inside it is kept. `None` when there
    /// is none or it is empty, and for a markdown link.
    pub alias: Option<String>,
    /// Byte offset within the **body** where the whole link syntax starts. An
    /// embed's leading `!` is inside it.
    pub byte_start: usize,
    /// Byte offset within the **body** just past the end of the link syntax.
    pub byte_end: usize,
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
/// [`strip_code`] preserves the **character** count of its input, not the byte
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
    let stripped = strip_code(body);
    let chars: Vec<char> = stripped.chars().collect();
    // char index -> byte offset, in the ORIGINAL body, plus an end sentinel so
    // an exclusive range that runs to the end of the body is representable.
    let mut at: Vec<usize> = body.char_indices().map(|(i, _)| i).collect();
    at.push(body.len());
    if chars.len() + 1 != at.len() {
        // `strip_code` must preserve the char count. If it ever does not,
        // reporting no links beats reporting spans that index the wrong bytes
        // and would splice mid-character.
        return Vec::new();
    }

    let mut out = Vec::new();
    let mut scan = UrlScan::default();
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i] == '[' && chars.get(i + 1) == Some(&'[') {
            let embed = i > 0 && chars[i - 1] == '!';
            let mut j = i + 2;
            let mut inner = String::new();
            let mut closed = false;
            while j + 1 < chars.len() {
                if chars[j] == ']' && chars[j + 1] == ']' {
                    closed = true;
                    break;
                }
                // `[[` never nests, and `[`/`]` inside would be a malformed
                // link — bail rather than swallow the rest of the note.
                if chars[j] == '[' || chars[j] == ']' {
                    break;
                }
                inner.push(chars[j]);
                j += 1;
            }
            if closed && !inner.is_empty() {
                if let Some(link) = parse_inner(&inner, embed) {
                    // Split at the pipe `parse_inner` used, found in the
                    // stripped chars so a `|` in code is not one, then read
                    // the alias from the body so code inside it is kept.
                    let alias = chars[i + 2..j]
                        .iter()
                        .position(|&c| c == '|')
                        .map(|p| body[at[i + 3 + p]..at[j]].trim())
                        .filter(|alias| !alias.is_empty())
                        .map(str::to_string);
                    out.push(BodyLink {
                        kind: if embed {
                            BodyLinkKind::Embed
                        } else {
                            BodyLinkKind::Wikilink
                        },
                        raw: inner,
                        target: link.target,
                        alias,
                        // An embed's `!` is part of the syntax a rename has to
                        // rewrite, so it is inside the span.
                        byte_start: at[if embed { i - 1 } else { i }],
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
            i = link.1;
            out.push(link.0);
            continue;
        }
        i += 1;
    }
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
            alias: None,
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
