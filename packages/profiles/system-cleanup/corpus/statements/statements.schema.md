---
$schema: https://json-schema.org/draft/2020-12/schema
x-extends: claims/statements
title: Statement
description: >-
  A claim about one store and one subject: the claims profile's statement, plus the fields store,
  subject, scope, status, open and supersedes. The id is a short name for the claim.
type: object
additionalProperties: false
required: [store, subject, scope, status]
properties:
  store:
    description: A link to the store the claim is about. Repeats proposition.subject.
    type: string
    x-ref: stores
  subject:
    description: A link to the subject the claim answers. Its slug is proposition.predicate.
    type: string
    x-ref: subjects
  scope:
    description: Where the claim holds. A null or empty field means it is not limited by it.
    type: object
    additionalProperties: false
    required: [since, until, platform]
    properties:
      since:
        description: The first store version it holds in, or null when no source names one.
        type: [string, "null"]
        minLength: 1
      until:
        description: The first version it no longer holds in, or null while it still holds.
        type: [string, "null"]
        minLength: 1
      platform:
        description: The operating systems it holds on. Empty means all.
        type: array
        items: { enum: [macos, linux, windows] }
  status:
    description: >-
      current (holds now), superseded (a later statement replaced it), disputed (evidence
      disagrees) or open (only questions the sources leave unresolved).
    enum: [current, superseded, disputed, open]
  supersedes:
    description: A link to the statement this one replaced, which has status superseded.
    type: string
    x-ref: statements
  open:
    description: Questions the sources leave unresolved about this claim, one sentence each.
    type: array
    items: { type: string, minLength: 1 }
---

# Statements

One record per answer to a subject for a store, in a folder per store:
`statements/pnpm/pnpm data directories.md`. The proposition is the store, the subject's slug and
the value:

```yaml
proposition:
  subject: "[pnpm](../../stores/pnpm.md)"
  predicate: location/data-dirs
  object: { dirs: [{ platform: linux, path: ~/.local/share/pnpm/store, holds: packages, rebuild: re-download }] }
store: "[pnpm](../../stores/pnpm.md)"
subject: "[Data directories](../../subjects/location/Data%20directories.md)"
scope: { since: null, until: null, platform: [] }
status: current
```

Strength follows the evidence, as in the harness reference: source or help text is strong, vendor
docs or a changelog moderate, an issue or a third-party page weak. A statement takes its strongest
supporting line, one step lower when a line disputes it.

A question no source settles yet has no statement. It is listed under "Open" in the store's
body, and becomes a statement once a page or a run answers it. A statement's own `open` list holds
what its evidence leaves unsettled, such as a platform no page covers.

Paths in values follow the harness reference's spelling: a home path starts with `~/`, a project
path is relative to the project root, there is no trailing slash, and `$VAR` stays only where the
tool itself names the variable.
