---
$schema: https://json-schema.org/draft/2020-12/schema
title: Milestone
description: >-
  A goal that a group of tasks reaches together. It builds on the planning profile's milestone and
  adds `beeline`. The record's id is a short slug, such as m-npm.
x-extends: plan/milestones
type: object
additionalProperties: false
x-id-pattern: "^m-[a-z0-9-]+$"
properties:
  title: true
  order: true
  tasks: true
  beeline:
    description: >-
      True for the milestones the work is heading for now. The explorer shows them first. Leave it
      out for the others.
    type: boolean
---

# Milestones

One record per milestone. It builds on `plan/milestones`, the milestone type of the planning
profile in `profiles/planning/`. The fields `title`, `order` and `tasks` come from there. The
profile's type also says how a milestone's status follows from its tasks. This type adds `beeline`
and an id pattern.

The body is the milestone's goal, in one or two sentences.
