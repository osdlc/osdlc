---
$schema: https://json-schema.org/draft/2020-12/schema
title: Component
description: >-
  A package, crate, spec, profile, corpus, tool or app in the markdown ecosystem, today, in the
  target, or both. The record's id is a stable slug, such as markdown-link or markdown-link-rs.
type: object
additionalProperties: false
x-id-pattern: "^[a-z0-9-]+$"
required: [name, kind, language, layer, states, status]
properties:
  name:
    description: The package or crate name as published, or a plain name.
    type: string
    minLength: 1
  kind:
    enum: [package, crate, spec, profile, corpus, tool, app, workflow]
  language:
    enum: [ts, rust, yaml, markdown, none]
  layer:
    type: string
    x-ref: layers
  states:
    description: >-
      Where it exists: present (today), target (the plan's end state), or both. Present only means
      it goes away. Target only means it is new.
    type: array
    minItems: 1
    uniqueItems: true
    items: { enum: [present, target] }
  status:
    enum: [published, unpublished, in-progress, planned, retiring, proposal]
  version:
    description: The latest published version. Left out when it is not published.
    type: string
  registry:
    description: Its page on npm or crates.io. Left out when it is not published.
    type: string
    format: uri
  repo_present:
    description: The repo that holds it today. Left out when it is not in a repo today.
    type: string
    x-ref: repos
  path_present:
    description: Its folder in that repo today.
    type: string
  repo_target:
    description: The repo that holds it in the target.
    type: string
    x-ref: repos
  path_target:
    description: Its folder in that repo in the target.
    type: string
  twin:
    description: The same library in the other language. Both twins name each other.
    type: string
    x-ref: components
  tasks:
    description: The plan tasks that change it.
    type: array
    items: { type: string, x-ref: tasks }
  links:
    description: Pull requests, issues and pages about it, each a Markdown link to a URL.
    type: array
    items: { type: string, pattern: "^\\[.+\\]\\(https?://\\S+\\)$" }
  depends:
    description: "Components it depends on, in both states."
    type: array
    items: { type: string, x-ref: components }
  depends_new:
    description: "Components it depends on, in the target only."
    type: array
    items: { type: string, x-ref: components }
  depends_going:
    description: "Components it depends on, today only."
    type: array
    items: { type: string, x-ref: components }
  dev_depends:
    description: "Components it depends on for development, in both states."
    type: array
    items: { type: string, x-ref: components }
  dev_depends_new:
    description: "Components it depends on for development, in the target only."
    type: array
    items: { type: string, x-ref: components }
  dev_depends_going:
    description: "Components it depends on for development, today only."
    type: array
    items: { type: string, x-ref: components }
  implements:
    description: "Components it implements, in both states."
    type: array
    items: { type: string, x-ref: components }
  implements_new:
    description: "Components it implements, in the target only."
    type: array
    items: { type: string, x-ref: components }
  implements_going:
    description: "Components it implements, today only."
    type: array
    items: { type: string, x-ref: components }
  extends:
    description: "Components it extends, in both states."
    type: array
    items: { type: string, x-ref: components }
  extends_new:
    description: "Components it extends, in the target only."
    type: array
    items: { type: string, x-ref: components }
  extends_going:
    description: "Components it extends, today only."
    type: array
    items: { type: string, x-ref: components }
  validates:
    description: "Components it validates, in both states."
    type: array
    items: { type: string, x-ref: components }
  validates_new:
    description: "Components it validates, in the target only."
    type: array
    items: { type: string, x-ref: components }
  validates_going:
    description: "Components it validates, today only."
    type: array
    items: { type: string, x-ref: components }
  reads:
    description: "Components it reads, in both states."
    type: array
    items: { type: string, x-ref: components }
  reads_new:
    description: "Components it reads, in the target only."
    type: array
    items: { type: string, x-ref: components }
  reads_going:
    description: "Components it reads, today only."
    type: array
    items: { type: string, x-ref: components }
  edge_notes:
    description: >-
      One sentence on an edge above, or on the twin edge. `edge` names the field the edge is in, and
      `to` repeats the link.
    type: array
    items:
      type: object
      additionalProperties: false
      required: [edge, to, note]
      properties:
        edge:
          enum:
            - twin
            - depends
            - depends_new
            - depends_going
            - dev_depends
            - dev_depends_new
            - dev_depends_going
            - implements
            - implements_new
            - implements_going
            - extends
            - extends_new
            - extends_going
            - validates
            - validates_new
            - validates_going
            - reads
            - reads_new
            - reads_going
        to: { type: string }
        note: { type: string, minLength: 1 }
---

# Components

One record per component. The body starts with its purpose, in one or two plain sentences. A
`## Notes` section can follow, as a list of short facts.

Each kind of edge to another component has three fields. `depends` holds edges in both states,
`depends_new` edges in the target only, and `depends_going` edges that exist today only. The same
goes for `dev_depends`, `implements`, `extends`, `validates` and `reads`. An edge's states must be
in both components' states.

A twin pair needs no edge field. The Rust crate and the TypeScript package name each other in
`twin`, and the edge between them runs from the crate to the package.

An edge can carry a note in `edge_notes`. Overlaps, where two components do some of the same job,
are [overlap records](../overlaps/overlaps.schema.md), not edge fields.
