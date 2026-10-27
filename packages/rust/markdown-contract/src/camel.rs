//! The lowerCamelCase key a heading generates. Two headings at one level with the same
//! key are a `structure/key-collision`. The rule is the TS `camel.ts`: split on runs of
//! characters that are not letters or digits (`[^\p{L}\p{N}]+`), drop empties,
//! lowercase the first word, and capitalize each later word (first character up, the
//! rest down). A heading with no letter or digit gives `""`.

use std::sync::OnceLock;

use regex::Regex;

fn non_alnum() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[^\p{L}\p{N}]+").expect("static regex"))
}

/// Uppercase the first character of `word` and lowercase the rest, as JS
/// `word[0].toUpperCase() + word.slice(1).toLowerCase()` does. JS indexes UTF-16 units,
/// so a first character outside the BMP is left as it is.
fn capitalize(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        None => String::new(),
        Some(c) if c.len_utf16() == 2 => c.to_string() + &chars.as_str().to_lowercase(),
        Some(c) => c.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
    }
}

/// The lowerCamelCase key for a heading; `""` when it has no letter or digit.
pub(crate) fn to_camel_key(name: &str) -> String {
    let mut words = non_alnum().split(name).filter(|w| !w.is_empty());
    let Some(first) = words.next() else {
        return String::new();
    };
    let mut key = first.to_lowercase();
    for w in words {
        key.push_str(&capitalize(w));
    }
    key
}

#[cfg(test)]
mod tests {
    use super::to_camel_key;

    // The three examples from the TS module's docstring.
    #[test]
    fn heading_to_lower_camel() {
        assert_eq!(to_camel_key("Files to touch"), "filesToTouch");
        assert_eq!(
            to_camel_key("Goal / Problem statement"),
            "goalProblemStatement"
        );
        // Different capitalization collapses to the SAME key — the collision case.
        assert_eq!(to_camel_key("Files To Touch"), "filesToTouch");
    }

    #[test]
    fn single_word_is_lowercased() {
        assert_eq!(to_camel_key("Overview"), "overview");
    }

    #[test]
    fn no_alphanumeric_content_yields_empty_key() {
        assert_eq!(to_camel_key("---"), "");
        assert_eq!(to_camel_key(""), "");
    }

    #[test]
    fn digits_count_as_word_characters() {
        assert_eq!(to_camel_key("Phase 2 rollout"), "phase2Rollout");
    }

    // JS uppercases by UTF-16 unit, so an astral first letter stays as it is.
    #[test]
    fn an_astral_first_letter_is_not_uppercased() {
        assert_eq!(to_camel_key("a \u{10428}BC"), "a\u{10428}bc");
        assert_eq!(to_camel_key("a \u{E9}t\u{C9}"), "a\u{C9}t\u{E9}");
    }
}
