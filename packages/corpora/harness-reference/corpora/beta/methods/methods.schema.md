---
$schema: https://json-schema.org/draft/2020-12/schema
title: Method
description: >-
  A set of steps that says how to get a result, here a probe: a run anyone can repeat. VA-Spec
  class Method, from the claims profile (osdlc/markdown, branch claims-example, commit 663f5450a9f9fe777a4c86ace274508782e12346), plus
  the harness fields harnesses, subjects, commands, record and safety. The record's id, its folder
  and file name, is the method's name.
type: object
additionalProperties: false
properties:
  methodType:
    description: What kind of method it is, such as test procedure or probe. Free text.
    type: string
    minLength: 1
  reportedIn:
    description: A link to the document that describes the method, when one exists.
    type: string
    x-ref: documents
  harnesses:
    description: Links to the harnesses a run can be made on.
    type: array
    minItems: 1
    items:
      type: string
      x-ref: harnesses
  subjects:
    description: Links to the subjects a run answers.
    type: array
    minItems: 1
    items:
      type: string
      x-ref: subjects
  commands:
    description: >-
      Shell steps per harness, run from the method's folder. The key is a harness's slug. Every
      path is relative to the folder: no home directory, no absolute path.
    type: object
    additionalProperties:
      type: array
      minItems: 1
      items: { type: string, minLength: 1 }
  record:
    description: What to write down from a run.
    type: array
    items: { type: string, minLength: 1 }
  safety:
    description: What a run touches beyond the folder, such as account-wide state.
    type: array
    items: { type: string, minLength: 1 }
  imported_from:
    description: >-
      The alpha identity this record was generated from. Present only on records written by
      import-alpha, which regenerates and retires records by it. Leave it off a record written by
      hand.
    type: string
    minLength: 1
---

# Methods

One record per method: a probe, the steps of a run anyone can repeat. A
[study result](../study-results/study-results.schema.md) of kind `run` names the method it followed
in `specifiedBy`, so many runs share one method.

A method is a record folder, `methods/<Name>/<Name>.md`. The Markdown body holds the steps. Files
the run needs sit beside the record, such as a `fixture/` folder.

The first two fields are the claims profile's. `harnesses`, `subjects`, `commands`, `record` and
`safety` are this corpus's own, taken from the alpha probes in `probes/`:

- `commands` has one entry per harness in `harnesses`, keyed by the harness's `slug`.
- `lint` refuses a command that names a home directory (`/Users/`, `/home/`, `~/` or `$HOME`).
