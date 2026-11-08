# @osdlc/markdown-render

## History before the first public release

These versions were never published. They are rebuilt from the git history.

### [0.7.0] - 2026-10-31 (unpublished)

#### Changed

- Breaking: ObsidianCallout, ObsidianEmbed and ObsidianHandlers become Callout, Embed and RenderHandlers; the embed node type becomes wikiEmbed.

### [0.6.0] - 2026-10-30 (unpublished)

#### Changed

- Breaking: Slicers no longer skip a leading --- block as frontmatter; they expect a body.

### [0.5.2] - 2026-10-30 (unpublished)

#### Fixed

- Whole-package bug sweep: fixes in the Vue renderer, plugins and slicers.

### [0.5.1] - 2026-10-25 (unpublished)

#### Fixed

- 15 bug fixes with repro tests.

### [0.5.0] - 2026-10-19 (unpublished)

#### Changed

- Breaking: Renamed the remaining Obsidian-prefixed exports, theme variables, classes and the root class.

### [0.4.0] - 2026-10-19 (unpublished)

#### Changed

- Breaking: The <obsidian-embed> element becomes <markdown-embed>; its component route key changes.

### [0.3.1] - 2026-10-18 (unpublished)

#### Added

- Shared embed rendering rules (embedSize, embedAlt, embedBlocker, embedPlaceholder, embedMedia, embedNoteProperties) and sliceEmbed and embed limits exported from ./plugins.

### [0.3.0] - 2026-10-18 (unpublished)

#### Changed

- Breaking: INLINE_TAG_RE removed; remarkTags reads tags with the shared tag scanner.

### [0.2.16] - 2026-10-15 (unpublished)

#### Added

- Table padding option support.

### [0.2.15] - 2026-10-11 (unpublished)

#### Fixed

- Tags read through the shared tag package.

### [0.2.14] - 2026-10-11 (unpublished)

#### Fixed

- Attachment extensions come from the TypeScript wikilink package.

### [0.2.13] - 2026-10-08 (unpublished)

#### Fixed

- Tag handling follow-up.

### [0.2.12] - 2026-10-07 (unpublished)

#### Fixed

- Tag handling follow-up.

### [0.2.11] - 2026-10-07 (unpublished)

#### Fixed

- Tag handling update.

### [0.2.10] - 2026-10-06 (unpublished)

#### Fixed

- Follow-up fixes.

### [0.2.9] - 2026-10-06 (unpublished)

#### Fixed

- A block id now requires preceding whitespace.

### [0.2.8] - 2026-10-06 (unpublished)

#### Fixed

- A trailing # that is part of heading text is kept.

### [0.2.7] - 2026-09-10 (unpublished)

#### Added

- sourceHeadings and SourceHeading exported.

### [0.2.6] - 2026-09-10 (unpublished)

#### Fixed

- Consumer-side tab and icon work; small source fixes.

### [0.2.5] - 2026-09-06 (unpublished)

#### Fixed

- exactOptionalPropertyTypes compliance in option types.

### [0.2.4] - 2026-09-05 (unpublished)

#### Fixed

- Bug sweep defects.

### [0.2.3] - 2026-09-05 (unpublished)

#### Fixed

- Stale embed-ancestor chain and SVG attribute case in the Vue renderer.

### [0.2.2] - 2026-09-04 (unpublished)

#### Fixed

- Defects found in a consumer.

### [0.2.1] - 2026-09-03 (unpublished)

#### Fixed

- Defects found in a consumer.

### [0.2.0] - 2026-09-03 (unpublished)

#### Changed

- Breaking: Shiki is opt-in: rehypeShiki, RESERVED_FENCE_LANGS and RehypeShikiOptions leave the main and plugins entries for ./shiki; large sources open under a performance budget.

### [0.1.22] - 2026-09-03 (unpublished)

#### Added

- ./plugins export and an async seam for JSON canvas.

### [0.1.21] - 2026-09-03 (unpublished)

#### Added

- Wider adoption; 10 new exports.

### [0.1.20] - 2026-09-03 (unpublished)

#### Fixed

- First fence off a cold grammar tokenizes from the right scope.

### [0.1.19] - 2026-09-03 (unpublished)

#### Fixed

- Defects from a bug sweep.

### [0.1.18] - 2026-09-01 (unpublished)

#### Added

- Exports sync rendering, KaTeX and mermaid helpers, slicers.

### [0.1.17] - 2026-08-26 (unpublished)

#### Fixed

- Bug sweep, 8 fixes.

### [0.1.16] - 2026-08-25 (unpublished)

#### Added

- Find-in-note support.

### [0.1.15] - 2026-08-24 (unpublished)

#### Added

- Fold heading sections and list items.

### [0.1.14] - 2026-08-23 (unpublished)

#### Fixed

- Type packages are runtime dependencies, not dev.

### [0.1.13] - 2026-08-23 (unpublished)

#### Fixed

- Build and gate fixes touching source (43/29 lines).

### [0.1.12] - 2026-08-23 (unpublished)

#### Added

- Syntax highlighting in code fences.

### [0.1.11] - 2026-08-23 (unpublished)

#### Added

- Table extras: column sort, pinned header, copy as CSV.

### [0.1.10] - 2026-08-23 (unpublished)

#### Added

- Code fence chrome: language label, copy button, wrap toggle.

### [0.1.9] - 2026-08-22 (unpublished)

#### Added

- One authority for what an attachment is (ATTACHMENT_EXTENSIONS, path helpers).

### [0.1.8] - 2026-08-22 (unpublished)

#### Added

- Markdown images now route through the embed element, so their rendered markup changes.

### [0.1.7] - 2026-08-22 (unpublished)

#### Added

- New exports for lazy-tree reading (15 export lines).

### [0.1.6] - 2026-08-22 (unpublished)

#### Fixed

- Performance: stable node identity across redraws.

### [0.1.5] - 2026-08-22 (unpublished)

#### Added

- Security, accessibility and scale hardening; 8 new exports.

### [0.1.4] - 2026-08-22 (unpublished)

#### Added

- Small additions for the bases and canvas views (20 source lines).

### [0.1.3] - 2026-08-22 (unpublished)

#### Fixed

- Small renderer fixes while the notes reading view landed (omnibus PR; 6 source lines).

### [0.1.2] - 2026-08-14 (unpublished)

#### Added

- The node-builder payload carries the raw target and raw alias.

### [0.1.1] - 2026-08-14 (unpublished)

#### Added

- Wikilink and embed tokenizers hardened against catastrophic backtracking; added a node-builder seam.

### [0.1.0] - 2026-08-14 (unpublished)

#### Added

- First usable renderer: wikilinks, embeds, callouts, tags, highlights, comments, Vue 3 integration.
