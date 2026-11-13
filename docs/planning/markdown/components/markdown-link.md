---
name: "@osdlc/markdown-link"
kind: package
language: ts
layer: "[note-parts](../layers/note-parts.md)"
states: [present, target]
status: published
version: "0.9.0"
registry: "https://www.npmjs.com/package/@osdlc/markdown-link"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/markdown-link
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/markdown-link
twin: "[markdown-link-rs](markdown-link-rs.md)"
tasks:
  - "[11 Link resolver](../tasks/11%20Link%20resolver.md)"
  - "[13 Switch users](../tasks/13%20Switch%20users.md)"
links:
  - "[osdlc/osdlc#649](https://github.com/osdlc/osdlc/pull/649)"
  - "[osdlc/osdlc#651](https://github.com/osdlc/osdlc/pull/651)"
  - "[osdlc/osdlc#728](https://github.com/osdlc/osdlc/pull/728)"
  - "[osdlc/osdlc#635 (issue)](https://github.com/osdlc/osdlc/issues/635)"
---

Finds every wikilink, embed and relative Markdown link in a note body, and skips links inside code.
Today it only finds links; it cannot say which file a link points to.

## Notes

- Target: it gets the same link resolver as the Rust crate (LinkIndex), and becomes the only place
  in TypeScript that decides what a link points to (task 11).
- Its shared test cases are in the markdown-link conformance family, since osdlc/osdlc#728.
- Open osdlc/osdlc#649 (0.9: more code forms) and #651 (link titles, parentheses in paths; stacked
  on #649) change both twins. #651 fixes problem F3 (osdlc/osdlc#635).
- Problem F2: only the Rust crate can resolve links, so each TypeScript package wrote its own
  resolver.
