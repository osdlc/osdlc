//! Reading one note without ever failing.
//!
//! [`read_note`] splits a note into frontmatter and body and parses the
//! frontmatter. A malformed block degrades to an empty mapping plus
//! [`Note::parse_error`], and the body is still returned, so a walk over
//! thousands of notes never stops on one.
//!
//! [`read_note_with`] picks how the block is found ([`SplitMode`]): the strict
//! split `frontmatter-lossless` writes back byte for byte, or its lenient
//! split, which also takes a block with spaces around a fence or blank lines
//! before it.

use frontmatter_lossless::{NewShapeOptions, NoteShape, new_shape, split, split_lenient};
use yaml_splice::Mapping;
use yaml_splice::parse::{ParseError, parse_mapping};

/// A note read for projection: frontmatter parsed if it can be, empty if it
/// cannot, and the body either way.
#[derive(Debug, Clone)]
pub struct Note {
    /// The parsed frontmatter. Empty for a note with none, and also for one
    /// whose frontmatter does not parse; [`Note::parse_error`] tells them
    /// apart.
    pub frontmatter: Mapping,
    /// The frontmatter text between the fences, verbatim, for a later splice.
    pub frontmatter_yaml: String,
    /// Everything after the closing fence, verbatim.
    pub body: String,
    /// The framing (BOM, fences, line endings) to restore on write.
    pub shape: NoteShape,
    /// Why the frontmatter did not parse, when it did not. A diagnostic, not
    /// a failure: the note is still usable.
    pub parse_error: Option<String>,
}

impl Default for Note {
    fn default() -> Self {
        Note {
            frontmatter: Mapping::new(),
            frontmatter_yaml: String::new(),
            body: String::new(),
            shape: new_shape(NewShapeOptions::default()),
            parse_error: None,
        }
    }
}

/// How a note's frontmatter block is found.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum SplitMode {
    /// `frontmatter_lossless::split`: the block opens on the first line with
    /// exactly `---` and closes on a line with exactly `---`. What a tool that
    /// writes the note back wants.
    #[default]
    Strict,
    /// `frontmatter_lossless::split_lenient`: blank lines may come before the
    /// opening fence and spaces after either fence. What a tool that only
    /// reads notes, such as a site or skill build, may want. A note with no
    /// block by this rule is read strictly.
    Lenient,
}

/// A note's frontmatter text (when it has a block) and its body, split by
/// `mode`, as both caches split it. The body is always a suffix of `src`, so
/// it starts at byte `src.len() - body.len()`: what a tool that splices the
/// body at spans the caches found needs.
pub fn split_with(src: &str, mode: SplitMode) -> (Option<&str>, &str) {
    if mode == SplitMode::Lenient
        && let Some(s) = split_lenient(src)
    {
        return (Some(s.yaml), s.body);
    }
    let s = split(src);
    (s.yaml, s.body)
}

/// Reads a note's text without ever failing. See the [module docs](self).
/// The same as [`read_note_with`] under [`SplitMode::Strict`].
pub fn read_note(src: &str) -> Note {
    read_note_with(src, SplitMode::Strict)
}

/// [`read_note`] with the frontmatter found by `mode`.
///
/// [`Note::shape`] is always the strict split's. For a block only the lenient
/// split finds, it is the framing of a note with no frontmatter, so a writer
/// that puts the note back with it reframes the block.
pub fn read_note_with(src: &str, mode: SplitMode) -> Note {
    let s = split(src);
    let lenient = (mode == SplitMode::Lenient)
        .then(|| split_lenient(src))
        .flatten();
    let (yaml, body) = match lenient {
        Some(l) => (Some(l.yaml), l.body),
        None => (s.yaml, s.body),
    };
    match yaml {
        None => Note {
            body: body.to_string(),
            shape: s.shape,
            ..Note::default()
        },
        Some(yaml) => {
            let (frontmatter, parse_error) = match parse_mapping(yaml) {
                Ok(m) => (m, None),
                Err(ParseError::NotAMapping(what)) => (
                    Mapping::new(),
                    Some(format!("frontmatter is {what}, not a mapping")),
                ),
                Err(e) => (Mapping::new(), Some(e.to_string())),
            };
            Note {
                frontmatter,
                frontmatter_yaml: yaml.to_string(),
                body: body.to_string(),
                shape: s.shape,
                parse_error,
            }
        }
    }
}

/// A note's title as the vault shows it: the file name without `.md`.
pub fn note_title(path: &str) -> String {
    path.rsplit('/')
        .next()
        .unwrap_or(path)
        .trim_end_matches(".md")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use yaml_splice::Value;

    #[test]
    fn a_well_formed_note_parses() {
        let note = read_note("---\ntitle: A\n---\nbody\n");
        assert_eq!(
            note.frontmatter.get("title").and_then(Value::as_str),
            Some("A")
        );
        assert_eq!(note.frontmatter_yaml, "title: A");
        assert_eq!(note.body, "body\n");
        assert!(note.parse_error.is_none());
    }

    #[test]
    fn malformed_frontmatter_degrades_to_body_only() {
        let note = read_note("---\na: [1, 2\nb: }{\n---\nBODY\n");
        assert!(note.frontmatter.is_empty());
        assert!(note.parse_error.is_some());
        assert_eq!(note.body, "BODY\n");
    }

    #[test]
    fn frontmatter_that_is_not_a_mapping_is_reported() {
        let note = read_note("---\n- a\n- b\n---\nx\n");
        assert!(note.frontmatter.is_empty());
        assert!(note.parse_error.unwrap().contains("not a mapping"));
    }

    #[test]
    fn a_note_with_no_frontmatter_is_all_body() {
        let note = read_note("# Title\n");
        assert_eq!(note.body, "# Title\n");
        assert!(note.parse_error.is_none());
    }

    #[test]
    fn the_lenient_split_takes_a_block_the_strict_one_does_not() {
        let src = "\n---  \ntitle: A\n---\nbody\n";
        let strict = read_note(src);
        assert!(strict.frontmatter.is_empty());
        assert_eq!(strict.body, src);

        let lenient = read_note_with(src, SplitMode::Lenient);
        assert_eq!(
            lenient.frontmatter.get("title").and_then(Value::as_str),
            Some("A")
        );
        assert_eq!(lenient.body, "body\n");
        // A note both splits agree on reads the same either way.
        let plain = "---\ntitle: A\n---\nbody\n";
        let (a, b) = (read_note(plain), read_note_with(plain, SplitMode::Lenient));
        assert_eq!((a.frontmatter, a.body), (b.frontmatter, b.body));
        // No block by either rule: all body.
        assert_eq!(read_note_with("# T\n", SplitMode::Lenient).body, "# T\n");
    }

    #[test]
    fn the_title_is_the_file_name() {
        assert_eq!(note_title("Projects/Alpha.md"), "Alpha");
        assert_eq!(note_title("a.md"), "a");
    }
}
