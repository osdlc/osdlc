---
'@osdlc/markdown-render': minor
---

First release. Markdown to HTML and Vue 3 rendering on unified and remark for CommonMark, GFM and the Obsidian extensions: wikilinks, embeds, callouts, tags, block ids, comments and highlights, with injected link resolution, a sanitizing pipeline and Vue components. Entries: `.`, `./plugins`, `./vue`, `./shiki` and `./theme.css`. `package.json` was set to 0.7.0 by hand so the package starts at 0.8.0.

The wikilink and embed plugins find links with `@osdlc/markdown-link`'s body scanner and place them by source offset. A text node is no longer scanned by a regex, so there is no 512-character field cap and no skipped 100 000-character node. Pass the source to `processor.run(tree, { value: source })` when running a processor from `createMarkdownProcessor` by hand. Breaking against the unpublished 0.5 to 0.7 line: `WIKILINK_RE`, `EMBED_RE`, `FIELD_MAX`, `MAX_SCAN_LENGTH`, `CALLOUT_RE` and `STANDALONE_BLOCK_ID_RE` are no longer exported, and neither are the Vue context keys, `EmbedBudget` and copy-action pieces; the `./vue` `nodeText` is `hastNodeText`; the `./vue` `LoadedNote` alias and the `Schema` re-export are gone. The pieces with no known user outside the package are marked `@experimental`. `katex` is `^0.19.1`.
