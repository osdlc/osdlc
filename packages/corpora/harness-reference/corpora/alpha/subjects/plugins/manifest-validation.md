---
type: Subject
title: Plugin manifest validation
description: "What the harness does with a plugin or marketplace manifest field it does not know, or one with a wrong type, and whether it ships a validator."
order: 49
tags: [plugins]
---

What the harness does with a plugin or marketplace manifest field it does not know, or one with a
wrong type, and whether it ships a validator or a published JSON Schema.

A fact's `value` uses these keys where the sources answer them:

- `unknown_fields`: `ignored`, `warned` or `rejected`.
- `invalid_fields`: what a known field with a wrong type or value does, such as `plugin not loaded`.
- `validator`: a command or tool that checks a manifest.
- `schema`: the URL of a published JSON Schema.

Part of the [Plugins and marketplaces](/categories/plugins.md) category. Each harness's observations
for this subject are in `facts/<harness>/plugins/manifest-validation.md`.
