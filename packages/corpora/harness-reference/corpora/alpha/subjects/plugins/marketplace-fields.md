---
type: Subject
title: Marketplace fields
description: "Every field of the marketplace catalog, top level and per plugin entry: its type, whether it is required, and what the harness does with it."
order: 50
tags: [plugins]
---

Every field of the marketplace catalog file, at its top level and in each `plugins[]` entry: its
type, whether it is required, and what the harness does with it. Nested objects are listed field by
field, as `owner.name`, `metadata.pluginRoot` or `plugins[].source`.

A fact's `value` holds `file`, the catalog's path, and two lists, `fields` (top level) and
`entry_fields` (one `plugins[]` entry). Each list entry has the same keys as in
[Plugin manifest fields](/subjects/plugins/manifest-fields.md): `name`, `type`, `required`, `use`
and an optional `note`. A source object's forms (such as `github`, `url`, `git-subdir`, `npm`) go in
`source_forms`.

The fact for a harness with no marketplace catalog says `applicable: false`. Whether a harness has a
marketplace at all is the [Marketplace](/subjects/plugins/marketplace.md) subject.

Part of the [Plugins and marketplaces](/categories/plugins.md) category. Each harness's observations
for this subject are in `facts/<harness>/plugins/marketplace-fields.md`.
