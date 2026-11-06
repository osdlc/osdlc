---
type: Subject
title: Plugin manifest fields
description: "Every top-level field the plugin manifest takes: its type, whether it is required, and what the harness does with it."
order: 49
tags: [plugins]
---

Every top-level field the plugin manifest takes: its type, whether it is required, and what the
harness does with it. Nested objects such as Codex `interface` or Pi's `package.json` `pi` block are
listed field by field, as `interface.displayName` or `pi.skills`.

A fact's `value` holds `fields`, a list with one entry per field:

- `name`: the field, as the manifest spells it.
- `type`: the JSON type the source gives, such as `string`, `object`, `string | string[]`.
- `required`: `true`, `false`, or `"conditional"` with the condition in `note`.
- `use`: what the harness does with the field, in a few words.
- `note`: optional.

The fact for a harness with no plugin manifest says `applicable: false`. Where the manifest file
lives is the [Plugin manifest](/subjects/plugins/manifest.md) subject.

Part of the [Plugins and marketplaces](/categories/plugins.md) category. Each harness's observations
for this subject are in `facts/<harness>/plugins/manifest-fields.md`.
