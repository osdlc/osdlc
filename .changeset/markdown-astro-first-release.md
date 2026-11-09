---
'@osdlc/markdown-astro': minor
---

First public release. Maps an Obsidian-style vault into Astro content collections: rewrites embeds and frontmatter asset references to published paths, copies the assets, and resolves `[[wikilinks]]` and `![[embeds]]` at build time with a remark plugin. Ships a `markdown-astro` CLI. `package.json` was set to 0.7.1 by hand, so this minor changeset makes the first public version 0.8.0; the versions before it were never published, and the history in `CHANGELOG.md` rebuilds them from the git history.

Compared with the unpublished 0.7.1: the vault directory is a setting (`loadConfig(path, { vault })`, the CLI's `--vault`, the file's `vault:`, else `<astroRoot>/vault`), and no environment variable or shared vault config file is read; `zod` is now a peer dependency (`^4`, as Astro 7 uses) and the package uses zod 4 inside, so `wikilinkRef` returns a zod 4 schema; `engines.node` is `>=22`; the package ships a built `dist/`. `RunOptions`, `RewriteOptions`, `FileRewriteResult` and `Direction` are exported. `remarkWikilinksFromConfig(configPath, { vault })` takes a `vault` option like `loadConfig`. `./remark` no longer re-exports `WIKILINK_RE`, `FIELD_MAX` and `MAX_SCAN_LENGTH` from `@osdlc/markdown-render`. `rewriteFile`, `buildRefIndex`, `resolveRef`, `pathKey` and `exportVault` are marked experimental.
