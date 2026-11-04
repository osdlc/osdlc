//! Reading one note without ever failing.
//!
//! [`read_note`] splits a note into frontmatter and body and parses the
//! frontmatter. A malformed block degrades to an empty mapping plus
//! [`Note::parse_error`], and the body is still returned, so a walk over
//! thousands of notes never stops on one.

use frontmatter_lossless::{NewShapeOptions, NoteShape, new_shape, split};
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

/// Reads a note's text without ever failing. See the [module docs](self).
pub fn read_note(src: &str) -> Note {
    let s = split(src);
    match s.yaml {
        None => Note {
            body: s.body.to_string(),
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
                body: s.body.to_string(),
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
    fn the_title_is_the_file_name() {
        assert_eq!(note_title("Projects/Alpha.md"), "Alpha");
        assert_eq!(note_title("a.md"), "a");
    }
}
