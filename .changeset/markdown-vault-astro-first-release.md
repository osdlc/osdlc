---
'@osdlc/markdown-vault-astro': minor
---

First public release. Maps an Obsidian-style vault into Astro content collections: rewrites embeds and frontmatter asset references to published paths, copies the assets, and resolves `[[wikilinks]]` and `![[embeds]]` at build time with a remark plugin. Ships a `markdown-vault-astro` CLI. `package.json` was set to 0.7.1 by hand, so this minor changeset makes the first public version 0.8.0; the versions before it were never published, and the history in `CHANGELOG.md` rebuilds them from the git history.

Compared with the unpublished 0.7.1: the vault directory is a setting (`loadConfig(path, { vault })`, the CLI's `--vault`, the file's `vault:`, else `<astroRoot>/vault`), and no environment variable or shared vault config file is read; `zod` is now a peer dependency (`^4`, as Astro 7 uses) and the package uses zod 4 inside, so `wikilinkRef` returns a zod 4 schema; `engines.node` is `>=22`; the package ships a built `dist/`. `RunOptions`, `RewriteOptions`, `FileRewriteResult` and `Direction` are exported. `remarkWikilinksFromConfig(configPath, { vault })` takes a `vault` option like `loadConfig`. `./remark` no longer re-exports `WIKILINK_RE`, `FIELD_MAX` and `MAX_SCAN_LENGTH` from `@osdlc/markdown-render`. `rewriteFile`, `buildRefIndex`, `resolveRef`, `pathKey` and `exportVault` are marked experimental.

`markdown-vault-astro check` exits 1 and names the missing assets. A frontmatter block scalar (`|`, `>-`) is no longer rewritten as an asset reference. A dangling wikilink-ref error names the note it came from.

`export-vault --clean` (and `transform --clean`) refuses a destination that is or contains the vault, the Astro project, an asset directory, the working directory, the home directory or a git root, so a collection with `vaultDir: .` cannot delete the vault. Frontmatter values that are not plain or quoted scalars (flow collections, anchors, aliases, tags, block-scalar headers with either) are left untouched. An embed alias ending in `\` exports as a valid image. The image scan on export is linear. `.md` is matched case-insensitively, so `Note.MD` is a note. The asset manifest is stat-ed at most every 250 ms and re-read when its size or inode changes, not only its mtime.

