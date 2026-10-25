---
# A YAML comment. Obsidian's serialiser drops this on any write.
title: Frontmatter hazards
related: ['[[glossary/plugin]]', '[[note]]']
single: '[[capabilities/plugin]]'
meta:
  rel: '[[glossary/terms/unique-term]]'
  deeper:
    rel: '[[snippet]]'
plain: not quoted
---

# Frontmatter hazards

Every shape above is one Obsidian's `yaml@2` serialiser rewrites the moment
anything writes this block: the comment is dropped, the flow list becomes a
block list, the single quotes become double quotes or vanish, and only the
nested mapping survives byte-identically.

Frontmatter links are typed fields, not prose. Obsidian caches them separately,
with the full YAML key path, so `meta.deeper.rel` is addressable.
