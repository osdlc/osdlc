---
type: Harness Fact
title: "Kiro: Plugin manifest fields"
description: "Plugin manifest fields in Kiro, as observed over time."
tags: [plugins]
harness: kiro
subject: plugins/manifest-fields
observations:
  - value:
      file: plugin.json
      fields:
        - { name: $schema, required: true, use: "the Agent Plugins 1.0.0 schema URL" }
        - { name: name, required: true, use: "plugin id, kebab-case; Kiro uses it internally to identify the power" }
        - { name: version, required: true, use: "semantic version of the power" }
        - { name: description, required: true, use: "short description; replaces the catalog value in the Installed list" }
        - { name: author, type: object, required: true, use: "author details; replaces the catalog value in the Installed list" }
        - { name: author.name, required: true, use: "not documented" }
        - { name: author.email, required: false, use: "not documented" }
        - { name: author.url, required: false, use: "not documented" }
        - { name: keywords, type: "string[]", required: true, use: "terms that activate the power when they appear in a prompt" }
        - { name: homepage, required: false, use: "not documented" }
        - { name: repository, required: false, use: "shown as a link only when HTTP or HTTPS; replaces the catalog value" }
        - { name: license, required: false, use: "not documented" }
    since: null
    until: null
    observed: "2026-11-05"
    source: kiro-create-powers
    locator: "Creating plugin.json: Required fields; Optional fields"
    evidence: docs
    note: "Powers follow the Agent Plugins format. The docs give no types except author (an object) and keywords (an array of strings), so the other fields carry no type. The legacy POWER.md format still loads."
  - value:
      installed_metadata: "in Kiro IDE 1.4.26 or later, a declared description, author, repository or keywords replaces the catalog value; an omitted field keeps it"
    since: null
    until: null
    observed: "2026-11-05"
    source: kiro-install-powers
    locator: "Install custom powers: From local path"
    evidence: docs
    note: "The IDE version is named in the docs, but Kiro's IDE and CLI carry separate version lines, so it is not recorded in since."
open:
  - question: "Kiro marks version, description, author and keywords required, which the Agent Plugins spec leaves optional. Does Kiro reject a plugin.json that omits them?"
    observed: "2026-11-05"
    source: kiro-create-powers
  - question: "Does Kiro read the Agent Plugins extensions field?"
    observed: "2026-11-05"
    source: kiro-create-powers
  - question: "Which front-matter fields does a legacy POWER.md take? The docs fetched do not list them."
    observed: "2026-11-05"
    source: kiro-install-powers
sources:
  - id: kiro-create-powers
    resource: "https://kiro.dev/docs/powers/create.md"
    title: "Kiro docs: Create powers"
  - id: kiro-install-powers
    resource: "https://kiro.dev/docs/powers/installation.md"
    title: "Kiro docs: Install powers"
---

What the sources say about [Plugin manifest fields](/subjects/plugins/manifest-fields.md) in
[Kiro](/harnesses/kiro.md).

Kiro's docs mark more fields required than the [Agent Plugins](/harnesses/agent-plugins.md) spec
does. The spec requires only `$schema` and `name`.

## Observations

- 2026-11-05: file: `plugin.json`; required: `$schema`, `name`, `version`, `description`,
  `author` (`name`, with `email` and `url` allowed), `keywords`; optional: `homepage`,
  `repository`, `license`.[^kiro-create-powers]

  > Every power needs a `plugin.json` manifest.

  > | `$schema` | Schema URL: `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` |
  > | `name` | Plugin identifier (kebab-case, no spaces). Used internally by Kiro to identify the power. |
  > | `version` | Semantic version of the power (e.g., `1.0.0`). |
  > | `description` | Short description of what the power does. |
  > | `author` | Object with at minimum a `name` field. Can also include `email` and `url`. |
  > | `keywords` | Array of strings that trigger activation. Use terms that match how developers talk about your tool. |

  > You can also include these fields in your manifest:
  >
  > ```json
  > ...
  >   "homepage": "https://supabase.com/docs",
  >   "repository": "https://github.com/supabase/kiro-power",
  >   "license": "Apache-2.0"
  > ```

- 2026-11-05: manifest values replace catalog values in the IDE's Installed list.[^kiro-install-powers]

  > In Kiro IDE 1.4.26 or later, the Installed list and the power's details view show metadata from the installed power's manifest. Kiro reads `plugin.json` when it is present; otherwise, it reads `POWER.md` front matter. A declared description, author, repository, or keywords value replaces the catalog value. A field the manifest omits keeps the catalog value. Kiro shows a repository link only when it uses HTTP or HTTPS.

## Open questions

- Whether Kiro rejects a manifest missing the fields it marks required.[^kiro-create-powers]
- Whether Kiro reads `extensions`.[^kiro-create-powers]
- The front-matter fields of a legacy `POWER.md`.[^kiro-install-powers]

[^kiro-create-powers]: Kiro docs: Create powers
[^kiro-install-powers]: Kiro docs: Install powers
