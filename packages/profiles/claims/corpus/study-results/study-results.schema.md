---
$schema: https://json-schema.org/draft/2020-12/schema
title: Study Result
description: >-
  One observation: what a document said, or what a run of a method found, on one occasion. VA-Spec
  class Study Result, without its focus field. The record's id, its file name, is a short name for
  the observation.
type: object
required: [contributions]
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

One record per observation. A study result records what was seen: what a document said, or what a
test run found. It states no conclusion. A [statement](../statements/statements.schema.md) makes the
claim, and cites study results as its evidence.

A study result has no field that says what it is about. That comes from the statements that cite
it, because one observation can count as evidence for statements about several things.

- `reportedIn` links to the [documents](../documents/documents.schema.md) the result came from. Use
  it for a result read from a page.
- `specifiedBy` links to the [method](../methods/methods.schema.md) that was followed. Use it for a
  result from a test run.
- `contributions` says who made the result, when, and in what role.
- Write the observation itself in the Markdown body: the quoted text, or what the run printed.

A result with files of its own, such as the script that ran and a CSV of its output, is a record
folder: `study-results/<Name>/<Name>.md` with the files beside it. Link to the files from the body.

Records can sit in subfolders, such as `study-results/linux/`, to group them. A subfolder is not
part of a record's id, so ids must be unique across the whole type.

The observation is not changed after it is written. A later look that finds something different is
a new record. The one allowed edit is a new entry in `contributions`, such as someone checking the
result again. The validator does not check this; reviewers do.
