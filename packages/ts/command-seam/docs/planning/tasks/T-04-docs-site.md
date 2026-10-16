---
id: T-04
type: task
state: open
created: 2026-10-16
---

# T-04: Docs site with a generated API reference

## Goal

A docs site with a reference page for every public export, generated from
the TSDoc. The README stays the main guide and links to the site
([D-13](../decisions/D-13-docs-and-community-files.md)).

## Today

The README is the only user documentation. Every export has TSDoc in the
source, but nothing renders it.

## Approach

1. Build the site with Astro Starlight and starlight-typedoc, in
   `docs-site/`.
2. Build it in CI, so a TSDoc error fails the build.

## Acceptance criteria

- [ ] Every public export has a generated reference page.
- [ ] The README links to the site.
- [ ] A TSDoc error fails CI.

## Out of scope

- Badges and marketing copy.
