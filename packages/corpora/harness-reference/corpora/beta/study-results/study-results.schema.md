---
$schema: https://json-schema.org/draft/2020-12/schema
title: Study Result
description: >-
  One observation of a harness: what a document said, or what a run of a method found, on one
  occasion. VA-Spec class Study Result, from the claims profile (osdlc/markdown, branch
  claims-example, commit 663f5450a9f9fe777a4c86ace274508782e12346), plus the harness fields kind, harness, version, version_basis,
  observed, locator and excerpt. The record's id, its file name, is the date and a short name.
type: object
additionalProperties: false
x-id-pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2} "
required: [contributions, kind, harness, observed]
properties:
  specifiedBy:
    description: A link to the method that was followed to get this result.
    type: string
    x-ref: methods
  reportedIn:
    description: Links to the documents the result was read from or is reported in.
    type: array
    minItems: 1
    items:
      type: string
      x-ref: documents
  contributions:
    description: Who made or checked the result, when, and in what role. The first one made it.
    type: array
    minItems: 1
    items: { $ref: "#/$defs/contribution" }
  ancillaryResults:
    description: >-
      Small result values worth reading at a glance, as named fields. Full result data goes in a
      file in the record folder.
    type: object
  qualityMeasures:
    description: >-
      Facts about how the result was made that affect how far to trust it, such as the tool version,
      the operating system or the number of runs.
    type: object
  kind:
    description: >-
      What was looked at: vendor docs, a changelog, source code, a command's help text, a run of a
      method, an issue thread, a third party's page, or an inference from other study results.
    enum: [docs, changelog, source, help-text, run, issue, third-party, inferred]
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
      Where in the document: a section heading, a line range such as #L10-L20, or for help-text
      the command that was run.
    type: string
    minLength: 1
  imported_from:
    description: >-
      The alpha identity this record was generated from. Present only on records written by
      import-alpha, which regenerates and retires records by it. Leave it off a record written by
      hand.
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
dependentRequired:
  version: [version_basis]
allOf:
  - if:
      properties: { kind: { enum: [docs, changelog, source, issue, third-party] } }
      required: [kind]
    then:
      required: [reportedIn]
  - if:
      properties: { kind: { const: run } }
      required: [kind]
    then:
      required: [specifiedBy]
$defs:
  contribution:
    description: One action an agent took on the record. VA-Spec class Contribution.
    type: object
    additionalProperties: false
    required: [contributor, activityType, date]
    properties:
      contributor:
        description: Who acted. VA-Spec class Agent.
        type: object
        additionalProperties: false
        required: [name, agentType]
        properties:
          name: { type: string, minLength: 1 }
          agentType: { enum: [person, organization, software] }
      activityType:
        description: What they did, or the role they played, such as created, verified or disputed.
        type: string
        minLength: 1
      date:
        description: When they did it, as an ISO 8601 date and time.
        type: string
        format: date-time
---

# Study results

One record per observation: what a document said, or what a run of a method printed, on one date.
A harness fact is only as good as the study results behind it. A study result states no
conclusion. A [statement](../statements/statements.schema.md) makes the claim and cites study
results as its evidence.

Records sit in one folder per harness, named after the harness record, such as
`study-results/Claude Code/2026-11-08 Claude Code overview.md`. The file name starts with the
`observed` date, then a short name. `harness` links to the same harness as the folder.

This file's frontmatter is the schema. The first five fields are the claims profile's. `kind`,
`harness`, `version`, `version_basis`, `observed`, `locator` and `excerpt` are this corpus's own.
The rules below are the ones a description does not say clearly.

- **Append only.** A record is not edited after it is written, except to add a `contributions`
  entry. A correction, or a later look that finds something different, is a new record. The
  validator does not enforce this; reviewers do.
- `reportedIn` links to [document](../documents/documents.schema.md) records. It is required for
  `docs`, `changelog`, `source`, `issue` and `third-party`. `help-text` names its command in
  `locator` instead.
- `run` links its [method](../methods/methods.schema.md) in `specifiedBy`. The method lists the
  harness; `lint` checks that. The run's output goes in the body, or in a file in a record folder.
- `inferred` is a conclusion drawn from other study results. Name them in the body.
- `version` needs `version_basis`. A docs page rarely says which release it describes, so its
  version is usually `inferred`.
- `excerpt.exact` is the quoted text with its whitespace collapsed to single spaces. `prefix` and
  `suffix` hold about 32 characters either side, from the same text.
- No field stores a strength or confidence. How much a record counts follows from its `kind`; the
  statement that cites it sets the strength.

`capture` (see the [README](../README.md)) writes these records from a fetched page.
