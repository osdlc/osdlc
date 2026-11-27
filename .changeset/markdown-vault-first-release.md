---
'@osdlc/markdown-vault': minor
---

First public release. `@osdlc/markdown-vault` reads a vault of Markdown notes into a plain data
model: `scanVault` walks a folder and returns each note's frontmatter, tags, wikilinks, embeds and
backlinks, and `createVaultIndex` builds the same model from note data you already hold, with no
file access. `createLinkResolver` resolves a link target by the scanner's rules, and
`parseFrontmatter`, `extractLinks` and `extractInlineTags` are the per-file helpers.

- **Breaking:** `extractInlineTags(body, options?)` takes `{ tagDialect }` in an options object,
  as `scanVault` does. It used to take the dialect as a second positional argument.
- The package ships compiled `dist/` with declarations. It supports Node 22 or later and no longer
  claims to run under Bun.
- Every export has TSDoc. `VaultIndex.root` is `''` from `createVaultIndex`, and the `FileMeta`,
  `ExternalNote` and `ScanOptions` members are documented.
- `scanVault` follows symbolic links wherever they point, including out of the vault, so scan only
  vaults you trust. A test now pins this, and the README and SECURITY.md say so.
- Every export is stable on the 0.x line. A test checks the README's Stability section against the
  `@experimental` tags.
