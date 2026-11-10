---
$schema: https://json-schema.org/draft/2020-12/schema
title: Task
description: >-
  One piece of work in the plan. It builds on the planning profile's task and adds `detail` and
  `type`.
x-extends: plan/tasks
type: object
additionalProperties: false
required: [detail, type, milestone]
properties:
  number: true
  title: true
  status: true
  milestone: true
  after: true
  detail:
    description: A few words under the title, such as the pull request that does the work.
    type: string
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
---

# Tasks

One record per task. The type builds on `plan/tasks`, the planning profile's task type in
`profiles/planning/`. The profile's fields are listed as `true` so that
`additionalProperties: false` admits them and nothing else.

The body is the task's plan: what it does, what it waits on and where it stands. The task must also
be listed in its milestone's `tasks`.
