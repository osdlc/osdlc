---
$schema: https://json-schema.org/draft/2020-12/schema
title: Task
description: >-
  One piece of work in a plan. The record's id is the task number, a space and a short name, such
  as "12 Add search".
type: object
x-id-pattern: "^[0-9]+ \\S"
required: [number, title, status]
properties:
  number:
    description: The task number. It never changes, and the record's id starts with it.
    type: integer
    minimum: 1
  title:
    description: A short name, two or three words.
    type: string
    minLength: 1
  status:
    description: Where the task is. The `title` of each value is the label people see.
    oneOf:
      - { const: done, title: done }
      - { const: doing, title: in progress }
      - { const: owner, title: waiting on owner }
      - { const: todo, title: not started }
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
stands.

The type is open: a record may hold fields this schema does not list. A corpus that wants a closed
task type lists every field in its own type and sets `additionalProperties: false` there.
