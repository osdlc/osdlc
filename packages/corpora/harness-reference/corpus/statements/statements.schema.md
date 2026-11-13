---
$schema: https://json-schema.org/draft/2020-12/schema
title: Statement
description: >-
  A claim about one harness and one subject, the evidence lines that support or dispute it, and how
  far the evidence backs it. VA-Spec class Statement, from the claims profile (osdlc/markdown,
  branch claims-example, commit 663f5450a9f9fe777a4c86ace274508782e12346), plus the harness fields harness, subject, scope, status and
  supersedes. The record's id, its file name, is a short name for the claim.
type: object
additionalProperties: false
required: [proposition, direction, contributions, harness, subject, scope, status]
properties:
  proposition:
    description: >-
      The possible fact the statement assesses, as subject, predicate and object. Here the subject
      is a link to the harness, the predicate is the subject's slug, and the object is the value,
      checked against the subject's valueSchema.
    type: object
    required: [subject, predicate, object]
    properties:
      subject:
        description: A link to the harness the claim is about.
        type: string
        minLength: 1
      predicate:
        description: The slug of the subject the claim answers, such as cli/session-env.
        type: string
        minLength: 1
      object:
        description: The value the harness has for the subject.
        type: [string, number, boolean, object, array]
  direction:
    description: Whether the statement holds the proposition true (supports), false (disputes), or neither.
    enum: [supports, neutral, disputes]
  strength:
    description: >-
      How strongly the statement supports or disputes the proposition. Required unless direction is
      neutral, and not allowed when it is.
    $ref: "#/$defs/strength"
  hasEvidenceLines:
    description: The lines of evidence the statement weighs.
    type: array
    minItems: 1
    items: { $ref: "#/$defs/evidenceLine" }
  specifiedBy:
    description: A link to the method followed to weigh the evidence, when there is one.
    type: string
    x-ref: methods
  reportedIn:
    description: Links to documents where the statement is published.
    type: array
    minItems: 1
    items:
      type: string
      x-ref: documents
  contributions:
    description: Who made or checked the statement, when, and in what role. The first one made it.
    type: array
    minItems: 1
    items: { $ref: "#/$defs/contribution" }
  harness:
    description: A link to the harness the claim is about. Repeats proposition.subject; lint keeps them equal.
    type: string
    x-ref: harnesses
  subject:
    description: A link to the subject the claim answers. Repeats proposition.predicate; lint keeps them equal.
    type: string
    x-ref: subjects
  scope:
    description: Where the claim holds. A null or empty field means it is not limited by it.
    type: object
    additionalProperties: false
    required: [since, until, platform, model]
    properties:
      since:
        description: The first harness version it holds in, or null when no source names one.
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
      model:
        description: The model it was observed with. Only on a model_dependent subject.
        type: [string, "null"]
        minLength: 1
  status:
    description: >-
      current (holds now), superseded (a later statement replaced it), disputed (evidence disagrees)
      or open (only questions the sources leave unresolved, with no value).
    enum: [current, superseded, disputed, open]
  supersedes:
    description: A link to the statement this one replaced, which has status superseded.
    type: string
    x-ref: statements
  open:
    description: Questions the sources leave unresolved about this claim, one sentence each.
    type: array
    items: { type: string, minLength: 1 }
  imported_from:
    description: >-
      The alpha-corpus identity this record was imported from (`fact:...`, `probe:...`), kept as
      provenance. The alpha corpus is deleted. Leave it off new records.
    type: string
    minLength: 1
if:
  properties: { direction: { const: neutral } }
then:
  properties: { strength: false }
else:
  required: [strength]
$defs:
  strength:
    description: A three-step scale. VA-Spec leaves the scale to each profile.
    enum: [strong, moderate, weak]
  evidenceLine:
    description: >-
      One argument for or against the proposition, built on one or more study results. VA-Spec
      class Evidence Line.
    type: object
    required: [hasEvidenceItems, directionOfEvidenceProvided]
    properties:
      hasEvidenceItems:
        description: >-
          Links to the study results this line rests on. Each one must be a relative Markdown link
          into the study-results folder. After the folder name, no part of the path may start with
          a dot, and the path may not hold an encoded dot or slash (%2E, %2F), so a link cannot
          step back out of the folder. The link may not point at the type's schema file. The
          pattern has two gaps that wait for nested x-ref: a link to a file in a record folder that
          is not the record still passes, and a link that leaves the corpus only warns. `lint`
          closes both.
        type: array
        minItems: 1
        items:
          type: string
          pattern: "\\]\\((\\.\\./)+study-results/(?!\\.|study-results\\.schema\\.md\\)|[^)]*(/\\.|%2[EeFf]))[^)]+\\.md\\)$"
      directionOfEvidenceProvided:
        description: Whether the line supports or disputes the proposition, or neither.
        enum: [supports, neutral, disputes]
      strengthOfEvidenceProvided:
        description: >-
          How strongly the line supports or disputes the proposition. Required unless the direction
          is neutral, and not allowed when it is.
        $ref: "#/$defs/strength"
      description:
        description: Why the study results count as evidence in this direction, in a sentence or two.
        type: string
        minLength: 1
    if:
      properties: { directionOfEvidenceProvided: { const: neutral } }
    then:
      properties: { strengthOfEvidenceProvided: false }
    else:
      required: [strengthOfEvidenceProvided]
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

# Statements

One record per claim about one harness and one subject, in one scope. A statement holds the
proposition (the harness, the subject and the value), its evidence lines, and its verdict. The first
seven fields are the claims profile's. `harness`, `subject`, `scope`, `status`, `supersedes` and `open`
are this corpus's own.

Records sit in one folder per harness: `statements/Claude Code/Session environment.md`. When a
harness has several statements for one subject, each for a different scope, the later ones add the
scope to the name.

- **The proposition.** `subject` links the harness, `predicate` is the subject's `slug`, and
  `object` is the value. `object` is checked against the subject's `valueSchema`.
- **`harness` and `subject` repeat the proposition.** corpus-schema allows `x-ref` only on
  top-level fields, so the two links are repeated where the validator checks them. `lint` keeps
  them equal to the proposition's. They collapse into the proposition once nested `x-ref` lands.
- **`scope`.** `since` is inclusive and `until` is exclusive, in the harness's own version
  spelling. `model` is allowed only on a `model_dependent` subject.
- **`status`.** One `current` statement per harness, subject and scope cell. A `superseded` one is
  linked from the statement that replaced it, in `supersedes`. `disputed` means study results
  disagree on a key in the same scope: the statement keeps the latest value and a `disputes`
  evidence line for each older, differing result. `open` is a claim with no value yet: direction
  `neutral`, no strength, and the object is `{ open: [questions] }`.
- **`open`.** The questions the sources leave unresolved. Any statement may carry them.
- **`strength`.** It follows the best evidence kind on a supporting line: run, source and
  help-text are strong; docs and changelog are moderate; issue, third-party and inferred are weak.
  The statement takes its strongest supporting line, one step lower when any line disputes it. A
  reviewer may lower a strength, never raise it past the rule; `lint` refuses a strength above it.
- Each link in `hasEvidenceItems` points at a [study result](../study-results/study-results.schema.md).
  The pattern checks the folder; `lint` checks the target is a record.

Use the Markdown body to explain the verdict in plain words.
