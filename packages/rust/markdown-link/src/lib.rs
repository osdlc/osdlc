//! Parsing and resolution of Markdown and wiki-style links.
//!
//! Finds `[[wikilinks]]`, `![[embeds]]` and relative markdown links in a note
//! body or its frontmatter, and resolves a link target to a file path with
//! [`LinkIndex`], using a path-suffix index.
//!
//! ```
//! use markdown_link::{LinkIndex, body_links};
//!
//! let links = body_links("See [[Target#Heading|alias]].");
//! assert_eq!(links[0].target, "Target");
//!
//! let index = LinkIndex::build(&["notes/Target.md".to_string()]);
//! assert_eq!(index.resolve("Target"), Some("notes/Target.md"));
//! ```
//!
//! Two details that look arbitrary and are not:
//!
//! - **Code is stripped before matching.** A fenced block full of
//!   `[[example]]` would otherwise manufacture links that do not exist, and
//!   the link graph would grow edges nobody wrote.
//! - **A pathed miss falls back to its basename.** Notes often write typed
//!   links like `[[muscle-groups/glutes]]` whose prefix is a *collection
//!   alias*, not a real folder. Dropping the prefix on a miss is what makes
//!   those resolve; without it the graph is full of ghost nodes for links
//!   that a human would call obviously correct.

#![forbid(unsafe_code)]
#![warn(missing_docs)]

use std::collections::HashMap;
use std::ops::Range;

pub mod code;
mod href;
mod spanned;
pub use code::strip_code;
pub use href::{encode_uri_component, encode_uri_fragment, escape_label, relative_link};
pub use spanned::*;

/// What kind of reference produced a [`RawLink`].
///
/// [`BodyLinkKind`] is the span-carrying scanner's parallel enum: no
/// `Frontmatter`, and a `Markdown` variant this one folds into `Wikilink`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkKind {
    /// A `[[target]]` link, or a relative markdown link.
    Wikilink,
    /// A `![[target]]` embed.
    Embed,
    /// Found inside a frontmatter value rather than the body.
    Frontmatter,
}

/// One reference found in a note, before it is resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawLink {
    /// What resolution runs against. A wikilink's text minus `#heading`,
    /// `|alias` and the `\` escaping the pipe; a markdown link's URL
    /// percent-decoded and minus a trailing `.md`.
    pub target: String,
    /// Which syntax produced the reference.
    pub kind: LinkKind,
    /// The frontmatter key a `Frontmatter` link came from.
    pub field: Option<String>,
}

/// A parsed `[[target#heading|alias]]`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WikiLink {
    /// The link target, trimmed, minus any `#heading`, `#^block` and `|alias`.
    pub target: String,
    /// The text after the first `#` in the target part, trimmed, unless it
    /// starts with `^`, which makes it a [`WikiLink::block`]. A heading path
    /// such as `Parent#Child` keeps its inner `#`.
    pub heading: Option<String>,
    /// A block reference, `Note#^id`: the text after `#^`, trimmed.
    pub block: Option<String>,
    /// The text after the first `|`, trimmed. An embed's size (`|300`) stays
    /// in it as written; [`WikiLink::size`] reads it.
    pub alias: Option<String>,
    /// An embed's `|300` or `|300x200`: the last `|` part of its alias, when
    /// that is a size. `None` for a link that is not an embed.
    pub size: Option<Size>,
    /// Whether the link was written as an embed, `![[...]]`.
    pub embed: bool,
}

/// An embed's display size, `|300` (width) or `|300x200` (width and height).
///
/// # Examples
///
/// ```
/// use markdown_link::Size;
///
/// assert_eq!(Size::parse("300"), Some(Size { width: 300, height: None }));
/// assert_eq!(Size::parse("300x200"), Some(Size { width: 300, height: Some(200) }));
/// assert_eq!(Size::parse("wide"), None);
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Size {
    /// The width in pixels.
    pub width: u32,
    /// The height in pixels, when given.
    pub height: Option<u32>,
}

impl Size {
    /// Read `300` or `300x200`. `None` for anything else, and for a number too
    /// large for a `u32`.
    pub fn parse(spec: &str) -> Option<Size> {
        if !is_size_spec(spec) {
            return None;
        }
        match spec.split_once('x') {
            Some((w, h)) => Some(Size {
                width: w.parse().ok()?,
                height: Some(h.parse().ok()?),
            }),
            None => Some(Size {
                width: spec.parse().ok()?,
                height: None,
            }),
        }
    }
}

/// Whether `spec` is an image size, `^\d+(x\d+)?$`: `300` or `300x200`.
///
/// A link that shows an alias needs this to tell a size from a label.
///
/// # Examples
///
/// ```
/// use markdown_link::is_size_spec;
///
/// assert!(is_size_spec("300"));
/// assert!(is_size_spec("640x480"));
/// assert!(!is_size_spec("x480"));
/// assert!(!is_size_spec("300px"));
/// ```
pub fn is_size_spec(spec: &str) -> bool {
    let digits = |p: &str| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit());
    match spec.split_once('x') {
        Some((w, h)) => digits(w) && digits(h),
        None => digits(spec),
    }
}

/// The size an embed's alias ends in, if any: the trimmed text after its last
/// `|`, or the whole alias.
fn alias_size(alias: Option<&str>, embed: bool) -> Option<Size> {
    if !embed {
        return None;
    }
    let alias = alias?;
    let last = alias.rsplit_once('|').map_or(alias, |(_, last)| last);
    Size::parse(last.trim())
}

/// A wikilink fragment, the text after the first `#`, as a heading or a block.
fn split_fragment(fragment: &str) -> (Option<String>, Option<String>) {
    let fragment = fragment.trim();
    match fragment.strip_prefix('^') {
        Some(block) => (None, Some(block.trim().to_string())),
        None => (Some(fragment.to_string()), None),
    }
}

/// Parse a single wikilink body (the text between the brackets).
///
/// A `\` right before the first `|` is the escape a GFM table cell needs
/// (`[[Note\|alias]]`) and is dropped from the target or heading.
///
/// # Examples
///
/// ```
/// use markdown_link::{WikiLink, parse_inner};
///
/// let link = parse_inner("Note#Intro|Read me", false).unwrap();
/// assert_eq!(
///     link,
///     WikiLink {
///         target: "Note".into(),
///         heading: Some("Intro".into()),
///         block: None,
///         alias: Some("Read me".into()),
///         size: None,
///         embed: false,
///     }
/// );
///
/// // A `#^id` fragment is a block, not a heading.
/// let block = parse_inner("Note#^abc", false).unwrap();
/// assert_eq!((block.heading, block.block.as_deref()), (None, Some("abc")));
/// // An embed's trailing `|300` is its size; the alias keeps it as written.
/// let image = parse_inner("img.png|300", true).unwrap();
/// assert_eq!(image.size.map(|s| s.width), Some(300));
/// // The `\` that escapes the pipe in a table cell is dropped.
/// assert_eq!(parse_inner("Note\\|alias", false).unwrap().target, "Note");
/// // A link with no target is not a link.
/// assert!(parse_inner("  #only-heading", false).is_none());
/// ```
pub fn parse_inner(inner: &str, embed: bool) -> Option<WikiLink> {
    let target = target_range(inner)?;
    Some(parse_parts(inner, inner[target].to_string(), embed))
}

/// [`parse_inner`], except that a link with no target and a `#` fragment,
/// such as `#Heading` or `#^block`, is a link to the note it is written in:
/// its target is empty. This is how Obsidian reads `[[#Heading]]`.
///
/// # Examples
///
/// ```
/// use markdown_link::parse_inner_self;
///
/// let link = parse_inner_self("#Intro", false).unwrap();
/// assert_eq!((link.target.as_str(), link.heading.as_deref()), ("", Some("Intro")));
/// assert!(parse_inner_self("|alias only", false).is_none());
/// assert_eq!(parse_inner_self("Note", false).unwrap().target, "Note");
/// ```
pub fn parse_inner_self(inner: &str, embed: bool) -> Option<WikiLink> {
    if let Some(link) = parse_inner(inner, embed) {
        return Some(link);
    }
    let (before_alias, _) = split_alias(inner);
    if !before_alias.trim_start().starts_with('#') {
        return None;
    }
    Some(parse_parts(inner, String::new(), embed))
}

/// The fragment, alias and size of `inner`, around an already-found target.
fn parse_parts(inner: &str, target: String, embed: bool) -> WikiLink {
    let (before_alias, alias) = split_alias(inner);
    let (heading, block) = match before_alias.split_once('#') {
        Some((_, fragment)) => split_fragment(fragment),
        None => (None, None),
    };
    let alias = alias.map(|a| a.trim().to_string());
    WikiLink {
        target,
        heading,
        block,
        size: alias_size(alias.as_deref(), embed),
        alias,
        embed,
    }
}

/// Byte range of [`parse_inner`]'s target within `inner`, for a caller that
/// rewrites the target in place and must leave the rest of the link as written.
///
/// # Examples
///
/// ```
/// use markdown_link::target_range;
///
/// let inner = "  Note #h|alias";
/// let range = target_range(inner).unwrap();
/// assert_eq!(&inner[range], "Note");
/// assert_eq!(target_range("#h"), None);
/// ```
pub fn target_range(inner: &str) -> Option<Range<usize>> {
    let (before_alias, _) = split_alias(inner);
    let raw = before_alias
        .split_once('#')
        .map_or(before_alias, |(t, _)| t);
    let target = raw.trim();
    if target.is_empty() {
        return None;
    }
    let lead = raw.len() - raw.trim_start().len();
    Some(lead..lead + target.len())
}

/// A wikilink body split at its first `|`: the text before it, minus the
/// `\` that escapes the pipe in a table cell, and the text after it, or
/// `None` when there is no `|`. Neither part is trimmed.
///
/// The first part is the destination as written, `#heading` included, which
/// a caller that quotes the link back needs. [`parse_inner`] reads both parts
/// from this split.
///
/// # Examples
///
/// ```
/// use markdown_link::split_alias;
///
/// assert_eq!(split_alias("Note#h\\|Alias"), ("Note#h", Some("Alias")));
/// assert_eq!(split_alias(" Note "), (" Note ", None));
/// assert_eq!(split_alias("a|b|c"), ("a", Some("b|c")));
/// ```
pub fn split_alias(inner: &str) -> (&str, Option<&str>) {
    match inner.split_once('|') {
        Some((t, a)) => (t.strip_suffix('\\').unwrap_or(t), Some(a)),
        None => (inner, None),
    }
}

/// Every reference in one piece of markdown, in the order it appears, with
/// any `#heading` and `|alias` stripped.
///
/// Built on [`body_links`] rather than a bracket scan of its own: it blanks
/// code first, so a link shown in an example is not harvested, it reads embeds
/// and relative markdown links too, and it drops a malformed `[[` instead of
/// swallowing the rest of the note.
///
/// Callers that only need the targets, such as a build script or a link
/// checker, share one scanner with [`body_links`], so they cannot disagree
/// about what a note links to.
///
/// # Examples
///
/// ```
/// use markdown_link::wikilink_targets;
///
/// let body = "See [[A#h|alias]], ![[img.png]] and [b](c.md). `[[in code]]` is skipped.";
/// assert_eq!(wikilink_targets(body), ["A", "img.png", "c"]);
/// ```
pub fn wikilink_targets(body: &str) -> Vec<String> {
    body_links(body)
        .into_iter()
        .map(|link| link.target)
        .collect()
}

/// Every wikilink, embed and relative markdown link in a note body, in the
/// order they appear.
///
/// [`body_links_spanned`] without the spans: one scanner finds links, so the
/// two cannot disagree. A markdown link is reported as [`LinkKind::Wikilink`].
///
/// # Examples
///
/// ```
/// use markdown_link::{LinkKind, body_links};
///
/// let links = body_links("[[A]] ![[b.png]] [c](d.md)");
/// assert_eq!(links.len(), 3);
/// assert_eq!((links[0].target.as_str(), links[0].kind), ("A", LinkKind::Wikilink));
/// assert_eq!((links[1].target.as_str(), links[1].kind), ("b.png", LinkKind::Embed));
/// assert_eq!((links[2].target.as_str(), links[2].kind), ("d", LinkKind::Wikilink));
/// assert_eq!(links[0].field, None);
/// ```
pub fn body_links(body: &str) -> Vec<RawLink> {
    body_links_spanned(body)
        .into_iter()
        .map(|link| RawLink {
            target: link.target,
            kind: match link.kind {
                BodyLinkKind::Embed => LinkKind::Embed,
                BodyLinkKind::Wikilink | BodyLinkKind::Markdown => LinkKind::Wikilink,
            },
            field: None,
        })
        .collect()
}

/// Every non-markdown extension that counts as a vault ATTACHMENT (lowercase,
/// no leading dot).
///
/// This answers "is this file an attachment", not "can it be displayed" —
/// `tiff` and `heic` belong here and in a search index, but no browser
/// reliably paints them. Treating any relative markdown link as a
/// reference would be broader still, but a target no tool can do anything with
/// earns no place in the link graph, and the allowlist is what keeps
/// `[see](README)` from becoming an edge.
///
/// Matched case-insensitively, unlike the `.md` rule below.
///
/// # Examples
///
/// ```
/// use markdown_link::ATTACHMENT_EXTENSIONS;
///
/// assert!(ATTACHMENT_EXTENSIONS.contains(&"png"));
/// assert!(ATTACHMENT_EXTENSIONS.contains(&"pdf"));
/// assert!(!ATTACHMENT_EXTENSIONS.contains(&"md"));
/// ```
// Must match the TypeScript list. packages/ts/markdown-link/tests/attachment-extensions.test.ts
// fails if this differs from it. Update both together.
pub const ATTACHMENT_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp", "ico", "tiff", "heic", "mp4",
    "webm", "ogv", "mov", "mkv", "mp3", "wav", "m4a", "3gp", "flac", "ogg", "oga", "opus", "pdf",
    "base", "canvas",
];

/// Whether a markdown link's URL is one this dialect harvests: a note, or a
/// vault attachment.
///
/// The `.md` half carries two quirks: the extension is **case-sensitive**
/// (`[a](x.MD)` is not a link here, however much it looks like one) and at
/// least one character must precede it (`[a](.md)` is not either). Widening
/// that is a separate decision from adding attachments, and it is not taken
/// here.
///
/// Public for the same reason [`strip_md_ext`] is: a second spelling of "is
/// this a vault reference" is how two scanners start disagreeing about what
/// the vault contains.
///
/// # Examples
///
/// ```
/// use markdown_link::is_vault_link_url;
///
/// assert!(is_vault_link_url("notes/a.md"));
/// assert!(is_vault_link_url("img/photo.PNG"));
/// assert!(!is_vault_link_url("a.MD")); // `.md` is case-sensitive
/// assert!(!is_vault_link_url(".md")); // needs a stem
/// assert!(!is_vault_link_url("README")); // no extension
/// ```
pub fn is_vault_link_url(url: &str) -> bool {
    if url.len() > 3 && url.ends_with(".md") {
        return true;
    }
    let last = url.rsplit('/').next().unwrap_or(url);
    match last.rfind('.') {
        // A leading dot is a hidden file, not an extension, and a trailing dot
        // is no extension at all.
        Some(0) | None => false,
        Some(at) => {
            let ext = last[at + 1..].to_lowercase();
            ATTACHMENT_EXTENSIONS.contains(&ext.as_str())
        }
    }
}

/// The resolution target of a markdown link's URL: percent-decoded, minus its
/// trailing `.md`.
///
/// Public alongside [`is_vault_link_url`], and pinned rather than tidied. The
/// `trim_end_matches` pair strips **repeatedly**, so `a.md.md` targets `a`
/// rather than `a.md`. That is the long-standing behaviour, so indexes built
/// with it stay valid. [`strip_md_ext`] is the single-strip, case-insensitive
/// fallback for the mixed-case spellings the pair does not catch.
///
/// # Examples
///
/// ```
/// use markdown_link::md_link_target;
///
/// assert_eq!(md_link_target("My%20Note.md"), "My Note");
/// assert_eq!(md_link_target("a.md.md"), "a");
/// assert_eq!(md_link_target("a.Md"), "a");
/// assert_eq!(md_link_target("img.png"), "img.png");
/// ```
pub fn md_link_target(url: &str) -> String {
    let decoded = percent_decode(url);
    let trimmed = decoded.trim_end_matches(".md").trim_end_matches(".MD");
    if trimmed.len() == decoded.len() {
        strip_md_ext(&decoded)
    } else {
        trimmed.to_string()
    }
}

/// Drop a trailing `.md`, case-insensitively.
///
/// Byte-length arithmetic on a `&str` needs a char-boundary check first: note
/// names can hold Cyrillic or CJK text, and `&s[s.len() - 3..]` panics
/// rather than mismatching when the last three bytes land mid-character.
///
/// Public because a caller that parses links itself has to normalise a markdown
/// link's URL the same way [`body_links`] does, and a second copy of this is
/// exactly how two scanners start disagreeing about what a target is.
///
/// # Examples
///
/// ```
/// use markdown_link::strip_md_ext;
///
/// assert_eq!(strip_md_ext("Note.MD"), "Note");
/// assert_eq!(strip_md_ext("Note"), "Note");
/// assert_eq!(strip_md_ext("a.md.md"), "a.md"); // one strip only
/// assert_eq!(strip_md_ext("заметка"), "заметка"); // multi-byte, no panic
/// ```
pub fn strip_md_ext(s: &str) -> String {
    if s.len() >= 3
        && s.is_char_boundary(s.len() - 3)
        && s[s.len() - 3..].eq_ignore_ascii_case(".md")
    {
        s[..s.len() - 3].to_string()
    } else {
        s.to_string()
    }
}

/// Wikilinks hiding in frontmatter values, tagged with their top-level key.
///
/// # Examples
///
/// ```
/// use markdown_link::{LinkKind, frontmatter_links};
///
/// let fm = yaml_splice::parse::parse_mapping("rel: '[[Other]]'\nlist:\n  - '[[Two]]'\n").unwrap();
/// let links = frontmatter_links(&fm);
/// assert_eq!(links.len(), 2);
/// assert_eq!(links[0].target, "Other");
/// assert_eq!(links[0].kind, LinkKind::Frontmatter);
/// assert_eq!(links[0].field.as_deref(), Some("rel"));
/// assert_eq!(links[1].field.as_deref(), Some("list"));
/// ```
pub fn frontmatter_links(fm: &yaml_splice::value::Mapping) -> Vec<RawLink> {
    use yaml_splice::value::Value;
    fn visit(v: &Value, field: &str, out: &mut Vec<RawLink>) {
        match v {
            Value::Str(s) => {
                for l in body_links(s) {
                    if matches!(l.kind, LinkKind::Wikilink | LinkKind::Embed) {
                        out.push(RawLink {
                            target: l.target,
                            kind: LinkKind::Frontmatter,
                            field: Some(field.to_string()),
                        });
                    }
                }
            }
            Value::Seq(items) => items.iter().for_each(|i| visit(i, field, out)),
            Value::Map(m) => m.iter().for_each(|(_, i)| visit(i, field, out)),
            _ => {}
        }
    }
    let mut out = Vec::new();
    for (key, value) in fm.iter() {
        visit(value, key, &mut out);
    }
    out
}

/// Frontmatter string values that name a file by path (`cover: img/a.png`),
/// tagged with their top-level key. A value counts when its last segment has
/// an extension; a URL, a wikilink or text with a line break does not.
/// Whether the path exists is the resolver's question.
///
/// # Examples
///
/// ```
/// use markdown_link::frontmatter_paths;
///
/// let fm = yaml_splice::parse::parse_mapping(
///     "cover: img/a.png\nsite: https://x.org/a.png\nname: plain\n",
/// )
/// .unwrap();
/// let paths = frontmatter_paths(&fm);
/// assert_eq!(paths.len(), 1);
/// assert_eq!(paths[0].target, "img/a.png");
/// assert_eq!(paths[0].field.as_deref(), Some("cover"));
/// ```
pub fn frontmatter_paths(fm: &yaml_splice::value::Mapping) -> Vec<RawLink> {
    use yaml_splice::value::Value;
    fn visit(v: &Value, field: &str, out: &mut Vec<RawLink>) {
        match v {
            Value::Str(s) => {
                if let Some(path) = as_path(s) {
                    out.push(RawLink {
                        target: path.to_string(),
                        kind: LinkKind::Frontmatter,
                        field: Some(field.to_string()),
                    });
                }
            }
            Value::Seq(items) => items.iter().for_each(|i| visit(i, field, out)),
            Value::Map(m) => m.iter().for_each(|(_, i)| visit(i, field, out)),
            _ => {}
        }
    }
    let mut out = Vec::new();
    for (key, value) in fm.iter() {
        visit(value, key, &mut out);
    }
    out
}

/// `s` trimmed, when it reads as a file path: see [`frontmatter_paths`].
fn as_path(s: &str) -> Option<&str> {
    let s = s.trim();
    if s.is_empty() || s.contains("[[") || s.contains("://") || s.contains('\n') {
        return None;
    }
    has_file_extension(s).then_some(s)
}

/// Whether the last `/` segment of `s` ends in `.ext`: one to eight ASCII
/// letters or digits, at least one a letter, after a non-empty stem.
fn has_file_extension(s: &str) -> bool {
    let name = s.rsplit('/').next().unwrap_or(s);
    let Some((stem, ext)) = name.rsplit_once('.') else {
        return false;
    };
    !stem.is_empty()
        && (1..=8).contains(&ext.len())
        && ext.bytes().all(|b| b.is_ascii_alphanumeric())
        && ext.bytes().any(|b| b.is_ascii_alphabetic())
}

/// A cheap test of raw frontmatter text: whether any token on any line could
/// be a path [`frontmatter_paths`] keeps. False means it would find none, so
/// a caller can skip the YAML parse. It errs toward true: a false positive
/// costs a parse, a false negative a missed link.
///
/// # Examples
///
/// ```
/// use markdown_link::may_hold_frontmatter_paths;
///
/// assert!(may_hold_frontmatter_paths("cover: img/a.png"));
/// assert!(!may_hold_frontmatter_paths("title: Hello world"));
/// ```
pub fn may_hold_frontmatter_paths(yaml: &str) -> bool {
    yaml.split([
        '\n', '\r', ' ', '\t', ':', '[', ']', '{', '}', ',', '"', '\'', '#',
    ])
    .any(has_file_extension)
}

/// Replace each wikilink and embed with what a reader sees for it, for
/// snippets and search: its alias, or else its target. An embed's trailing
/// `|300` or `|300x200` is a size, not an alias, so
/// `![[img.png|300]]` shows `img.png`. An empty alias shows the target. A
/// link into the same note, such as `[[#Setup]]`, shows its alias, or else
/// its heading or `^block`; a link with none of these, such as `[[]]`, shows
/// nothing. Code is not skipped.
///
/// # Examples
///
/// ```
/// use markdown_link::display_text;
///
/// assert_eq!(display_text("See [[Note#h|the note]]."), "See the note.");
/// assert_eq!(display_text("[[Note]] and ![[img.png|300]]"), "Note and img.png");
/// assert_eq!(display_text("[[Note|]]"), "Note"); // empty alias shows the target
/// assert_eq!(display_text("Jump to [[#Setup]]."), "Jump to Setup.");
/// ```
pub fn display_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i] == '!'
            && chars.get(i + 1) == Some(&'[')
            && chars.get(i + 2) == Some(&'[')
            && let Some((inner, next)) = take_link(&chars, i + 1)
        {
            if let Some(l) = parse_inner_self(&inner, true) {
                out.push_str(&shown(&l));
            }
            i = next;
            continue;
        }
        if chars[i] == '['
            && chars.get(i + 1) == Some(&'[')
            && let Some((inner, next)) = take_link(&chars, i)
        {
            if let Some(l) = parse_inner_self(&inner, false) {
                out.push_str(&shown(&l));
            }
            i = next;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// What a reader sees for one link. See [`display_text`].
fn shown(link: &WikiLink) -> std::borrow::Cow<'_, str> {
    let alias = link.alias.as_deref().map(|alias| {
        if !link.embed {
            return alias;
        }
        let (rest, last) = alias.rsplit_once('|').unwrap_or(("", alias));
        if is_size_spec(last.trim()) {
            rest.trim()
        } else {
            alias
        }
    });
    if let Some(alias) = alias.filter(|a| !a.is_empty()) {
        return alias.into();
    }
    if !link.target.is_empty() {
        return link.target.as_str().into();
    }
    // A link into the same note: its heading, or else its block.
    match (&link.heading, &link.block) {
        (Some(heading), _) => heading.as_str().into(),
        (None, Some(block)) => format!("^{block}").into(),
        (None, None) => "".into(),
    }
}

/// A typed reference, `[[type/slug]]` or `[[type/slug|Alias]]`: a
/// frontmatter value naming one note of a known type, such as
/// `location: "[[location/home]]"`.
///
/// # Examples
///
/// ```
/// use markdown_link::parse_typed_ref;
///
/// let typed = parse_typed_ref("[[location/home|Home]]").unwrap();
/// assert_eq!(typed.kind, "location");
/// assert_eq!(typed.slug, "home");
/// assert_eq!(typed.alias.as_deref(), Some("Home"));
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TypedRef {
    /// The text before the first `/`, such as `location`.
    pub kind: String,
    /// The rest of the target, such as `home` or `2026/spring`.
    pub slug: String,
    /// The text after the first `|`, as written.
    pub alias: Option<String>,
}

/// Parse a whole value as a typed reference, or `None`.
///
/// Shape only: the target is not resolved. The value is exactly `[[...]]`
/// with no `[`, `]` or line break inside. The target ends at the first `|`,
/// minus a `\` that escapes it, as in [`parse_inner`]. Its type and each
/// `/`-separated slug segment are non-empty and hold no whitespace.
///
/// # Examples
///
/// ```
/// use markdown_link::parse_typed_ref;
///
/// assert_eq!(parse_typed_ref("[[a/b/c]]").unwrap().slug, "b/c");
/// assert!(parse_typed_ref("[[no-slash]]").is_none());
/// assert!(parse_typed_ref("[[a/b]] trailing").is_none());
/// assert!(parse_typed_ref("[[a/has space]]").is_none());
/// ```
pub fn parse_typed_ref(value: &str) -> Option<TypedRef> {
    let inner = value.strip_prefix("[[")?.strip_suffix("]]")?;
    if inner.contains(['[', ']', '\n', '\r']) {
        return None;
    }
    let (target, alias) = split_alias(inner);
    let (kind, slug) = target.split_once('/')?;
    let word = |s: &str| !s.is_empty() && !s.chars().any(char::is_whitespace);
    if !word(kind) || !slug.split('/').all(word) {
        return None;
    }
    Some(TypedRef {
        kind: kind.to_string(),
        slug: slug.to_string(),
        alias: alias.map(str::to_string),
    })
}

fn take_link(chars: &[char], start: usize) -> Option<(String, usize)> {
    let mut j = start + 2;
    let mut inner = String::new();
    while j + 1 < chars.len() {
        if chars[j] == ']' && chars[j + 1] == ']' {
            return Some((inner, j + 2));
        }
        if chars[j] == '[' || chars[j] == ']' {
            return None;
        }
        inner.push(chars[j]);
        j += 1;
    }
    None
}

/// Percent-decode a markdown link URL. Public for the same reason
/// [`strip_md_ext`] is.
///
/// # Examples
///
/// ```
/// use markdown_link::percent_decode;
///
/// assert_eq!(percent_decode("My%20Note"), "My Note");
/// assert_eq!(percent_decode("%zz"), "%zz"); // not hex, kept as written
/// assert_eq!(percent_decode("%+5"), "%+5"); // a sign is not a hex digit
/// assert_eq!(percent_decode("%FF"), "%FF"); // not UTF-8, kept as written
/// ```
pub fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        // Two ASCII hex digits, no more: `from_str_radix` alone would also
        // take a sign, so `%+5` would decode.
        if b[i] == b'%'
            && i + 2 < b.len()
            && b[i + 1].is_ascii_hexdigit()
            && b[i + 2].is_ascii_hexdigit()
        {
            let hex = std::str::from_utf8(&b[i + 1..i + 3]).expect("ASCII");
            out.push(u8::from_str_radix(hex, 16).expect("two hex digits"));
            i += 3;
            continue;
        }
        out.push(b[i]);
        i += 1;
    }
    // Undecodable bytes keep the raw form rather than becoming U+FFFD, which
    // would turn a resolvable link into a permanent ghost node.
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

/// Why [`LinkIndex::resolve_strict`] did not resolve a target.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolveError {
    /// No file answers to the target.
    NotFound,
    /// Several files answer to it and the link names none of them outright.
    /// Every candidate, shortest first.
    Ambiguous(Vec<String>),
}

impl std::fmt::Display for ResolveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ResolveError::NotFound => f.write_str("no file matches the link"),
            ResolveError::Ambiguous(candidates) => {
                write!(
                    f,
                    "the link matches several files: {}",
                    candidates.join(", ")
                )
            }
        }
    }
}

impl std::error::Error for ResolveError {}

/// A suffix index: every file is reachable by any suffix of its path.
///
/// # Examples
///
/// ```
/// use markdown_link::LinkIndex;
///
/// let index = LinkIndex::build(&["notes/a.md".to_string(), "deep/er/b.md".to_string()]);
/// assert_eq!(index.resolve("a"), Some("notes/a.md"));
/// assert_eq!(index.resolve("er/b"), Some("deep/er/b.md"));
/// assert_eq!(index.resolve("missing"), None);
/// ```
#[derive(Debug, Clone, Default)]
pub struct LinkIndex {
    by_key: HashMap<String, String>,
    /// Candidate lists, kept ONLY for the keys more than one file answers to.
    ///
    /// Nearly every key has exactly one candidate, and paying a `Vec` for every
    /// suffix of every path in a large vault is not free. `by_key` holds the
    /// source-independent winner, which is all [`LinkIndex::resolve`] needs;
    /// this holds the whole field, and only a resolution that knows where the
    /// link was written ever looks at it.
    ///
    /// Shortest-first, like the build order that fills it.
    ambiguous: HashMap<String, Vec<String>>,
    /// How many times a path claimed a key that a different path already
    /// held while the index was built.
    pub collisions: usize,
}

/// Pick the winner from a shortest-first candidate field, as written in `from`.
///
/// **The one place the ambiguity rule lives.** [`LinkIndex`] keeps a single
/// winner per key and reaches for this only when a name is contested. A tool
/// that keeps whole candidate fields of its own, such as a rename planner that
/// must answer "is this bare name still unambiguous after the move", can call
/// it too. Two shapes of storage, and exactly one rule deciding which file a
/// contested name means — because a reader seeing one file while a rename
/// rewrites another is the failure that costs.
///
/// `field` must be ordered shortest-first, which is what makes the first
/// in-folder hit also the shortest one and lets both rules fall out of a single
/// pass.
///
/// # Examples
///
/// ```
/// use markdown_link::prefer_in_folder;
///
/// let field = vec!["b/a.md".to_string(), "notes/a.md".to_string()];
/// // Written in `notes/`: the candidate in the same folder wins.
/// assert_eq!(prefer_in_folder(&field, "notes/x.md"), Some("notes/a.md"));
/// // Written at the root: the shortest path wins.
/// assert_eq!(prefer_in_folder(&field, "x.md"), Some("b/a.md"));
/// assert_eq!(prefer_in_folder(&[], "x.md"), None);
/// // `notes/` does not match the sibling folder `notes2/`.
/// let field = vec!["notes2/a.md".to_string(), "z/notes/a.md".to_string()];
/// assert_eq!(prefer_in_folder(&field, "notes/x.md"), Some("notes2/a.md"));
/// ```
pub fn prefer_in_folder<'a>(field: &'a [String], from: &str) -> Option<&'a str> {
    let first = field.first()?;
    if field.len() == 1 {
        return Some(first);
    }
    let folder = source_folder(from);
    // Match whole folder names: `notes/` must not match `notes2/`.
    let prefix = format!("{folder}/");
    if !folder.is_empty()
        && let Some(hit) = field.iter().find(|p| p.to_lowercase().starts_with(&prefix))
    {
        return Some(hit);
    }
    Some(first)
}

/// `target` joined onto `from`'s folder when it starts with `./` or `../`,
/// with the dot segments collapsed. `None` for any other target, and for one
/// that climbs above the vault root.
///
/// Public so a caller such as a rename planner can resolve relative links
/// exactly as [`LinkIndex::resolve_from`] does.
///
/// # Examples
///
/// ```
/// use markdown_link::join_relative;
///
/// assert_eq!(join_relative("../x", "a/b/c.md").as_deref(), Some("a/x"));
/// assert_eq!(join_relative("./y", "a/b.md").as_deref(), Some("a/y"));
/// assert_eq!(join_relative("plain", "a/b.md"), None); // not relative
/// assert_eq!(join_relative("../../x", "a/b.md"), None); // above the root
/// ```
pub fn join_relative(target: &str, from: &str) -> Option<String> {
    let t = target.trim().replace('\\', "/");
    if !(t.starts_with("./") || t.starts_with("../")) {
        return None;
    }
    let from = from.trim().replace('\\', "/");
    let mut segs: Vec<&str> = match from.rfind('/') {
        Some(at) => from[..at].split('/').filter(|s| !s.is_empty()).collect(),
        None => Vec::new(),
    };
    for seg in t.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                segs.pop()?;
            }
            _ => segs.push(seg),
        }
    }
    Some(segs.join("/"))
}

/// The folder a vault-relative path sits in, lowercased, or `""` at the root.
fn source_folder(from: &str) -> String {
    let normalized = from.trim().replace('\\', "/");
    match normalized.rfind('/') {
        Some(at) => normalized[..at].to_lowercase(),
        None => String::new(),
    }
}

/// Normalise a link target to an index key.
///
/// This is the crate's **only** place a `.md` extension is stripped, running
/// on both path suffixes at build time and queries at resolve time. Stripping
/// elsewhere strips a second `.md` extension, doubling it.
///
/// # Examples
///
/// ```
/// use markdown_link::normalize_target;
///
/// assert_eq!(normalize_target("./Notes//A%20B.MD"), "notes/a b");
/// assert_eq!(normalize_target("  dir\\file  "), "dir/file");
/// ```
pub fn normalize_target(raw: &str) -> String {
    let mut t = raw.trim().replace('\\', "/");
    while let Some(rest) = t.strip_prefix("./") {
        t = rest.to_string();
    }
    while t.contains("//") {
        t = t.replace("//", "/");
    }
    t = percent_decode(&t);
    strip_md_ext(&t).to_lowercase()
}

impl LinkIndex {
    /// Build from vault-relative paths (with extensions).
    ///
    /// Shortest path first, measured in CHARACTERS (not depth), then deterministic
    /// collation. Character length is the observed tie-break:
    /// `x/y/tie.md` (10 chars, 3 segments) beats `length-versus-depth-long-folder/tie.md`
    /// (38 chars, 2 segments).
    ///
    /// # Examples
    ///
    /// ```
    /// use markdown_link::LinkIndex;
    ///
    /// let index = LinkIndex::build(&["x/y/tie.md".to_string(), "long-folder/tie.md".to_string()]);
    /// // The shorter path wins the bare name.
    /// assert_eq!(index.resolve("tie"), Some("x/y/tie.md"));
    /// assert_eq!(index.resolve("long-folder/tie"), Some("long-folder/tie.md"));
    /// assert!(index.collisions > 0);
    /// ```
    pub fn build(paths: &[String]) -> LinkIndex {
        let mut sorted: Vec<&String> = paths.iter().collect();
        sorted.sort_by(|a, b| {
            a.chars()
                .count()
                .cmp(&b.chars().count())
                .then_with(|| slug_collate::compare_paths(a, b))
        });

        let mut by_key: HashMap<String, String> = HashMap::new();
        let mut ambiguous: HashMap<String, Vec<String>> = HashMap::new();
        let mut collisions = 0usize;
        for path in sorted {
            // Suffixes are taken from the path as written, extension included.
            // `normalize_target` is what drops a trailing `.md`, and it does so
            // on the query too, so stripping here as well would take a second
            // one off `note.md.md`. It would also have to slice bytes off a
            // `&str` — the char-boundary hazard `strip_md_ext` guards against.
            for suffix in suffixes(path) {
                let key = normalize_target(&suffix);
                match by_key.get(&key).cloned() {
                    Some(existing) => {
                        if existing != *path {
                            collisions += 1;
                            // The winner leads the field, so index 0 is both the
                            // source-independent answer and the shortest.
                            let field = ambiguous.entry(key).or_insert_with(|| vec![existing]);
                            if !field.iter().any(|p| p == path) {
                                field.push(path.clone());
                            }
                        }
                    }
                    None => {
                        by_key.insert(key, path.clone());
                    }
                }
            }
        }
        LinkIndex {
            by_key,
            ambiguous,
            collisions,
        }
    }

    /// Resolve one target to a vault-relative path, or `None`.
    ///
    /// Source-independent, and therefore the same answer everywhere in the
    /// vault. Equivalent to [`LinkIndex::resolve_from`] called from the vault
    /// root, where the folder preference cannot apply.
    ///
    /// # Examples
    ///
    /// ```
    /// use markdown_link::LinkIndex;
    ///
    /// let index = LinkIndex::build(&["notes/glutes.md".to_string()]);
    /// assert_eq!(index.resolve("glutes"), Some("notes/glutes.md"));
    /// // A pathed miss falls back to its basename.
    /// assert_eq!(index.resolve("muscle-groups/glutes"), Some("notes/glutes.md"));
    /// assert_eq!(index.resolve("nothing"), None);
    /// ```
    pub fn resolve(&self, target: &str) -> Option<&str> {
        self.resolve_from(target, "")
    }

    /// Resolve one target as it was written in `from`, a vault-relative path.
    ///
    /// Differs from [`LinkIndex::resolve`] in two cases, the only ones where
    /// where the link sits can change the answer. A `./` or `../` target names
    /// the file at that path from the linking note's folder (see
    /// [`join_relative`]). An AMBIGUOUS name — several files answer to it —
    /// takes two observed behaviours, in order: a candidate inside the linking
    /// note's own folder beats one outside it, and otherwise the shorter full
    /// path wins.
    ///
    /// The folder test is a plain string prefix, not a segment-aligned one,
    /// which is what the application does: a note in `notes/` also prefers a
    /// candidate under `notes-archive/`. Small, real, and deliberately
    /// matched — a reader seeing one file while a rename rewrites a different
    /// one is worse than either rule alone.
    ///
    /// # Examples
    ///
    /// ```
    /// use markdown_link::LinkIndex;
    ///
    /// let index = LinkIndex::build(&["b/a.md".to_string(), "notes/a.md".to_string(), "notes/x.md".to_string()]);
    /// // Ambiguous name: the candidate in the linking note's folder wins.
    /// assert_eq!(index.resolve_from("a", "notes/x.md"), Some("notes/a.md"));
    /// assert_eq!(index.resolve_from("a", "other.md"), Some("b/a.md"));
    /// // A `./` target is relative to the linking note.
    /// assert_eq!(index.resolve_from("./a", "notes/x.md"), Some("notes/a.md"));
    /// ```
    pub fn resolve_from(&self, target: &str, from: &str) -> Option<&str> {
        // `./x` and `../x` name a file relative to the linking note's folder,
        // the way the resolver treats them. A miss, or a path that climbs out of the
        // vault, falls through to the vault-wide lookup below.
        if let Some(joined) = join_relative(target, from) {
            let key = normalize_target(&joined);
            if let Some(field) = self.field(&key) {
                // The field holds every path this key is a SUFFIX of; the
                // joined path names one exactly.
                if let Some(hit) = field.iter().find(|p| normalize_target(p) == key) {
                    return Some(hit);
                }
            }
        }
        let key = normalize_target(target);
        let field = match self.field(&key) {
            Some(field) => field,
            None => {
                // Pathed miss -> basename fallback. See the module docs.
                let slash = key.rfind('/')?;
                if slash == 0 {
                    return None;
                }
                self.field(&key[slash + 1..])?
            }
        };
        prefer_in_folder(field, from)
    }

    /// Every path `target`, written in `from`, could mean, shortest first:
    /// the field [`LinkIndex::resolve_from`] chooses from. Empty when nothing
    /// answers to it.
    ///
    /// A `./` or `../` target that names a file gives that one file. A pathed
    /// target that misses gives the field of its last segment, the same
    /// fallback `resolve_from` takes.
    ///
    /// # Examples
    ///
    /// ```
    /// use markdown_link::LinkIndex;
    ///
    /// let index = LinkIndex::build(&["b/a.md".to_string(), "notes/a.md".to_string()]);
    /// assert_eq!(index.candidates("a", "x.md"), ["b/a.md", "notes/a.md"]);
    /// assert_eq!(index.candidates("./a", "notes/x.md"), ["notes/a.md"]);
    /// assert!(index.candidates("nothing", "x.md").is_empty());
    /// ```
    pub fn candidates(&self, target: &str, from: &str) -> &[String] {
        if let Some(joined) = join_relative(target, from) {
            let key = normalize_target(&joined);
            if let Some(field) = self.field(&key)
                && let Some(hit) = field.iter().find(|p| normalize_target(p) == key)
            {
                return std::slice::from_ref(hit);
            }
        }
        let key = normalize_target(target);
        if let Some(field) = self.field(&key) {
            return field;
        }
        match key.rfind('/') {
            Some(slash) if slash > 0 => self.field(&key[slash + 1..]).unwrap_or(&[]),
            _ => &[],
        }
    }

    /// Resolve `target`, written in `from`, refusing to guess.
    ///
    /// Where [`LinkIndex::resolve_from`] picks among several candidates (same
    /// folder first, then the shortest path), this takes one only when the
    /// link names it outright:
    ///
    /// 1. a `./` or `../` target that names a file;
    /// 2. the only candidate;
    /// 3. the candidate whose whole vault-relative path is the target;
    /// 4. the candidate at the target's path from the linking note's folder.
    ///
    /// Anything else with more than one candidate is
    /// [`ResolveError::Ambiguous`], with every candidate, shortest first. An
    /// empty target (a link to the note it is written in) is
    /// [`ResolveError::NotFound`]; the caller knows which note that is.
    ///
    /// # Examples
    ///
    /// ```
    /// use markdown_link::{LinkIndex, ResolveError};
    ///
    /// let index = LinkIndex::build(&["b/a.md".to_string(), "notes/a.md".to_string()]);
    /// assert_eq!(
    ///     index.resolve_strict("a", "x.md"),
    ///     Err(ResolveError::Ambiguous(vec!["b/a.md".into(), "notes/a.md".into()]))
    /// );
    /// assert_eq!(index.resolve_strict("notes/a", "x.md"), Ok("notes/a.md"));
    /// // `a` from inside `notes/` is `notes/a.md` by its path from there.
    /// assert_eq!(index.resolve_strict("a", "notes/x.md"), Ok("notes/a.md"));
    /// assert_eq!(index.resolve_strict("zzz", "x.md"), Err(ResolveError::NotFound));
    /// ```
    pub fn resolve_strict(&self, target: &str, from: &str) -> Result<&str, ResolveError> {
        let field = self.candidates(target, from);
        match field {
            [] => return Err(ResolveError::NotFound),
            [only] => return Ok(only),
            _ => {}
        }
        let key = normalize_target(target);
        if let Some(hit) = field.iter().find(|p| normalize_target(p) == key) {
            return Ok(hit);
        }
        let folder = source_folder(from);
        if !folder.is_empty() {
            let joined = format!("{folder}/{key}");
            if let Some(hit) = field.iter().find(|p| normalize_target(p) == joined) {
                return Ok(hit);
            }
        }
        Err(ResolveError::Ambiguous(field.to_vec()))
    }

    /// Every path a key answers to, shortest first.
    ///
    /// One borrowed entry for the overwhelmingly common unique case, and the
    /// stored field only where more than one file competes.
    fn field(&self, key: &str) -> Option<&[String]> {
        if let Some(field) = self.ambiguous.get(key) {
            return Some(field);
        }
        self.by_key.get(key).map(std::slice::from_ref)
    }

    /// The number of distinct keys (normalised path suffixes) in the index.
    /// This is not the number of files.
    ///
    /// # Examples
    ///
    /// ```
    /// use markdown_link::LinkIndex;
    ///
    /// let index = LinkIndex::build(&["a/b.md".to_string()]);
    /// assert_eq!(index.len(), 2); // "b" and "a/b"
    /// ```
    pub fn len(&self) -> usize {
        self.by_key.len()
    }

    /// Whether the index holds no keys.
    ///
    /// # Examples
    ///
    /// ```
    /// use markdown_link::LinkIndex;
    ///
    /// assert!(LinkIndex::build(&[]).is_empty());
    /// assert!(!LinkIndex::build(&["a.md".to_string()]).is_empty());
    /// ```
    pub fn is_empty(&self) -> bool {
        self.by_key.is_empty()
    }
}

/// `a/b/c` -> `["c", "b/c", "a/b/c"]`.
///
/// Public for the same reason [`strip_md_ext`] and [`percent_decode`] are, and
/// for one specific kind of caller: one that needs the *candidate set* behind
/// a link target, which [`LinkIndex`] deliberately does not keep (it stores
/// one winner per key, which is all resolution needs and all a whole-vault
/// cache should pay for). A rename planner, for example, can build its own
/// key → candidates multimap to answer "is this bare name still unambiguous
/// after the move". It must key that map **exactly** the way
/// `LinkIndex::build` does or the two would disagree about what a link points
/// at. Sharing this function and [`normalize_target`] makes that impossible.
///
/// # Examples
///
/// ```
/// use markdown_link::suffixes;
///
/// assert_eq!(suffixes("a/b/c"), ["c", "b/c", "a/b/c"]);
/// assert_eq!(suffixes("c"), ["c"]);
/// ```
pub fn suffixes(path_no_ext: &str) -> Vec<String> {
    let segs: Vec<&str> = path_no_ext.split('/').collect();
    (0..segs.len()).rev().map(|i| segs[i..].join("/")).collect()
}

// Unit struct that carries the README as doc-tests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
struct ReadmeDoctests;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefer_in_folder_matches_whole_folder_names() {
        let field = vec!["notes2/a.md".to_string(), "notes/a.md".to_string()];
        assert_eq!(prefer_in_folder(&field, "notes/x.md"), Some("notes/a.md"));
        assert_eq!(prefer_in_folder(&field, "Notes/x.md"), Some("notes/a.md"));
        let only_sibling = vec!["z/a.md".to_string(), "notes2/a.md".to_string()];
        assert_eq!(
            prefer_in_folder(&only_sibling, "notes/x.md"),
            Some("z/a.md")
        );
    }

    #[test]
    fn parses_wikilinks_embeds_headings_and_aliases() {
        let links = body_links("See [[Target]] and ![[img.png]] and [[a#h|Alias]].");
        assert_eq!(
            links,
            vec![
                RawLink {
                    target: "Target".into(),
                    kind: LinkKind::Wikilink,
                    field: None
                },
                RawLink {
                    target: "img.png".into(),
                    kind: LinkKind::Embed,
                    field: None
                },
                RawLink {
                    target: "a".into(),
                    kind: LinkKind::Wikilink,
                    field: None
                },
            ]
        );
    }

    #[test]
    fn body_links_come_back_in_the_order_they_appear() {
        let targets: Vec<_> = body_links("[a](x.md) [[y]] [b](z.md)")
            .into_iter()
            .map(|l| l.target)
            .collect();
        assert_eq!(targets, vec!["x", "y", "z"]);
    }

    #[test]
    fn links_inside_code_are_not_harvested() {
        let body = "real [[Yes]]\n\n```\nfake [[No]]\n```\n\ninline `[[AlsoNo]]` done\n";
        let targets: Vec<_> = body_links(body).into_iter().map(|l| l.target).collect();
        assert_eq!(targets, vec!["Yes"]);
    }

    #[test]
    fn relative_markdown_links_count_absolute_urls_do_not() {
        let links = body_links("[a](Notes/x.md) [b](https://example.com/y.md) [c](<sp ace.md>)");
        let targets: Vec<_> = links.into_iter().map(|l| l.target).collect();
        assert_eq!(targets, vec!["Notes/x"]);
    }

    #[test]
    fn percent_decode_takes_only_two_hex_digits() {
        // `u8::from_str_radix` takes a leading sign; an escape does not.
        assert_eq!(percent_decode("%+5"), "%+5");
        assert_eq!(percent_decode("a%+41b"), "a%+41b");
        assert_eq!(percent_decode("%-1"), "%-1");
        assert_eq!(percent_decode("%+5 and%20this"), "%+5 and this");
        assert_eq!(percent_decode("%4a%4A"), "JJ");
    }

    #[test]
    fn percent_encoded_markdown_links_are_decoded() {
        let links = body_links("[a](Notes/My%20Note.md)");
        assert_eq!(links[0].target, "Notes/My Note");
    }

    #[test]
    fn target_range_matches_the_parsed_target() {
        for inner in [
            "Note",
            " Note |a",
            "Note\\|a",
            "Note \\|a",
            "Note#H\\|a",
            "Note\\\\|a",
            "Note\\",
            "a#b|c#d",
        ] {
            let range = target_range(inner).expect(inner);
            assert_eq!(
                &inner[range],
                parse_inner(inner, false).unwrap().target,
                "{inner}"
            );
        }
        assert_eq!(target_range("Note\\|a"), Some(0..4));
        assert_eq!(target_range("\\|a"), None);
        assert_eq!(target_range("#H"), None);
    }

    #[test]
    fn empty_targets_are_dropped() {
        assert!(body_links("[[]] [[ ]] [[|alias]]").is_empty());
    }

    #[test]
    fn frontmatter_links_are_tagged_with_their_key() {
        let fm =
            yaml_splice::parse::parse_mapping("rel: '[[Other]]'\nlist:\n  - '[[Two]]'\n").unwrap();
        let links = frontmatter_links(&fm);
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].field.as_deref(), Some("rel"));
        assert_eq!(links[1].target, "Two");
        assert_eq!(links[1].field.as_deref(), Some("list"));
    }

    #[test]
    fn frontmatter_paths_keep_values_with_an_extension() {
        let fm = yaml_splice::parse::parse_mapping(
            "cover: img/a.png\nfiles:\n  - docs/b.pdf\n  - plain words\ntitle: v1.2\nurl: https://x.org/c.png\nup: '[[Note]]'\nn: 3\n",
        )
        .unwrap();
        let links = frontmatter_paths(&fm);
        let got: Vec<(&str, &str)> = links
            .iter()
            .map(|l| (l.field.as_deref().unwrap(), l.target.as_str()))
            .collect();
        assert_eq!(got, vec![("cover", "img/a.png"), ("files", "docs/b.pdf")]);
        assert!(links.iter().all(|l| l.kind == LinkKind::Frontmatter));
    }

    #[test]
    fn the_path_pre_test_matches_what_the_parse_keeps() {
        assert!(may_hold_frontmatter_paths("cover: img/a.png\n"));
        assert!(may_hold_frontmatter_paths("files:\n  - \"docs/b.pdf\"\n"));
        assert!(may_hold_frontmatter_paths("tags: [a, b.jpg]\n"));
        assert!(may_hold_frontmatter_paths("files: [a.png, notes]\n"));
        assert!(may_hold_frontmatter_paths("cover: img/a.png  # hero\n"));
        assert!(may_hold_frontmatter_paths("m: {cover: a.png, n: 1}\n"));
        assert!(!may_hold_frontmatter_paths("title: Hello\nn: 3\nv: 1.2\n"));
    }

    #[test]
    fn display_text_replaces_links_with_their_alias_or_target() {
        assert_eq!(
            display_text("See [[Target|the thing]] and ![[img.png]] and [[Plain]]."),
            "See the thing and img.png and Plain."
        );
    }

    #[test]
    fn suffix_index_resolves_every_path_suffix() {
        let idx = LinkIndex::build(&["notes/muscles/brachialis.md".to_string()]);
        for t in [
            "brachialis",
            "Muscles/brachialis",
            "notes/muscles/brachialis",
        ] {
            assert_eq!(
                idx.resolve(t),
                Some("notes/muscles/brachialis.md"),
                "for {t}"
            );
        }
    }

    #[test]
    fn resolution_is_case_insensitive_and_extension_tolerant() {
        let idx = LinkIndex::build(&["Notes/Alpha.md".to_string(), "_att/photo.jpeg".to_string()]);
        assert_eq!(idx.resolve("alpha"), Some("Notes/Alpha.md"));
        assert_eq!(idx.resolve("ALPHA.md"), Some("Notes/Alpha.md"));
        assert_eq!(idx.resolve("photo.jpeg"), Some("_att/photo.jpeg"));
        // Attachments are addressed WITH their extension; the bare stem is
        // not a key.
        assert_eq!(idx.resolve("photo"), None);
    }

    #[test]
    fn shortest_path_wins_a_collision() {
        let idx = LinkIndex::build(&[
            "Deep/Nested/Folder/note.md".to_string(),
            "note.md".to_string(),
        ]);
        assert_eq!(idx.resolve("note"), Some("note.md"));
        assert!(idx.collisions > 0);
        // The deep one is still reachable by a longer suffix.
        assert_eq!(
            idx.resolve("Folder/note"),
            Some("Deep/Nested/Folder/note.md")
        );
    }

    #[test]
    fn a_pathed_miss_falls_back_to_the_basename() {
        // The collection-alias case: `muscle-groups/` is not a real folder.
        let idx = LinkIndex::build(&["notes/groups/glutes.md".to_string()]);
        assert_eq!(
            idx.resolve("muscle-groups/glutes"),
            Some("notes/groups/glutes.md")
        );
    }

    #[test]
    fn an_unresolvable_target_is_none_not_a_panic() {
        let idx = LinkIndex::build(&["a.md".to_string()]);
        assert_eq!(idx.resolve("nothing/here"), None);
        assert_eq!(idx.resolve(""), None);
    }

    #[test]
    fn backslashes_and_dot_slash_normalise() {
        let idx = LinkIndex::build(&["Notes/Sub/x.md".to_string()]);
        assert_eq!(idx.resolve("Notes\\Sub\\x"), Some("Notes/Sub/x.md"));
        assert_eq!(idx.resolve("./Notes/Sub/x.md"), Some("Notes/Sub/x.md"));
    }

    #[test]
    fn unicode_targets_resolve() {
        let idx = LinkIndex::build(&["Заметки/Привет.md".to_string()]);
        assert_eq!(idx.resolve("привет"), Some("Заметки/Привет.md"));
    }

    fn strict_index() -> LinkIndex {
        LinkIndex::build(&[
            "a.md".to_string(),
            "x/a.md".to_string(),
            "y/b.md".to_string(),
            "z/b.md".to_string(),
            "photo.jpg".to_string(),
        ])
    }

    #[test]
    fn resolve_strict_takes_the_exact_path_over_a_deeper_namesake() {
        assert_eq!(strict_index().resolve_strict("a", "q/n.md"), Ok("a.md"));
        assert_eq!(strict_index().resolve_strict("x/a", "q/n.md"), Ok("x/a.md"));
    }

    #[test]
    fn resolve_strict_refuses_a_contested_name_with_every_candidate() {
        assert_eq!(
            strict_index().resolve_strict("b", "n.md"),
            Err(ResolveError::Ambiguous(vec![
                "y/b.md".to_string(),
                "z/b.md".to_string()
            ]))
        );
        // A pathed miss falls back to the basename, strictly too.
        assert!(matches!(
            strict_index().resolve_strict("other/b", "n.md"),
            Err(ResolveError::Ambiguous(_))
        ));
        // Written next to one of them, the name is that one.
        assert_eq!(strict_index().resolve_strict("b", "z/n.md"), Ok("z/b.md"));
        assert_eq!(
            strict_index().resolve_strict("../y/b", "z/n.md"),
            Ok("y/b.md")
        );
    }

    #[test]
    fn resolve_strict_never_reads_a_bare_name_as_an_attachment() {
        assert_eq!(
            strict_index().resolve_strict("photo", "n.md"),
            Err(ResolveError::NotFound)
        );
        assert_eq!(
            strict_index().resolve_strict("photo.jpg", "n.md"),
            Ok("photo.jpg")
        );
        assert_eq!(
            strict_index().resolve_strict("", "n.md"),
            Err(ResolveError::NotFound)
        );
    }

    #[test]
    fn candidates_agree_with_resolve_from() {
        let index = strict_index();
        for (target, from) in [
            ("b", "n.md"),
            ("b", "z/n.md"),
            ("a", "x/n.md"),
            ("x", "n.md"),
        ] {
            assert_eq!(
                index.resolve_from(target, from),
                prefer_in_folder(index.candidates(target, from), from)
            );
        }
    }
}
