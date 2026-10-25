---
'@osdlc/markdown-contract': patch
---

Empty or comment-only frontmatter now reports the missing required keys. A `^word` at the end of inline code is no longer read as an anchor, and a standalone anchor after a blockquote binds to its section. The typed model binds a `oneOf` or repeatable slot under each heading it matched, and finds a content-record table by its record key rather than by the leaf's `anchor` option, as the structure and content checks already did. Under strict order, a section whose slot the walk already passed (an optional slot skipped for a later section, or a repeatable slot a later section closed) is now `structure/section-order`; before, it passed silently.
Output change: `forbids` and text-rule findings now carry a line but no `column`, since the column they carried was wrong.
An invalid regex in a declarative contract is a `DeclarativeError`, and `nullable: false` migrates.
`init` output changes: object-valued frontmatter fields get nested object schemas (a mixed-type field is left out, and its parent no longer sets `additionalProperties: false`), contract names stay unique across folders (`-2`, `-3`), and several roots get include globs routed to each root.
`validate` exits 2 for a path that is a file, and for a `--path` that is missing, not a folder, or outside the current folder; before, these passed with nothing checked. Integer flags accept only plain integers (`' 3 '` and `1e1` are refused).
