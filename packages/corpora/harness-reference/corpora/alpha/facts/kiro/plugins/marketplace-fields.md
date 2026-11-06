---
type: Harness Fact
title: "Kiro: Marketplace fields"
description: "Marketplace fields in Kiro, as observed over time."
tags: [plugins]
harness: kiro
subject: plugins/marketplace-fields
observations: []
open:
  - question: "Is there an author-written catalog file for powers? The docs describe a Kiro-hosted registry and installs from a GitHub repository or folder, where each power sits in its own directory with its own plugin.json or POWER.md, but name no index file."
    observed: "2026-11-05"
    source: kiro-install-powers
sources:
  - id: kiro-install-powers
    resource: "https://kiro.dev/docs/powers/installation.md"
    title: "Kiro docs: Install powers"
---

What the sources say about [Marketplace fields](/subjects/plugins/marketplace-fields.md) in
[Kiro](/harnesses/kiro.md).

## Open questions

- Whether powers have an author-written catalog file. The docs name a registry hosted by Kiro and
  repository installs without an index.[^kiro-install-powers]

  > Browse powers from our official [registry](https://kiro.dev/powers) including Datadog, Dynatrace, Figma, Neon, Netlify, Postman, Supabase, Stripe, Strands SDK, and AWS Aurora.

  > Each power must have a valid `plugin.json` or `POWER.md` file at its package root. A single repository can contain multiple powers, each in its own directory.

[^kiro-install-powers]: Kiro docs: Install powers
