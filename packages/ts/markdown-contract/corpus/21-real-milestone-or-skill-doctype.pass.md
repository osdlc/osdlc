---
id: M-0042
status: open/draft
title: Stand up the markdown-contract package
related: []
---
# Stand up the markdown-contract package

## Goal

Ship the generic markdown-contract engine and wire one SDLC entity contract through it.

## Success criteria

- [ ] The engine validates fixture markdown with zero SDLC dependencies.
- [ ] One entity contract (Decision) runs end-to-end through the op substrate.

## Deliverables

### Wave 1 — engine

- [ ] [[T-AAAA-projection-pass]] — mdast → positioned section tree
- [ ] [[T-BBBB-grammar-combinators]] — sections/section/optional/oneOf/gap

### Wave 2 — integration

- [ ] [[T-CCCC-decision-contract]] — first entity contract end-to-end

## Risks / open questions

- remark-gfm is the prerequisite for table/list leaves; pin it in the spike.