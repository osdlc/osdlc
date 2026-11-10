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
[osdlc/markdown#10](https://github.com/osdlc/markdown/pull/10) has merged (2026-11-10): this repo now
uses the shared CI and release workflows and checks from osdlc/osdlc
([osdlc/osdlc#749](https://github.com/osdlc/osdlc/pull/749)). The shared release workflow had failed
for lack of the App key ([osdlc/osdlc#767](https://github.com/osdlc/osdlc/pull/767)) and the version
script left the lockfile stale ([osdlc/osdlc#774](https://github.com/osdlc/osdlc/pull/774)). Both
have merged. `@osdlc/conformance-suites` 0.1.0 is on npm. `@osdlc/package-checks` is not yet: it
publishes when the Version Packages PR ([osdlc/osdlc#773](https://github.com/osdlc/osdlc/pull/773))
merges. This repo has not made a release yet. Until it does, corpus-schema releases still go out
from osdlc/osdlc.
