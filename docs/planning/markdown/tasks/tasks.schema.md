---
$schema: https://json-schema.org/draft/2020-12/schema
title: Task
description: >-
  One piece of work in the plan. The record's id is the task number, a space and a short name,
  such as "27 Org corpora".
type: object
additionalProperties: false
x-id-pattern: "^[0-9]+ \\S"
required: [number, title, detail, status, type, milestone]
properties:
  number:
    description: The task number. It never changes, and the record's id starts with it.
    type: integer
    minimum: 1
  title:
    description: A short name, two or three words.
    type: string
    minLength: 1
  detail:
    description: A few words under the title, such as the pull request that does the work.
    type: string
  status:
    description: Where the task is. The `title` of each value is the label people see.
    oneOf:
      - { const: done, title: done }
      - { const: doing, title: in progress }
      - { const: owner, title: waiting on owner }
      - { const: todo, title: not started }
  type:
    description: What kind of work it is. The `title` of each value is the label people see.
    oneOf:
      - const: functional
        title: Functional
        description: >-
          Changes what the ecosystem is or does: spec rules, packages, crates, profiles, corpora,
          examples, and other repos adopting them.
      - const: supporting
        title: Supporting
        description: >-
          Builds, checks, releases or documents those things without changing them.
  milestone:
    description: The milestone the task belongs to.
    type: string
    x-ref: milestones
  after:
    description: The tasks that must come first.
    type: array
    items: { type: string, x-ref: tasks }
---

# Tasks

One record per task. The body is the task's plan: what it does, what it waits on and where it
stands. The task must also be listed in its milestone's `tasks`.
