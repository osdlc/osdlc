//! Unicode-aware camelCase key derivation.
//!
//! A section's heading text gets a generated `lowerCamelCase` key; two headings at one
//! level whose keys collide are a `structure/key-collision`. The rule mirrors the TS
//! `camel.ts` exactly: split on runs of non-alphanumeric characters (`[^\p{L}\p{N}]+`,
//! Unicode-aware), drop empties, lowercase the first word, capitalize each subsequent
//! word (first letter up, remainder down). A heading with no alphanumeric run yields
//! `""` — "no generated alias".

use std::sync::OnceLock;

use regex::Regex;

fn non_alnum() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[^\p{L}\p{N}]+").expect("static regex"))
}

/// Lowercase the first character of `word`, leaving the rest as-is.
fn lower_first(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_lowercase().chain(chars).collect(),
    }
}

/// Capitalize the first character of `word` and lowercase the remainder.
fn capitalize(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
    }
}

/// Derive the lowerCamelCase key for a heading; `""` when the heading carries no
/// alphanumeric content.
pub fn to_camel_key(name: &str) -> String {
    let mut words = non_alnum().split(name).filter(|w| !w.is_empty());
    let Some(first) = words.next() else {
        return String::new();
    };
    let mut key = lower_first(&first.to_lowercase());
    for w in words {
        key.push_str(&capitalize(w));
    }
    key
}

#[cfg(test)]
mod tests {
    use super::to_camel_key;

    // Contract first: the three examples from the TS module's docstring.
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
}
