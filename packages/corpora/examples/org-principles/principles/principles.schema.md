---
$schema: https://json-schema.org/draft/2020-12/schema
title: Principle
description: >-
  One rule the organisation asks its projects to follow. The record's id, its file name, is the
  principle's short name.
type: object
required: [summary, since]
properties:
  summary:
    description: The principle in one sentence.
    type: string
    minLength: 1
  since:
    description: The date the organisation adopted the principle.
    type: string
    format: date
---

# Principles

One record per principle. `summary` states it in one sentence. The Markdown body says why it
holds and what following it looks like.

A project cites a principle from its own records. A principle does not list the projects that
follow it.
