---
'@osdlc/markdown-contract': minor
---

Add `extractVaultRefs(text)` and the `VaultRef` type, exported from `@osdlc/markdown-contract` and `@osdlc/markdown-contract/core`. `extractVaultRefs` finds every `[[wikilink]]` and `![[transclusion]]` in flattened text, in document order, and splits each into its `target`, `alias` and `fragment`. `[[Note#^block-id]]` gives the fragment `^block-id`. The text between the brackets cannot contain `[`, and one backslash before a bracket, as `remark-stringify` writes it, is accepted. The search runs in linear time. `parse()` still leaves these references as text in the tree, so pass it text such as `SectionView.text('all')`.
