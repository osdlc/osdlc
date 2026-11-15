---
number: 65
title: Leak check
detail: no private data
status: doing
type: supporting
milestone: "[m-upstream](../milestones/m-upstream.md)"
after:
  - "[63 Starter corpus](63%20Starter%20corpus.md)"
---

A CI check in osdlc/osdlc that the starter corpus holds no private data, since its records ship to a public
registry. It fails on a link or path into a private repo such as sksizer/dev, an absolute home
path, an email address, and a wikilink or id that names a record the corpus does not hold. The
check runs on every pull request that touches the starter corpus, and before each publish. Records
carried over from dev (task 64) go through it too. After 63.

`tools/leak-check.sh`, from [osdlc/models#1](https://github.com/osdlc/models/pull/1), scans
`packages/profiles/` and `packages/corpora/` for a private repo name, a home path, an email address
and a `~/` path, and `tools/tests/leak-check.sh` checks that it catches each one.
`.github/workflows/profiles.yml` runs both on pull requests. A link to a record the corpus does not
hold is left to the validator. It does not run before each publish yet: `packages-publish.yml`
does not call it.
