//! `[[wikilink]]` and `![[transclusion]]` recognition over already-flattened text,
//! mirroring the TS `dialect/wikilinks.ts`. CommonMark leaves an undefined
//! `[[reference]]` as literal text, so targets survive projection intact, in the
//! `target#fragment|alias` form.

use std::sync::OnceLock;

use regex::Regex;

use crate::js;

/// One optional `\` before each opening bracket, as remark-stringify writes them. The inner
/// text excludes `[` and `]`, so the pass is linear in the input.
fn vault_ref_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(!?)\\?\[\\?\[([^\]\[]+)\]\]").expect("static regex"))
}

/// Whether a reference is a link or a transclusion.
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
    /// Link or transclusion.
    pub kind: VaultRefKind,
    /// The link target: the part before any `#fragment` or `|alias`.
    pub target: String,
    /// The display alias after the first `|`, if present.
    pub alias: Option<String>,
    /// The heading or `^block` fragment after the first `#` before any `|`, if present.
    pub fragment: Option<String>,
    /// The full matched token, verbatim.
    pub raw: String,
}

/// Every `[[wikilink]]` and `![[transclusion]]` in already-flattened text, in document
/// order. The alias is everything after the first `|`; the fragment is everything after
/// the first `#` in what is left, so `[[Note|alias#Part]]` has the alias `alias#Part`
/// and no fragment. The text between the brackets cannot contain `[`.
///
/// ```
/// use markdown_contract::{VaultRefKind, extract_vault_refs};
///
/// let refs = extract_vault_refs("see [[Note#^id|the note]] and ![[Diagram]]");
/// assert_eq!(refs[0].target, "Note");
/// assert_eq!(refs[0].fragment.as_deref(), Some("^id"));
/// assert_eq!(refs[0].alias.as_deref(), Some("the note"));
/// assert_eq!(refs[1].kind, VaultRefKind::Transclusion);
/// ```
pub fn extract_vault_refs(text: &str) -> Vec<VaultRef> {
    let mut refs = Vec::new();
    for m in vault_ref_re().captures_iter(text) {
        let bang = m.get(1).is_some_and(|b| b.as_str() == "!");
        let Some(inner) = m.get(2) else { continue };
        let mut target = inner.as_str();
        let mut alias = None;
        let mut fragment = None;
        if let Some(pipe) = target.find('|') {
            alias = Some(js::trim(&target[pipe + 1..]).to_string());
            target = &target[..pipe];
        }
        if let Some(hash) = target.find('#') {
            fragment = Some(js::trim(&target[hash + 1..]).to_string());
            target = &target[..hash];
        }
        refs.push(VaultRef {
            kind: if bang {
                VaultRefKind::Transclusion
            } else {
                VaultRefKind::Wikilink
            },
            target: js::trim(target).to_string(),
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

    fn r(
        kind: VaultRefKind,
        target: &str,
        alias: Option<&str>,
        fragment: Option<&str>,
        raw: &str,
    ) -> VaultRef {
        VaultRef {
            kind,
            target: target.into(),
            alias: alias.map(Into::into),
            fragment: fragment.map(Into::into),
            raw: raw.into(),
        }
    }

    fn wl(target: &str, alias: Option<&str>, fragment: Option<&str>, raw: &str) -> VaultRef {
        r(VaultRefKind::Wikilink, target, alias, fragment, raw)
    }

    // Ported from the TS wikilinks.test.ts: each case is an input and its exact output.
    #[test]
    fn plain_wikilink_target_is_the_inner_text() {
        assert_eq!(
            extract_vault_refs("see [[D-0002]] for the decision"),
            vec![wl("D-0002", None, None, "[[D-0002]]")]
        );
    }

    #[test]
    fn leading_bang_marks_a_transclusion() {
        assert_eq!(
            extract_vault_refs("![[Diagram]]"),
            vec![r(
                VaultRefKind::Transclusion,
                "Diagram",
                None,
                None,
                "![[Diagram]]"
            )]
        );
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
    fn alias_and_fragment_together() {
        assert_eq!(
            extract_vault_refs("[[Note#Section|alias]] ![[Note#^id|alias]]"),
            vec![
                wl(
                    "Note",
                    Some("alias"),
                    Some("Section"),
                    "[[Note#Section|alias]]"
                ),
                r(
                    VaultRefKind::Transclusion,
                    "Note",
                    Some("alias"),
                    Some("^id"),
                    "![[Note#^id|alias]]"
                ),
            ]
        );
    }

    #[test]
    fn same_document_link_has_an_empty_target() {
        assert_eq!(
            extract_vault_refs("[[#^id]]"),
            vec![wl("", None, Some("^id"), "[[#^id]]")]
        );
    }

    #[test]
    fn one_backslash_before_each_bracket_is_recognized() {
        assert_eq!(
            extract_vault_refs(r"\[\[Note]] and !\[\[Embed]]"),
            vec![
                wl("Note", None, None, r"\[\[Note]]"),
                r(
                    VaultRefKind::Transclusion,
                    "Embed",
                    None,
                    None,
                    r"!\[\[Embed]]"
                ),
            ]
        );
    }

    #[test]
    fn alias_hash_is_part_of_the_alias() {
        assert_eq!(
            extract_vault_refs("[[Note|alias#frag]]"),
            vec![wl("Note", Some("alias#frag"), None, "[[Note|alias#frag]]")]
        );
    }

    #[test]
    fn inner_text_cannot_contain_an_open_bracket() {
        assert_eq!(
            extract_vault_refs("[[a[[b]]"),
            vec![wl("b", None, None, "[[b]]")]
        );
        assert_eq!(
            extract_vault_refs("[[[a]]"),
            vec![wl("a", None, None, "[[a]]")]
        );
        assert_eq!(extract_vault_refs("[[Note [draft]]]"), Vec::new());
    }

    #[test]
    fn two_backslashes_are_not_an_escape() {
        assert_eq!(
            extract_vault_refs(r"\\[[a]]"),
            vec![wl("a", None, None, r"\[[a]]")]
        );
        assert_eq!(extract_vault_refs(r"[\\[a]]"), Vec::new());
    }

    #[test]
    fn text_with_no_refs_yields_empty() {
        assert_eq!(extract_vault_refs("nothing to see here"), Vec::new());
    }

    // The `regex` crate matches in linear time, so these only check that each input
    // returns no refs.
    #[test]
    fn large_hostile_inputs_yield_no_refs() {
        let inputs = [
            "[[a".repeat(70_000),
            "\\".repeat(200_000),
            "\\".repeat(100_000) + "[[a",
            "[[".to_string() + &"a".repeat(200_000),
            "[".repeat(200_000),
        ];
        for text in inputs {
            assert_eq!(extract_vault_refs(&text), Vec::new());
        }
    }
}
