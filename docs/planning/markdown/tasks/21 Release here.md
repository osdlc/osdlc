---
number: 21
title: Release here
detail: markdown PR 10
status: doing
type: functional
milestone: "[m-release](../milestones/m-release.md)"
after:
  - "[3 Publish 0.2.0](3%20Publish%200.2.0.md)"
prs:
  - "[osdlc/markdown#9](https://github.com/osdlc/markdown/pull/9)"
  - "[osdlc/markdown#10](https://github.com/osdlc/markdown/pull/10)"
---

Release setup, then the corpus-schema move. This task gave osdlc/markdown its own release setup and
moved `@osdlc/corpus-schema` and its spec family there from osdlc/osdlc.
[osdlc/markdown#9](https://github.com/osdlc/markdown/pull/9) has merged: it moved the package and its spec family, with their history.
[osdlc/markdown#10](https://github.com/osdlc/markdown/pull/10) has merged (2026-11-10): osdlc/markdown uses the shared CI and release workflows and
checks from osdlc/osdlc ([osdlc/osdlc#749](https://github.com/osdlc/osdlc/pull/749), with fixes in [osdlc/osdlc#767](https://github.com/osdlc/osdlc/pull/767) and [osdlc/osdlc#774](https://github.com/osdlc/osdlc/pull/774)). osdlc/markdown has
not made a release.

[D19](../decisions/D19%20Profiles%20and%20corpora%20come%20to%20osdlc%20osdlc.md) and the repository decision
[D-SM4K](https://github.com/osdlc/osdlc/blob/main/docs/decisions/D-SM4K-markdown-ecosystem-home.md)
reverse the move. corpus-schema releases from osdlc/osdlc, and its npm publisher does not change.
osdlc/markdown's copy is retired once its open work, 0.3.0 in [osdlc/markdown#12](https://github.com/osdlc/markdown/pull/12), is brought back
([osdlc/osdlc#790](https://github.com/osdlc/osdlc/pull/790)). That pull request also removes the note in SPEC.md that the spec moves to
osdlc/markdown. In progress.
