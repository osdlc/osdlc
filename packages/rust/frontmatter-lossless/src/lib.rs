//! Byte-exact Markdown frontmatter framing.
//!
//! A note is `---`-fenced YAML frontmatter followed by a body. This crate
//! splits the two and recomposes them **without touching a single byte** the
//! author wrote: the YAML text comes back verbatim (fences excluded), with the
//! byte offsets a splice needs, and [`compose`] rebuilds the original file
//! exactly — same BOM, same `\n` vs `\r\n` fences, same trailing state.
//!
//! It is deliberately a tier-0 primitive: no YAML parsing, no filesystem, no
//! regex, nothing but `std`. Parsing the frontmatter's *values* is a job for a
//! YAML-aware layer above this crate; this crate only finds where the block is
//! and puts it back. Lexers over the body belong with their users.
//!
//! Three tolerances, each one a bug someone has already hit:
//!
//! - **BOM.** Notes written by some Windows editors start `\u{feff}---`. The
//!   split recognises and remembers it so a later write can restore it.
//! - **CRLF.** The `\r` stays attached to the YAML slice, so callers see the
//!   exact bytes and [`compose`] rebuilds `---\r\n` fences rather than silently
//!   rewriting them to `---\n` and churning the whole file in a diff.
//! - **A missing or malformed terminator is not an error.** An unterminated
//!   block is simply body: a projection over thousands of notes must degrade,
//!   never abort. [`split`] still flags it in [`Split::unterminated`] for a
//!   caller that wants to report the note as malformed instead.
//!
//! ```
//! use frontmatter_lossless::split;
//!
//! let note = "---\ntitle: Hello\n---\n# Body\n";
//! let s = split(note);
//! assert_eq!(s.yaml, Some("title: Hello"));
//! assert_eq!(s.body, "# Body\n");
//! ```

/// Line ending after the opening `---` fence.
///
/// A closed set: adding a member would be a major release, so an exhaustive
/// `match` over it is safe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum OpenEol {
    /// A line feed, `\n`.
    #[default]
    Lf,
    /// A carriage return and line feed, `\r\n`.
    Crlf,
}

impl OpenEol {
    /// The line ending as the bytes it stands for.
    pub const fn as_str(self) -> &'static str {
        match self {
            OpenEol::Lf => "\n",
            OpenEol::Crlf => "\r\n",
        }
    }
}

/// Line ending after the closing `---` fence.
///
/// A closed set, like [`OpenEol`], with one more member — [`CloseEol::None`],
/// for a file that ended at its closing fence with no line ending after it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseEol {
    /// No line ending: the file ended at the closing fence.
    None,
    /// A line feed, `\n`.
    Lf,
    /// A carriage return and line feed, `\r\n`.
    Crlf,
}

impl CloseEol {
    /// The line ending as the bytes it stands for; `""` for [`CloseEol::None`].
    pub const fn as_str(self) -> &'static str {
        match self {
            CloseEol::None => "",
            CloseEol::Lf => "\n",
            CloseEol::Crlf => "\r\n",
        }
    }
}

/// Everything about a note's framing that a writer has to put back exactly.
///
/// It exists because reassembling a note is where byte fidelity quietly dies:
/// the *values* survive a careful splice and then `---\n` gets written over a
/// file whose fences were `---\r\n`, and now every line of the note shows as
/// changed in git. The fences are data too.
///
/// Take one from [`split`] and pass it back to [`compose`], or, for a new note
/// with no source text, from [`new_shape`]. The fields are public to read, but
/// the type is `#[non_exhaustive]`: build one with [`new_shape`], never a
/// struct literal, so a later field is not a breaking change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[non_exhaustive]
pub struct NoteShape {
    /// The byte-order mark, if the file had one.
    pub bom: bool,
    /// Line ending after the opening `---`.
    pub open_eol: OpenEol,
    /// Line ending after the closing `---`. [`CloseEol::None`] when the file
    /// ended there.
    pub close_eol: CloseEol,
    /// Whether the `\n` separating the block's content from the closing `---`
    /// is present. True for every block except the adjacent-fence empty one
    /// (`---\n---`), where the closing fence directly follows the opener's
    /// newline. It is a separate bit because [`Split::yaml`] alone cannot
    /// distinguish that block from a blank-line-only one (`---\n\n---`): both
    /// yield `Some("")`, but only the latter has a separator byte to restore.
    pub close_sep: bool,
}

/// Options for [`new_shape`].
///
/// Construct it with [`Default`] and set the fields you need, so a later option
/// is not a breaking change:
///
/// ```
/// use frontmatter_lossless::{new_shape, NewShapeOptions, OpenEol};
///
/// let shape = new_shape(NewShapeOptions { eol: OpenEol::Crlf, ..Default::default() });
/// assert_eq!(shape.open_eol, OpenEol::Crlf);
/// ```
#[derive(Debug, Clone, Copy, Default)]
pub struct NewShapeOptions {
    /// Line ending of both fences. Defaults to [`OpenEol::Lf`].
    pub eol: OpenEol,
    /// Whether the note starts with a byte-order mark. Defaults to `false`.
    pub bom: bool,
}

/// A note split into its parts, with byte offsets into the original source.
///
/// The fields are public to read, but the type is `#[non_exhaustive]`: you get
/// one from [`split`], never a struct literal, so a later field is not a
/// breaking change.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct Split<'a> {
    /// The frontmatter YAML, verbatim and without the `---` fences. `None`
    /// when the note has no frontmatter block at all.
    pub yaml: Option<&'a str>,
    /// Byte range of `yaml` within the source (empty when `yaml` is `None`).
    pub yaml_range: std::ops::Range<usize>,
    /// Everything after the closing fence.
    pub body: &'a str,
    /// Byte offset of `body` within the source.
    pub body_start: usize,
    /// The framing to restore when writing this note back.
    pub shape: NoteShape,
    /// `true` when the note opens a frontmatter block that never closes: it
    /// starts with a valid opening fence (`---` and a line break, after an
    /// optional BOM) and no closing `---` line follows. `yaml` is still `None`
    /// and `body` the whole text, as for a note with no block, so a projection
    /// keeps going; a caller that holds authored notes to a contract can read
    /// this to report the note as malformed instead. `false` otherwise.
    pub unterminated: bool,
}

/// The result of a tolerant read-only split: see [`split_lenient`].
///
/// The fields are public to read, but the type is `#[non_exhaustive]` so it can
/// gain a field without breaking callers; read `yaml` and `body` by name.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub struct LenientSplit<'a> {
    /// The text between the fence lines, without the line break before the
    /// closing fence.
    pub yaml: &'a str,
    /// Everything after the closing fence line.
    pub body: &'a str,
}

const BOM: &str = "\u{feff}";

/// The shape for a new note, one with no source text to [`split`]: both fences
/// end in `opts.eol` and the closing fence has its line ending.
///
/// `compose(yaml, body, new_shape(NewShapeOptions::default()))` gives
/// `---\n<yaml>\n---\n<body>`. The `yaml` argument is the text between the
/// fences as [`split`] returns it, without the line break before the closing
/// fence; a YAML serializer's output usually ends in one, so drop it first or
/// the block ends in a blank line. With `eol: OpenEol::Crlf`, [`compose`]
/// writes the fences as CRLF and the yaml text keeps its own line endings, so
/// end its lines in `\r\n` and the text itself in `\r`, as [`split`] returns a
/// CRLF block.
///
/// ```
/// use frontmatter_lossless::{compose, new_shape, NewShapeOptions};
///
/// let note = compose(Some("title: A"), "# A\n", new_shape(NewShapeOptions::default()));
/// assert_eq!(note, "---\ntitle: A\n---\n# A\n");
/// ```
pub fn new_shape(opts: NewShapeOptions) -> NoteShape {
    let close_eol = match opts.eol {
        OpenEol::Lf => CloseEol::Lf,
        OpenEol::Crlf => CloseEol::Crlf,
    };
    NoteShape {
        bom: opts.bom,
        open_eol: opts.eol,
        close_eol,
        close_sep: true,
    }
}

/// Split a note into its frontmatter YAML and body.
///
/// Frontmatter is recognised only when the document begins with `---\n` (or
/// `---\r\n`, or either after a BOM) and is closed by `---` alone on a line.
/// Anything else — including a missing terminator — is body; a missing
/// terminator also sets [`Split::unterminated`]. A leading BOM is framing: it
/// is recorded in [`Split::shape`] and excluded from both `yaml` and `body`,
/// never duplicated into the content.
///
/// ```
/// use frontmatter_lossless::split;
///
/// let s = split("---\na: 1\n---\nbody\n");
/// assert_eq!(s.yaml, Some("a: 1"));
/// assert_eq!(s.body, "body\n");
/// assert!(!s.unterminated);
///
/// // An unterminated block is all body, and flagged.
/// let u = split("---\na: 1\nno close\n");
/// assert_eq!(u.yaml, None);
/// assert!(u.unterminated);
/// ```
pub fn split(src: &str) -> Split<'_> {
    let (bom, rest, offset) = match src.strip_prefix(BOM) {
        Some(rest) => (true, rest, BOM.len()),
        None => (false, src, 0),
    };

    // A BOM is framing, recorded in `shape` and excluded from `body`, so
    // `body` is the content after it (`rest`, starting at `offset`).
    let no_frontmatter = |unterminated: bool| Split {
        yaml: None,
        yaml_range: 0..0,
        body: rest,
        body_start: offset,
        shape: NoteShape {
            bom,
            open_eol: OpenEol::Lf,
            close_eol: CloseEol::Lf,
            close_sep: true,
        },
        unterminated,
    };

    let (after_marker, marker_len, open_eol) = if let Some(r) = rest.strip_prefix("---\n") {
        (r, 4, OpenEol::Lf)
    } else if let Some(r) = rest.strip_prefix("---\r\n") {
        (r, 5, OpenEol::Crlf)
    } else {
        return no_frontmatter(false);
    };
    let yaml_start = offset + marker_len;

    // Empty frontmatter: the closing fence sits directly after the opener.
    for (fence, len, close_eol) in [
        ("---\n", 4usize, CloseEol::Lf),
        ("---\r\n", 5, CloseEol::Crlf),
    ] {
        if let Some(r) = after_marker.strip_prefix(fence) {
            return Split {
                yaml: Some(""),
                yaml_range: yaml_start..yaml_start,
                body: r,
                body_start: yaml_start + len,
                shape: NoteShape {
                    bom,
                    open_eol,
                    close_eol,
                    close_sep: false,
                },
                unterminated: false,
            };
        }
    }
    if after_marker == "---" {
        return Split {
            yaml: Some(""),
            yaml_range: yaml_start..yaml_start,
            body: "",
            body_start: src.len(),
            shape: NoteShape {
                bom,
                open_eol,
                close_eol: CloseEol::None,
                close_sep: false,
            },
            unterminated: false,
        };
    }

    let bytes = after_marker.as_bytes();
    let mut search_start = 0usize;
    loop {
        let Some(found) = after_marker[search_start..].find("\n---") else {
            // An opening fence with no closing one.
            return no_frontmatter(true);
        };
        let dashes_start = search_start + found + 1;
        let after_dashes = dashes_start + 3;
        let (yaml_len, body_rel, close_eol) = match bytes.get(after_dashes).copied() {
            None => (dashes_start - 1, after_marker.len(), CloseEol::None),
            Some(b'\n') => (dashes_start - 1, after_dashes + 1, CloseEol::Lf),
            Some(b'\r') if bytes.get(after_dashes + 1) == Some(&b'\n') => {
                (dashes_start - 1, after_dashes + 2, CloseEol::Crlf)
            }
            _ => {
                // `\n---foo` is not a terminator; keep looking.
                search_start = after_dashes;
                continue;
            }
        };
        return Split {
            yaml: Some(&after_marker[..yaml_len]),
            yaml_range: yaml_start..yaml_start + yaml_len,
            body: &after_marker[body_rel..],
            body_start: yaml_start + body_rel,
            shape: NoteShape {
                bom,
                open_eol,
                close_eol,
                close_sep: true,
            },
            unterminated: false,
        };
    }
}

/// Reassemble a note from a (possibly spliced) frontmatter block and a body —
/// the exact inverse of [`split`].
///
/// `frontmatter` mirrors [`Split::yaml`]: `None` is a note with no block (just
/// the body, after any BOM), `Some("")` is an empty `---` / `---` block, and
/// `Some(text)` is a block with content. Handing `split(src).yaml` straight
/// back reproduces `src` byte for byte for every shape. New YAML or a new body
/// always gets its own line, so a later [`split`] finds the block again.
///
/// ```
/// use frontmatter_lossless::{compose, split};
///
/// let src = "---\r\na: 1\r\n---\r\nbody\r\n";
/// let s = split(src);
/// // Round-trips byte for byte, CRLF fences and all.
/// assert_eq!(compose(s.yaml, s.body, s.shape), src);
/// ```
pub fn compose(frontmatter: Option<&str>, body: &str, shape: NoteShape) -> String {
    let mut out = String::new();
    if shape.bom {
        out.push_str(BOM);
    }
    let Some(yaml) = frontmatter else {
        // No block: the document is just its body (which the BOM, if any, now
        // prefixes exactly once).
        out.push_str(body);
        return out;
    };
    out.push_str("---");
    out.push_str(shape.open_eol.as_str());
    out.push_str(yaml);
    // Restore the separator the split consumed while finding the terminator —
    // a single `\n` (under CRLF the block ends in a bare `\r`, so `\n`, not
    // `open_eol`, rebuilds the original bytes). It is driven by the recorded
    // shape, never inferred from the yaml text: a block ENDING in a blank
    // line legitimately ends with `\n` and still had a separator after it.
    // Only empty YAML can omit it: text written into a shape taken from an
    // empty `---\n---` block still needs its own line before the closing fence.
    if shape.close_sep || !yaml.is_empty() {
        out.push('\n');
    }
    out.push_str("---");
    // A shape from a file that ended at its closing fence has no line ending
    // there; a new body still needs one, so borrow the opening fence's.
    if shape.close_eol == CloseEol::None && !body.is_empty() {
        out.push_str(shape.open_eol.as_str());
    } else {
        out.push_str(shape.close_eol.as_str());
    }
    out.push_str(body);
    out
}

/// A tolerant, read-only frontmatter read for possibly-sloppy input.
///
/// [`split`] is strict and lossless — the basis of the write path. This accepts
/// what hand-authored notes drift into and a *reader* can safely ignore: a
/// leading BOM, blank lines or indentation before the opening fence, and
/// trailing whitespace on the `---` fence lines. The closing fence must not be
/// indented. It returns a [`LenientSplit`], or `None` when there is no block.
/// It tracks no framing, so it is not a round trip — parse with it, never
/// rewrite. A fence still closes only on `---` alone on its line (trailing
/// whitespace aside), so a `---heading` in the body does not end the block.
///
/// ```
/// use frontmatter_lossless::split_lenient;
///
/// let ls = split_lenient("  ---\ntitle: x\n--- \nbody\n").unwrap();
/// assert_eq!(ls.yaml, "title: x");
/// assert_eq!(ls.body, "body\n");
/// assert!(split_lenient("no frontmatter\n").is_none());
/// ```
pub fn split_lenient(content: &str) -> Option<LenientSplit<'_>> {
    let start = content.strip_prefix(BOM).unwrap_or(content).trim_start();
    let (open, rest) = start.split_once('\n')?;
    if open.trim_end() != "---" {
        return None;
    }
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end() == "---" {
            let raw = &rest[..offset];
            let yaml = raw.strip_suffix('\n').unwrap_or(raw);
            let yaml = yaml.strip_suffix('\r').unwrap_or(yaml);
            return Some(LenientSplit {
                yaml,
                body: &rest[offset + line.len()..],
            });
        }
        offset += line.len();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lenient(content: &str) -> Option<(&str, &str)> {
        split_lenient(content).map(|ls| (ls.yaml, ls.body))
    }

    #[test]
    fn splits_a_plain_note() {
        let s = split("---\ntitle: hi\n---\nbody\n");
        assert_eq!(s.yaml, Some("title: hi"));
        assert_eq!(s.body, "body\n");
        assert!(!s.shape.bom);
        assert!(!s.unterminated);
    }

    #[test]
    fn a_note_with_no_frontmatter_is_all_body() {
        let s = split("no fence here");
        assert_eq!(s.yaml, None);
        assert_eq!(s.body, "no fence here");
        assert!(!s.unterminated);
    }

    #[test]
    fn an_unterminated_block_is_all_body() {
        let s = split("---\ntitle: hi\nstill going\n");
        assert_eq!(s.yaml, None);
        assert_eq!(s.body, "---\ntitle: hi\nstill going\n");
        assert!(s.unterminated);
    }

    #[test]
    fn crlf_keeps_the_carriage_return_on_the_yaml_side() {
        let s = split("---\r\ntitle: hi\r\n---\r\nbody\r\n");
        assert_eq!(s.yaml, Some("title: hi\r"));
        assert_eq!(s.body, "body\r\n");
        assert_eq!(s.shape.open_eol, OpenEol::Crlf);
        assert_eq!(s.shape.close_eol, CloseEol::Crlf);
    }

    #[test]
    fn a_bom_is_tolerated_and_remembered() {
        let s = split("\u{feff}---\ntitle: hi\n---\nbody\n");
        assert_eq!(s.yaml, Some("title: hi"));
        assert_eq!(s.body, "body\n");
        assert!(s.shape.bom);
    }

    #[test]
    fn yaml_range_indexes_the_original_source() {
        let src = "\u{feff}---\ntitle: hi\n---\nbody\n";
        let s = split(src);
        assert_eq!(&src[s.yaml_range.clone()], "title: hi");
        assert_eq!(&src[s.body_start..], "body\n");
    }

    #[test]
    fn empty_frontmatter_is_recognised() {
        let s = split("---\n---\nbody\n");
        assert_eq!(s.yaml, Some(""));
        assert_eq!(s.body, "body\n");
        assert!(!s.shape.close_sep);
    }

    #[test]
    fn a_body_containing_a_fence_does_not_confuse_the_split() {
        let s = split("---\na: 1\n---\nintro\n\n---\n\noutro\n");
        assert_eq!(s.yaml, Some("a: 1"));
        assert_eq!(s.body, "intro\n\n---\n\noutro\n");
    }

    #[test]
    fn new_shape_defaults_to_lf_fences() {
        let shape = new_shape(NewShapeOptions::default());
        assert_eq!(shape.open_eol, OpenEol::Lf);
        assert_eq!(shape.close_eol, CloseEol::Lf);
        assert!(shape.close_sep);
        assert!(!shape.bom);
        assert_eq!(
            compose(Some("title: A"), "# A\n", shape),
            "---\ntitle: A\n---\n# A\n"
        );
    }

    #[test]
    fn new_shape_honours_crlf_and_bom() {
        let shape = new_shape(NewShapeOptions {
            eol: OpenEol::Crlf,
            bom: true,
        });
        assert_eq!(shape.open_eol, OpenEol::Crlf);
        assert_eq!(shape.close_eol, CloseEol::Crlf);
        assert_eq!(
            compose(Some("a: 1\r"), "b\r\n", shape),
            "\u{feff}---\r\na: 1\r\n---\r\nb\r\n"
        );
    }

    #[test]
    fn compose_round_trips_a_split() {
        for src in [
            "---\na: 1\n---\nbody\n",
            "\u{feff}---\na: 1\n---\nbody\n",
            "just a body\n",
            "\u{feff}just a body\n",    // no block, with a BOM
            "---\n---\nbody\n",         // empty block, fences adjacent
            "---\n\n---\nbody\n",       // empty block, one blank line
            "---\n\n\n---\nbody\n",     // yaml is itself a blank line
            "---\na: 1\n\n---\nbody\n", // yaml ends in a blank line
        ] {
            let s = split(src);
            let out = compose(s.yaml, s.body, s.shape);
            assert_eq!(out, src, "round trip failed for {src:?}");
        }
    }

    #[test]
    fn a_file_ending_at_the_closing_fence_round_trips() {
        for src in ["---\na: 1\n---", "---\na: 1\n---\n", "---\r\na: 1\r\n---"] {
            let s = split(src);
            assert_eq!(compose(s.yaml, s.body, s.shape), src, "for {src:?}");
        }
    }

    #[test]
    fn yaml_written_into_an_empty_block_gets_its_own_line() {
        for (src, yaml, want) in [
            ("---\n---\nbody\n", "title: x", "---\ntitle: x\n---\nbody\n"),
            (
                "---\r\n---\r\nbody\r\n",
                "title: x\r",
                "---\r\ntitle: x\r\n---\r\nbody\r\n",
            ),
        ] {
            let s = split(src);
            let out = compose(Some(yaml), s.body, s.shape);
            assert_eq!(out, want, "for {src:?}");
            assert_eq!(split(&out).yaml, Some(yaml), "for {src:?}");
        }
    }

    #[test]
    fn a_body_added_after_a_closing_fence_at_the_end_gets_its_own_line() {
        for (src, yaml, body, want) in [
            (
                "---\ntitle: x\n---",
                "title: x",
                "new\n",
                "---\ntitle: x\n---\nnew\n",
            ),
            (
                "---\r\ntitle: x\r\n---",
                "title: x\r",
                "new\r\n",
                "---\r\ntitle: x\r\n---\r\nnew\r\n",
            ),
            ("---\n---", "", "new\n", "---\n---\nnew\n"),
        ] {
            let s = split(src);
            let out = compose(Some(yaml), body, s.shape);
            assert_eq!(out, want, "for {src:?}");
            let back = split(&out);
            assert_eq!((back.yaml, back.body), (Some(yaml), body), "for {src:?}");
        }
    }

    #[test]
    fn a_bom_without_frontmatter_is_framing_not_body() {
        let s = split("\u{feff}just prose\n");
        assert!(s.shape.bom);
        assert_eq!(s.yaml, None);
        assert_eq!(s.body, "just prose\n", "the BOM stays out of the body");
        assert_eq!(compose(s.yaml, s.body, s.shape), "\u{feff}just prose\n");
    }

    #[test]
    fn lenient_tolerates_leading_whitespace_and_fence_padding() {
        assert_eq!(
            lenient("  ---\ntitle: x\n---\nbody\n"),
            Some(("title: x", "body\n"))
        );
        assert_eq!(
            lenient("--- \ntitle: x\n--- \nbody\n"),
            Some(("title: x", "body\n"))
        );
        assert_eq!(lenient("\u{feff}\n\n---\na: 1\n---\n"), Some(("a: 1", "")));
        // CRLF, and an empty block.
        assert_eq!(
            lenient("---\r\na: 1\r\n---\r\nbody\r\n"),
            Some(("a: 1", "body\r\n"))
        );
        assert_eq!(lenient("---\n---\nbody\n"), Some(("", "body\n")));
    }

    #[test]
    fn lenient_returns_none_without_a_block() {
        assert_eq!(lenient("no frontmatter\n"), None);
        assert_eq!(lenient("---\nunterminated\n"), None);
        assert_eq!(lenient(""), None);
    }

    #[test]
    fn lenient_still_needs_a_bare_fence_to_close() {
        assert_eq!(
            lenient("---\na: 1\n---below\nb: 2\n---\nbody\n"),
            Some(("a: 1\n---below\nb: 2", "body\n"))
        );
    }
}
