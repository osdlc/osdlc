//! `[[wikilink]]` / `![[transclusion]]` recognition (BUNDLED dialect, default-on).
//!
//! A post-projection string recognition pass over already-flattened text (not a parser
//! extension), mirroring the TS `dialect/wikilinks.ts`: CommonMark leaves an undefined
//! `[[reference]]` as literal text, so recognition is sufficient — targets survive
//! projection intact and are extractable, `target|alias#fragment` forms included.

use std::sync::OnceLock;

use regex::Regex;

/// Tolerant of remark-stringify's backslash-escaping of `[` (`\[\[…]]`) so a construct is
/// still recognized after a parse→stringify→re-parse cycle — same as the TS regex.
fn vault_ref_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(!?)\\*\[\\*\[([^\]]+)\]\]").expect("static regex"))
}

/// `"wikilink"` for `[[…]]`, `"transclusion"` for `![[…]]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VaultRefKind {
    /// `[[target]]`
    Wikilink,
    /// `![[target]]`
    Transclusion,
}

/// A recognized `[[wikilink]]` or `![[transclusion]]` extracted from flattened text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultRef {
    /// whether the reference is a link or a transclusion
    pub kind: VaultRefKind,
    /// The link target: the part before any `|alias`, `#heading`, or `#^block` suffix.
    pub target: String,
    /// The display alias after `|`, if present.
    pub alias: Option<String>,
    /// The heading or `^block` fragment after `#`, if present.
    pub fragment: Option<String>,
    /// The full matched token, verbatim.
    pub raw: String,
}

/// Recognize every `[[wikilink]]` / `![[transclusion]]` in already-flattened text,
/// in document order.
pub fn extract_vault_refs(text: &str) -> Vec<VaultRef> {
    let mut refs = Vec::new();
    for m in vault_ref_re().captures_iter(text) {
        let bang = m.get(1).is_some_and(|b| b.as_str() == "!");
        let Some(inner) = m.get(2) else { continue };
        let mut target = inner.as_str();
        let mut alias = None;
        let mut fragment = None;
        if let Some(pipe) = target.find('|') {
            alias = Some(target[pipe + 1..].trim().to_string());
            target = &target[..pipe];
        }
        if let Some(hash) = target.find('#') {
            fragment = Some(target[hash + 1..].trim().to_string());
            target = &target[..hash];
        }
        refs.push(VaultRef {
            kind: if bang {
                VaultRefKind::Transclusion
            } else {
                VaultRefKind::Wikilink
            },
            target: target.trim().to_string(),
            alias,
            fragment,
            raw: m.get(0).expect("whole match").as_str().to_string(),
        });
    }
    refs
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wl(target: &str, alias: Option<&str>, fragment: Option<&str>, raw: &str) -> VaultRef {
        VaultRef {
            kind: VaultRefKind::Wikilink,
            target: target.into(),
            alias: alias.map(Into::into),
            fragment: fragment.map(Into::into),
            raw: raw.into(),
        }
    }

    // Ported from the TS wikilinks.test.ts — each case is an input and its exact output.
    #[test]
    fn plain_wikilink_target_is_the_inner_text() {
        assert_eq!(
            extract_vault_refs("see [[D-0002]] for the decision"),
            vec![wl("D-0002", None, None, "[[D-0002]]")]
        );
    }

    #[test]
    fn leading_bang_marks_a_transclusion() {
        let refs = extract_vault_refs("![[Diagram]]");
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].kind, VaultRefKind::Transclusion);
        assert_eq!(refs[0].target, "Diagram");
        assert_eq!(refs[0].raw, "![[Diagram]]");
    }

    #[test]
    fn pipe_splits_the_display_alias_off_the_target() {
        assert_eq!(
            extract_vault_refs("[[Note|see this]]"),
            vec![wl("Note", Some("see this"), None, "[[Note|see this]]")]
        );
    }

    #[test]
    fn hash_splits_the_fragment_off_the_target() {
        assert_eq!(
            extract_vault_refs("[[Note#Section]]"),
            vec![wl("Note", None, Some("Section"), "[[Note#Section]]")]
        );
    }

    #[test]
    fn block_fragment_keeps_the_leading_caret() {
        assert_eq!(
            extract_vault_refs("[[Note#^block-id]]"),
            vec![wl("Note", None, Some("^block-id"), "[[Note#^block-id]]")]
        );
    }

    #[test]
    fn multiple_refs_are_recognized_in_order() {
        let kinds: Vec<_> = extract_vault_refs("[[A]] and then ![[B]]")
            .into_iter()
            .map(|r| (r.kind, r.target))
            .collect();
        assert_eq!(
            kinds,
            vec![
                (VaultRefKind::Wikilink, "A".to_string()),
                (VaultRefKind::Transclusion, "B".to_string())
            ]
        );
    }

    #[test]
    fn text_with_no_refs_yields_empty() {
        assert_eq!(extract_vault_refs("nothing to see here"), Vec::new());
    }
}
