---
number: 21
title: Release here
detail: markdown PR 10
status: doing
type: functional
milestone: "[m-release](../milestones/m-release.md)"
after:
  - "[3 Publish 0.2.0](3%20Publish%200.2.0.md)"
---

Release setup here, then move corpus-schema. Give this repo its own release setup: Changesets, a
publish workflow with npm trusted publishing, package checks, the conformance check, a CI matrix and
shared configs. Then move `@osdlc/corpus-schema` and its spec family from osdlc/osdlc into this repo
as its first package. The npm name stays the same. After 3. Other markdown packages follow the same
path later. SPEC.md says the spec moves to osdlc/markdown once this repo has its own release setup.
This task is that move, so SPEC.md needs updating when it happens. In progress.
[osdlc/markdown#9](https://github.com/osdlc/markdown/pull/9) has merged: it moved the package and
its spec family here, with their history, and updated SPEC.md.
[osdlc/markdown#10](https://github.com/osdlc/markdown/pull/10) switches the CI and release to the
shared workflows and checks from osdlc/osdlc
([osdlc/osdlc#749](https://github.com/osdlc/osdlc/pull/749)). It waits for those to merge and for
`@osdlc/package-checks` and `@osdlc/conformance-suites` 0.1.0 on npm. Until then, releases still go
out from osdlc/osdlc.
