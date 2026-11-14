---
name: "@osdlc/corpus-schema"
kind: package
language: ts
layer: "[spec](../layers/spec.md)"
states: [present, target]
status: published
version: "0.4.0"
registry: "https://www.npmjs.com/package/@osdlc/corpus-schema"
repo_present: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_present: packages/ts/corpus-schema
repo_target: "[osdlc/osdlc](../repos/osdlc-osdlc.md)"
path_target: packages/ts/corpus-schema
twin: "[corpus-schema-rs](corpus-schema-rs.md)"
tasks:
  - "[1 corpus-schema](../tasks/1%20corpus-schema.md)"
  - "[2 Record folders](../tasks/2%20Record%20folders.md)"
  - "[3 Publish 0.2.0](../tasks/3%20Publish%200.2.0.md)"
  - "[6 x-warn](../tasks/6%20x-warn.md)"
  - "[7 Obsidian](../tasks/7%20Obsidian.md)"
  - "[9 Extends](../tasks/9%20Extends.md)"
  - "[14 Validator](../tasks/14%20Validator.md)"
  - "[21 Release here](../tasks/21%20Release%20here.md)"
  - "[24 Name overrides](../tasks/24%20Name%20overrides.md)"
  - "[27 Org corpora](../tasks/27%20Org%20corpora.md)"
  - "[28 Refine, waive](../tasks/28%20Refine,%20waive.md)"
  - "[29 Sync](../tasks/29%20Sync.md)"
  - "[31 Nested x-ref](../tasks/31%20Nested%20x-ref.md)"
  - "[33 Spec details](../tasks/33%20Spec%20details.md)"
  - "[34 Ids and move](../tasks/34%20Ids%20and%20move.md)"
  - "[43 Strict mode](../tasks/43%20Strict%20mode.md)"
  - "[44 Flatten extends](../tasks/44%20Flatten%20extends.md)"
  - "[45 Refs by id](../tasks/45%20Refs%20by%20id.md)"
  - "[46 Multi-type x-ref](../tasks/46%20Multi-type%20x-ref.md)"
  - "[57 x-body](../tasks/57%20x-body.md)"
  - "[69 Add command](../tasks/69%20Add%20command.md)"
  - "[70 References](../tasks/70%20References.md)"
  - "[71 Uses](../tasks/71%20Uses.md)"
  - "[73 Identity and record files](../tasks/73%20Identity%20and%20record%20files.md)"
  - "[81 Versions and lockfile](../tasks/81%20Versions%20and%20lockfile.md)"
  - "[88 Typed corpus access](../tasks/88%20Typed%20corpus%20access.md)"
  - "[82 Install and update](../tasks/82%20Install%20and%20update.md)"
  - "[83 Resolve from the cache](../tasks/83%20Resolve%20from%20the%20cache.md)"
links:
  - "[osdlc/markdown#9](https://github.com/osdlc/markdown/pull/9)"
  - "[osdlc/markdown#10](https://github.com/osdlc/markdown/pull/10)"
  - "[osdlc/osdlc#725](https://github.com/osdlc/osdlc/pull/725)"
  - "[osdlc/osdlc#729](https://github.com/osdlc/osdlc/pull/729)"
  - "[osdlc/osdlc#733](https://github.com/osdlc/osdlc/pull/733)"
depends:
  - "[frontmatter-lossless](frontmatter-lossless.md)"
  - "[markdown-link](markdown-link.md)"
depends_new:
  - "[markdown-corpus](markdown-corpus.md)"
  - "[markdown-contract](markdown-contract.md)"
implements:
  - "[corpus-schema-spec](corpus-schema-spec.md)"
validates:
  - "[harness-beta-corpus](harness-beta-corpus.md)"
edge_notes:
  - edge: depends_new
    to: "[markdown-corpus](markdown-corpus.md)"
    note: "Task 14: the validator reads the corpus model instead of walking the folder."
  - edge: depends_new
    to: "[markdown-contract](markdown-contract.md)"
    note: "Task 57: x-body checks a record's body against a contract."
  - edge: validates
    to: "[harness-beta-corpus](harness-beta-corpus.md)"
    note: "harness-reference's validate:beta script."
---

The validator for the corpus-schema spec, as a library and the corpus-schema command. It checks
records against their schemas, ids, links and typed references.

## Notes

- 0.2.0 is its first version on npm, and 0.4.0 the latest. 0.1.0 was cut but never published (task 3),
  and 0.3.0 was never published.
- Today it walks the folder and checks links itself (problem F8). Task 14 makes it read the corpus
  model instead.
- It stays in osdlc/osdlc and releases from here, with the same npm publisher (decision D19). The
  copy that osdlc/markdown#9 and #10 set up in osdlc/markdown is retired.
- The work planned as 0.3.0 (extends, x-extends and sync) came here from osdlc/markdown#12 and was
  released from here as 0.4.0 on 2026-11-13 (task 36).
- validate --fix exists today. Task 29 adds the corpus-schema sync command: it writes a read-only
  copy of each referenced corpus into _references/<prefix>/, such as _references/org/, so Obsidian
  and GitHub links resolve. The validator then checks that the copy matches the installed corpus.
  Task 34 adds a move verb.
