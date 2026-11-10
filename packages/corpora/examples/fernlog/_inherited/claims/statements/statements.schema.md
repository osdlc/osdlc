---
$schema: https://json-schema.org/draft/2020-12/schema
title: Statement
description: >-
  A claim, the evidence lines that support or dispute it, and how far the evidence backs it. VA-Spec
  class Statement, with its Proposition and Evidence Lines held inline. The record's id, its file
  name, is a short name for the claim.
type: object
required: [proposition, direction, contributions]
properties:
  proposition:
    description: >-
      The possible fact the statement assesses, as subject, predicate and object. VA-Spec class
      Proposition. A corpus may add its own fields, such as a qualifier.
    type: object
    required: [subject, predicate, object]
    properties:
      subject:
        description: >-
          What the claim is about. Plain text, a slug, or a link to a record of the corpus's own
          types.
        type: string
        minLength: 1
      predicate:
        description: How the subject relates to the object, such as "reads config from".
        type: string
        minLength: 1
      object:
        description: >-
          What the subject is related to, or the value it has. Any JSON value except null: text, a
          number, true or false, an object or a list. The corpus decides its shape.
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
      class Evidence Line. A corpus may add its own fields, such as a qualifier.
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
          is not the record still passes, and a link that leaves the corpus only warns.
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

One record per claim. A statement holds three things.

- The proposition: the claim itself, as a subject, a predicate and an object. "fernlog 2.3" (the
  subject) "reads config from" (the predicate) "~/.config/fernlog/config.toml" (the object).
- Its evidence lines. Each line names one or more
  [study results](../study-results/study-results.schema.md), says whether they support or dispute
  the proposition, and how strongly.
- Its verdict: `direction` and `strength` say where the statement comes down once every line is
  weighed.

A statement can have lines that disagree. That is the point of keeping them: a reader sees both
sides and the reason for the verdict.

Evidence lines live inside the statement, not as records of their own. A line has no meaning apart
from the statement it argues for.

The rules a description does not say clearly:

- `strength` uses the scale strong, moderate, weak, on both the statement and its lines. A neutral
  direction has no strength.
- Each link in `hasEvidenceItems` must resolve, as every link in a record must. The field cannot use
  `x-ref` yet, because corpus-schema v0 allows `x-ref` only on top-level fields. Until it can, a
  pattern checks that each link points into the `study-results` folder, does not step back out of
  it with `..`, and does not point at `study-results.schema.md`. The pattern cannot catch two
  things. A link to another `.md` file inside a record folder, such as
  `study-results/linux/Linux probe/notes.md`, passes, though that file is not a record. A link
  that climbs above the corpus, such as `../../study-results/x.md`, gets only a warning from the
  validator. Both are fixed when `x-ref` works in nested objects (plan task 31).
- `subject` may link to a record of a type the corpus adds itself, such as a `tools` type. The
  claims types do not define one. The validator checks that the link resolves, but not what type
  it points at, because `x-ref` does not work inside the proposition yet.
- `object` can be any value except null, including an object or a list. The claims types do not
  say what shape it has. That is up to the corpus.
- A statement, its proposition and its evidence lines accept fields the schema does not list. A
  corpus adds the fields its own kind of claim needs. The validator does not check an unlisted
  field. A contribution and its contributor accept no other fields.

Use the Markdown body to explain the verdict in plain words.
