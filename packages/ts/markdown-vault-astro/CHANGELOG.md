# @osdlc/markdown-vault-astro

## 0.8.0

### Minor Changes

- 258384e: First public release. Maps an Obsidian-style vault into Astro content collections: rewrites embeds and frontmatter asset references to published paths, copies the assets, and resolves `[[wikilinks]]` and `![[embeds]]` at build time with a remark plugin. Ships a `markdown-vault-astro` CLI. `package.json` was set to 0.7.1 by hand, so this minor changeset makes the first public version 0.8.0; the versions before it were never published, and the history in `CHANGELOG.md` rebuilds them from the git history.
  
  Compared with the unpublished 0.7.1: the vault directory is a setting (`loadConfig(path, { vault })`, the CLI's `--vault`, the file's `vault:`, else `<astroRoot>/vault`), and no environment variable or shared vault config file is read; `zod` is now a peer dependency (`^4`, as Astro 7 uses) and the package uses zod 4 inside, so `wikilinkRef` returns a zod 4 schema; `engines.node` is `>=22`; the package ships a built `dist/`. `RunOptions`, `RewriteOptions`, `FileRewriteResult` and `Direction` are exported. `remarkWikilinksFromConfig(configPath, { vault })` takes a `vault` option like `loadConfig`. `./remark` no longer re-exports `WIKILINK_RE`, `FIELD_MAX` and `MAX_SCAN_LENGTH` from `@osdlc/markdown-render`. `rewriteFile`, `buildRefIndex`, `resolveRef`, `pathKey` and `exportVault` are marked experimental.
  
  `markdown-vault-astro check` exits 1 and names the missing assets. A frontmatter block scalar (`|`, `>-`) is no longer rewritten as an asset reference. A dangling wikilink-ref error names the note it came from.
  
  `export-vault --clean` (and `transform --clean`) refuses a destination that is or contains the vault, the Astro project, an asset directory, the working directory, the home directory or a git root, so a collection with `vaultDir: .` cannot delete the vault. Frontmatter values that are not plain or quoted scalars (flow collections, anchors, aliases, tags, block-scalar headers with either) are left untouched. An embed alias ending in `\` exports as a valid image. The image scan on export is linear. `.md` is matched case-insensitively, so `Note.MD` is a note. The asset manifest is stat-ed at most every 250 ms and re-read when its size or inode changes, not only its mtime.

### Patch Changes

- Updated dependencies [258384e]
  - @osdlc/markdown-render@0.8.0

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.7.1] - 2026-10-31 (unpublished)

#### Added

- `include(collection, rel, text)` option on `transform` and `exportVault`.

### [0.7.0] - 2026-10-31 (unpublished)

#### Changed

- Breaking: Obsidian is removed from library and API names; the CLI, config file and embed node
  type use `markdown-astro` and `wikiEmbed`.

### [0.6.2] - 2026-10-31 (unpublished)

#### Added

- The CLI prints its version with `--version`.

### [0.6.1] - 2026-10-30 (unpublished)

#### Fixed

- A child directory whose name starts with `..` is no longer treated as nested.

### [0.6.0] - 2026-10-30 (unpublished)

#### Changed

- Breaking: `loadConfig` rejects collections whose directories are equal or nested.

### [0.5.2] - 2026-10-30 (unpublished)

#### Fixed

- `--clean` keeps a destination whose source is missing or has no notes.

### [0.5.1] - 2026-10-30 (unpublished)

#### Fixed

- A frontmatter value keeps its trailing comment when rewritten.

### [0.5.0] - 2026-10-30 (unpublished)

#### Changed

- Breaking: wikilink and asset resolution match between vault and Astro; a link that only matched
  through the old ASCII slug no longer resolves.

### [0.4.2] - 2026-10-29 (unpublished)

#### Fixed

- Slug, asset URL, frontmatter and export round-trip defects.

### [0.4.1] - 2026-10-27 (unpublished)

#### Added

- The CLI main returns its exit code, and runs from a development checkout.

### [0.4.0] - 2026-10-19 (unpublished)

#### Changed

- Breaking: the remaining Obsidian names are renamed.

### [0.3.0] - 2026-10-19 (unpublished)

#### Changed

- Breaking: the package and its CLI are renamed to `markdown-astro`.

### [0.2.0] - 2026-10-18 (unpublished)

#### Added

- Build-time rendering of embeds by kind: image, video, audio, PDF, note, heading and block.

#### Changed

- Breaking: non-image embeds and sized images stay `![[...]]` in the transform output.

### [0.1.5] - 2026-10-17 (unpublished)

#### Fixed

- Frontmatter handling moved to the lossless frontmatter library.

### [0.1.4] - 2026-10-12 (unpublished)

#### Fixed

- Wikilink scanning reads the alias from the source.

### [0.1.3] - 2026-10-11 (unpublished)

#### Changed

- Link scanning moved to the shared link-parsing library.

### [0.1.2] - 2026-08-14 (unpublished)

#### Changed

- Wikilink tokenization is delegated to the shared markdown renderer.

### [0.1.1] - 2026-08-07 (unpublished)

#### Fixed

- Wikilink and embed patterns are bounded against pathological input.

### [0.1.0] - 2026-07-12 (unpublished)

#### Added

- Initial version: rewrites embedded assets and frontmatter asset references to published paths,
  leaves relational wikilinks as written, and ships a remark plugin that resolves wikilinks at
  build time, plus a CLI.
