---
'@osdlc/markdown-contract': minor
---

Add `extractVaultRefs(text)` and the `VaultRef` type, exported from `@osdlc/markdown-contract` and `@osdlc/markdown-contract/core`. `extractVaultRefs` finds every `[[wikilink]]` and `![[transclusion]]` in flattened text, in document order, and splits each into its `target`, `alias` and `fragment`. `[[Note#^block-id]]` gives the fragment `^block-id`. `parse()` still leaves these references as text in the tree, so pass it text such as `SectionView.text('all')`. It also reads references that `remark-stringify` wrote with escaped brackets.
