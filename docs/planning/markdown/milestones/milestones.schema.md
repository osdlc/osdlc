---
$schema: https://json-schema.org/draft/2020-12/schema
title: Milestone
description: >-
  A goal that a group of tasks reaches together. The record's id is a short slug, such as m-npm.
type: object
additionalProperties: false
x-id-pattern: "^m-[a-z0-9-]+$"
required: [title, order, tasks]
properties:
  title:
    type: string
    minLength: 1
  order:
    description: Where the milestone comes in the plan. 1 comes first.
    type: integer
    minimum: 1
  beeline:
    description: >-
      True for the milestones the work is heading for now. The explorer shows them first. Leave it
      out for the others.
    type: boolean
  tasks:
    description: The milestone's tasks, in the order the work goes.
    type: array
    items: { type: string, x-ref: tasks }
---

# Milestones

One record per milestone. The body is the milestone's goal, in one or two sentences. A milestone
has no status of its own: it is done when all its tasks are done, in progress when any task is in
progress or done, and not started otherwise.
