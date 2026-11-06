---
type: Harness Fact
title: "Kiro: Plugin manifest validation"
description: "Plugin manifest validation in Kiro, as observed over time."
tags: [plugins]
harness: kiro
subject: plugins/manifest-validation
observations:
  - value:
      schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
    since: null
    until: null
    observed: "2026-11-05"
    source: kiro-create-powers
    locator: "Creating plugin.json: Required fields"
    evidence: docs
    note: "The Agent Plugins schema that a power's $schema must name; Kiro publishes no schema of its own."
open:
  - question: "What does Kiro do with an unknown or wrongly typed field in plugin.json? The docs say only that each power must have a valid plugin.json or POWER.md."
    observed: "2026-11-05"
    source: kiro-install-powers
  - question: "Does Kiro ship a validator? The docs point to the Power Builder for creating and converting powers but name no validate command."
    observed: "2026-11-05"
    source: kiro-create-powers
sources:
  - id: kiro-create-powers
    resource: "https://kiro.dev/docs/powers/create.md"
    title: "Kiro docs: Create powers"
  - id: kiro-install-powers
    resource: "https://kiro.dev/docs/powers/installation.md"
    title: "Kiro docs: Install powers"
---

What the sources say about [Plugin manifest validation](/subjects/plugins/manifest-validation.md)
in [Kiro](/harnesses/kiro.md).

## Observations

- 2026-11-05: schema: the Agent Plugins 1.0.0 schema.[^kiro-create-powers]

  > | `$schema` | Schema URL: `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` |

## Open questions

- Unknown and wrongly typed fields.[^kiro-install-powers]

  > Each power must have a valid `plugin.json` or `POWER.md` file at its package root.

- Whether a validator ships.[^kiro-create-powers]

[^kiro-create-powers]: Kiro docs: Create powers
[^kiro-install-powers]: Kiro docs: Install powers
