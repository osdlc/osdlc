---
$schema: https://json-schema.org/draft/2020-12/schema
title: Milestone
description: >-
  A goal that a group of tasks reaches together. It builds on the planning profile's milestone and
  adds `phase` and `beeline`. The record's id is a short slug, such as m-npm.
x-extends: plan/milestones
type: object
additionalProperties: false
x-id-pattern: "^m-[a-z0-9-]+$"
required: [phase]
properties:
  phase:
    description: >-
      The part of the ecosystem the milestone builds. Decision D13 says how the parts fit. The
      `title` of each value is the label people see.
    oneOf:
      - const: store
        title: Store
        description: >-
          The store specs and their tools: corpus-schema, the Markdown corpus model, and the
          packages that read, query and render a corpus.
      - const: model
        title: Model
        description: >-
          The model above the stores: packs, the bindings that map each kind to a store, and the
          profiles generated from packs.
      - const: harness
        title: Harness
        description: >-
          Knowledge about agent harnesses, kept as records: harness-reference and the evidence it
          gathers.
  beeline:
    description: >-
      True for the milestones the work is heading for now. The explorer shows them first. Leave it
      out for the others.
    type: boolean
---

# Milestones

One record per milestone. The type builds on `plan/milestones`, the planning profile's milestone
type in `docs/planning/markdown/profile/`, which says how a milestone's status follows from its
tasks. As in tasks, `additionalProperties: false` admits the profile's fields and the ones listed
here.

Every milestone names its `phase`. The explorer colours its cards by phase.

The body is the milestone's goal, in one or two sentences.
