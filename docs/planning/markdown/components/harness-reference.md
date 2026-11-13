---
name: harness-reference
kind: app
language: ts
layer: "[apps](../layers/apps.md)"
states: [present, target]
status: unpublished
repo_present: "[osdlc/skillwright](../repos/osdlc-skillwright.md)"
path_present: harness-reference
repo_target: "[osdlc/skillwright](../repos/osdlc-skillwright.md)"
path_target: harness-reference
tasks:
  - "[8 Use npm](../tasks/8%20Use%20npm.md)"
  - "[22 Capture](../tasks/22%20Capture.md)"
  - "[23 Claims profile](../tasks/23%20Claims%20profile.md)"
  - "[26 Adopt claims](../tasks/26%20Adopt%20claims.md)"
links:
  - "[osdlc/skillwright#95](https://github.com/osdlc/skillwright/pull/95)"
  - "[osdlc/skillwright#97](https://github.com/osdlc/skillwright/pull/97)"
  - "[osdlc/osdlc#750](https://github.com/osdlc/osdlc/pull/750)"
depends:
  - "[corpus-schema-ts](corpus-schema-ts.md)"
reads:
  - "[harness-beta-corpus](harness-beta-corpus.md)"
edge_notes:
  - edge: depends
    to: "[corpus-schema-ts](corpus-schema-ts.md)"
    note: "@osdlc/corpus-schema ^0.2.0 from npm."
---

A cited record of how coding-agent harnesses differ, kept as Markdown corpora, with its validators,
an importer and a compiler for a knowledge file.

## Notes

- Private package. It validates its beta corpus with @osdlc/corpus-schema ^0.2.0 from npm
  (osdlc/skillwright#95, 2026-11-09).
- osdlc/skillwright#95 deleted skillwright's own markdown-db copy. The plan still lists that copy,
  and task 8 as not started.
- Its compiled harness-knowledge.json feeds the draft @osdlc/harness-knowledge package
  (osdlc/osdlc#750).
- Target: it uses @osdlc/corpus-profile-claims instead of copies (task 23).
