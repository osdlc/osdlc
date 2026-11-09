---
$schema: https://json-schema.org/draft/2020-12/schema
title: Evidence
description: >-
  One observation of a harness, evidence/<harness>/<date> <name>.md: what a page said or a command
  printed, when we looked, and for which version.
type: object
additionalProperties: false
x-id-pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2} "
required: [kind, harness, observed, observed_by]
properties:
  kind:
    description: >-
      What was looked at: vendor docs, a changelog, source code, a command's help text, a run, an
      issue thread, a third party's page, or an inference from other evidence.
    enum: [docs, changelog, source, help-text, run, issue, third-party, inferred]
  reference:
    description: A link to the reference record for the page. Required when kind names a page.
    type: string
    x-ref: references
  harness:
    description: A link to the harness the observation is about.
    type: string
    x-ref: harnesses
  version:
    description: The harness version the observation holds for.
    type: string
    minLength: 1
  version_basis:
    description: >-
      How the version is known: exact (the source names it), inferred (from the date or context),
      or unknown.
    enum: [exact, inferred, unknown]
  observed:
    description: The date we looked. Not the page's own date.
    type: string
    format: date
  locator:
    description: >-
      Where in the reference: a section heading, a line range such as #L10-L20, or for help-text
      the command that was run.
    type: string
    minLength: 1
  excerpt:
    description: >-
      The quoted text, as a W3C Web Annotation TextQuoteSelector: the exact words, and the text
      just before and after them so a re-check can find the quote again.
    type: object
    additionalProperties: false
    required: [exact]
    properties:
      exact: { type: string, minLength: 1 }
      prefix: { type: string }
      suffix: { type: string }
  observed_by:
    description: Who looked. A person, or an agent with its model and session.
    type: string
    minLength: 1
dependentRequired:
  version: [version_basis]
if:
  properties: { kind: { enum: [docs, changelog, source, issue, third-party] } }
  required: [kind]
then:
  required: [reference]
---

# Evidence

One record per observation: what a page said, or what a command printed, on one date. A harness
fact is only as good as the evidence behind it. An evidence record states no conclusion. It records
what was seen, and claims built on it come later.

Records sit in one folder per harness, named after the harness record, such as
`evidence/Claude Code/2026-11-08 Claude Code overview.md`. The file name starts with the `observed`
date, then a short name, usually the reference's name. `harness` links to the same harness as the
folder.

This file's frontmatter is the schema. The rules below are the ones a description does not say
clearly.

- **Append only.** A record is not edited after it is written. A correction, or a later look that
  finds something different, is a new record. The validator does not enforce this; reviewers do.
- `reference` links to a [reference](../references/references.schema.md) record. It is required
  for `docs`, `changelog`, `source`, `issue` and `third-party`. `help-text` names its command in
  `locator` instead.
- `version` needs `version_basis`. A docs page rarely says which release it describes, so its
  version is usually `inferred`.
- `excerpt.exact` is the quoted text with its whitespace collapsed to single spaces. `prefix` and
  `suffix` hold about 32 characters either side, from the same text.
- `run` is reserved. Runs come with experiments, a later step, and will link to the experiment that
  produced them.
- No field stores a strength or confidence. How much a record counts follows from its `kind`.

`capture` (see the [README](../README.md)) writes these records from a fetched page.
