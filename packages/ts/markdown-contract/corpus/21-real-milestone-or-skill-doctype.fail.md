---
id: M-0042
status: open/wip
title: Stand up the markdown-contract package
related: []
---
# Stand up the markdown-contract package

## Goal

Ship the generic markdown-contract engine and wire one SDLC entity contract through it.

## Success criteria

- [ ] The engine validates fixture markdown with zero SDLC dependencies.
- [ ] One entity contract (Decision) runs end-to-end through the op substrate.

### Wave 1 — engine

- [ ] [[T-AAAA-projection-pass]] — mdast → positioned section tree

## Risks / open questions

- remark-gfm is the prerequisite for table/list leaves; pin it in the spike.