//! Canonical kebab-case slugging for skill and tool names.
//!
//! `agent-adapt` uses one slugger. [`slugify`] does the kebab conversion,
//! and [`slugify_skill_name`] layers the Agent Skills spec 64-character
//! limit on top.
//!
//! # Slugging rules
//!
//! 1. Lowercase every ASCII alphabetic character.
//! 2. Keep ASCII alphanumerics and hyphens as-is.
//! 3. Replace every other character with a single hyphen.
//! 4. Collapse consecutive hyphens into one.
//! 5. Trim leading and trailing hyphens.
//!
//! [`slugify_skill_name`] additionally truncates to 64 characters and
//! re-trims any trailing hyphen introduced by truncation.
//!
//! # An empty slug is refused here, not returned
//!
//! The Agent Skills spec types `name` as `^[a-z0-9]+(-[a-z0-9]+)*$`,
//! 1–64 characters. The empty string is not a member of that language, so
//! a name carrying no ASCII alphanumerics — `"!!!"`, `"日本語"` — has *no*
//! legal slug. [`slugify_skill_name`] is therefore fallible and refuses
//! that input; it never hands back an empty string for a caller to join
//! onto a path or drop out of frontmatter.
//!
//! A fallback constant (`"skill"`, `"untitled"`) would map every un-sluggable
//! name to the *same* value, re-creating the one-destination-two-skills
//! collision the refusal exists to prevent. Transliterating non-ASCII names is
//! a naming decision, not a defect fix, and is not done here.
//!
//! [`slugify`] itself stays infallible and may return `""` — it is the
//! generic kebab helper, not the spec-shaped one. Callers projecting a
//! path or a `name:` field want [`slugify_skill_name`].

use std::collections::HashSet;

use crate::{Error, Result};

/// Maximum length of a skill name per the Agent Skills spec.
pub const SKILL_NAME_MAX_LEN: usize = 64;

/// Convert an arbitrary string into a kebab-case slug. No length limit.
///
/// Returns `""` for input with no ASCII alphanumerics. That is a legal
/// answer for a generic slug but **not** for an Agent Skills `name` — use
/// [`slugify_skill_name`], which refuses it, anywhere the result becomes a
/// path component or a frontmatter value.
///
/// # Examples
///
/// ```
/// use agent_adapt::naming::slugify;
/// assert_eq!(slugify("My Cool Skill"), "my-cool-skill");
/// assert_eq!(slugify("skill@v2.0!"), "skill-v2-0");
/// assert_eq!(slugify("a---b___c"), "a-b-c");
/// assert_eq!(slugify("--hello--"), "hello");
/// assert_eq!(slugify("!!!"), "");
/// ```
pub fn slugify(name: &str) -> String {
    let mapped: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();

    let mut collapsed = String::with_capacity(mapped.len());
    let mut last_was_hyphen = false;
    for c in mapped.chars() {
        if c == '-' {
            if !last_was_hyphen {
                collapsed.push(c);
            }
            last_was_hyphen = true;
        } else {
            collapsed.push(c);
            last_was_hyphen = false;
        }
    }

    collapsed.trim_matches('-').to_string()
}

/// Slugify a skill name into the Agent Skills spec's `name` shape:
/// `^[a-z0-9]+(-[a-z0-9]+)*$`, clamped to 64 characters with any trailing
/// hyphen introduced by truncation re-trimmed.
///
/// # Errors
///
/// Returns [`Error::Validation`] when `name` carries no ASCII
/// alphanumerics and so has no legal slug — the empty string is not in the
/// spec's language for `name`, and emitting it collapses the skill
/// directory onto the skills root. The message names the offending input
/// and the fix.
///
/// # Examples
///
/// ```
/// use agent_adapt::naming::slugify_skill_name;
/// assert_eq!(slugify_skill_name("My Skill").unwrap(), "my-skill");
/// let long = "a".repeat(100);
/// assert_eq!(slugify_skill_name(&long).unwrap().len(), 64);
/// assert!(slugify_skill_name("日本語").is_err());
/// ```
pub fn slugify_skill_name(name: &str) -> Result<String> {
    let slug = slugify(name);
    if slug.is_empty() {
        return Err(Error::validation(format!(
            "skill name {name:?} slugs to the empty string: the Agent Skills \
             `name` field must match ^[a-z0-9]+(-[a-z0-9]+)*$ (1-64 chars), \
             so a name needs at least one ASCII letter or digit. Set the \
             skill's name explicitly to something in [a-z0-9-]."
        )));
    }
    if slug.len() > SKILL_NAME_MAX_LEN {
        Ok(slug[..SKILL_NAME_MAX_LEN].trim_end_matches('-').to_string())
    } else {
        Ok(slug)
    }
}

/// Disambiguate a list of tool/skill names in place by appending numeric
/// suffixes to duplicates.
///
/// The first occurrence is left untouched; subsequent occurrences gain a
/// `-1`, `-2`, ... suffix.
///
/// # Examples
///
/// ```
/// use agent_adapt::naming::deduplicate_tool_names;
/// let mut names = vec!["read".into(), "read".into(), "write".into()];
/// deduplicate_tool_names(&mut names);
/// assert_eq!(names, vec!["read", "read-1", "write"]);
/// ```
pub fn deduplicate_tool_names(names: &mut [String]) {
    let mut seen: HashSet<String> = HashSet::new();
    for name in names.iter_mut() {
        let original = name.clone();
        let mut suffix = 1;
        while seen.contains(name) {
            *name = format!("{}-{}", original, suffix);
            suffix += 1;
        }
        seen.insert(name.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("My Skill"), "my-skill");
    }

    #[test]
    fn slugify_underscores() {
        assert_eq!(slugify("my_cool_skill"), "my-cool-skill");
    }

    #[test]
    fn slugify_special_chars() {
        assert_eq!(slugify("skill@v2.0!"), "skill-v2-0");
    }

    #[test]
    fn slugify_leading_trailing_hyphens() {
        assert_eq!(slugify("--hello--"), "hello");
    }

    #[test]
    fn slugify_consecutive_hyphens() {
        assert_eq!(slugify("a---b___c"), "a-b-c");
    }

    #[test]
    fn slugify_unicode_becomes_hyphens() {
        assert_eq!(slugify("café résumé"), "caf-r-sum");
    }

    #[test]
    fn slugify_already_kebab_passthrough() {
        assert_eq!(slugify("already-kebab-case"), "already-kebab-case");
    }

    #[test]
    fn slugify_skill_name_short_passthrough() {
        assert_eq!(slugify_skill_name("short").unwrap(), "short");
    }

    #[test]
    fn slugify_skill_name_truncates_to_64() {
        let long = "a".repeat(100);
        assert_eq!(slugify_skill_name(&long).unwrap().len(), SKILL_NAME_MAX_LEN);
    }

    #[test]
    fn slugify_skill_name_cap_matches_discover_rs_validate_name() {
        // `tradecraft-core`'s `discover.rs#validate_name` admits a name up
        // to 64 characters; `SKILL_NAME_MAX_LEN` must agree, so nothing this
        // function hands back can fail that scan on length alone.
        let cap = "a".repeat(SKILL_NAME_MAX_LEN);
        assert_eq!(slugify_skill_name(&cap).unwrap(), cap);

        let over = "a".repeat(SKILL_NAME_MAX_LEN + 1);
        assert_eq!(slugify_skill_name(&over).unwrap().len(), SKILL_NAME_MAX_LEN);
    }

    #[test]
    fn slugify_skill_name_trims_hyphen_after_truncation() {
        let name = format!("{}-tail", "a".repeat(63));
        let result = slugify_skill_name(&name).unwrap();
        assert!(!result.ends_with('-'));
        assert!(result.len() <= SKILL_NAME_MAX_LEN);
    }

    #[test]
    fn slugify_skill_name_refuses_punctuation_only() {
        let err = slugify_skill_name("!!!").expect_err("punctuation-only name is not sluggable");
        let msg = err.to_string();
        assert!(msg.contains("\"!!!\""), "message names the input: {msg}");
        assert!(msg.contains("[a-z0-9-]"), "message states the fix: {msg}");
    }

    #[test]
    fn slugify_skill_name_refuses_non_ascii_only() {
        assert!(slugify_skill_name("日本語").is_err());
        assert!(slugify_skill_name("Привет").is_err());
        assert!(slugify_skill_name("").is_err());
        assert!(slugify_skill_name("---").is_err());
    }

    #[test]
    fn slugify_skill_name_keeps_partially_ascii_names() {
        // Not every non-ASCII name is refused — only ones with no ASCII
        // alphanumerics at all.
        assert_eq!(slugify_skill_name("café résumé").unwrap(), "caf-r-sum");
    }

    #[test]
    fn deduplicate_basic() {
        let mut names = vec!["read".into(), "read".into(), "write".into()];
        deduplicate_tool_names(&mut names);
        assert_eq!(names, vec!["read", "read-1", "write"]);
    }

    #[test]
    fn deduplicate_triple_collision() {
        let mut names = vec!["x".into(), "x".into(), "x".into()];
        deduplicate_tool_names(&mut names);
        assert_eq!(names, vec!["x", "x-1", "x-2"]);
    }

    #[test]
    fn deduplicate_empty_passthrough() {
        let mut names: Vec<String> = vec![];
        deduplicate_tool_names(&mut names);
        assert!(names.is_empty());
    }

    #[test]
    fn deduplicate_no_duplicates_passthrough() {
        let mut names = vec!["a".into(), "b".into(), "c".into()];
        deduplicate_tool_names(&mut names);
        assert_eq!(names, vec!["a", "b", "c"]);
    }
}
