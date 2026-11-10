---
kind: docs
reportedIn:
  - "[Kiro docs Create powers](../../documents/kiro.dev/Kiro%20docs%20Create%20powers.md)"
harness: "[Kiro](../../harnesses/Kiro.md)"
observed: 2026-11-05
locator: "Creating plugin.json: Required fields; Optional fields"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@kiro#observation-1
---

Imported from `facts/kiro/plugins/manifest-fields.md`, observation 1.

- file: "plugin.json"
- fields: [{"name":"$schema","required":true,"use":"the Agent Plugins 1.0.0 schema URL"},{"name":"name","required":true,"use":"plugin id, kebab-case; Kiro uses it internally to identify the power"},{"name":"version","required":true,"use":"semantic version of the power"},{"name":"description","required":true,"use":"short description; replaces the catalog value in the Installed list"},{"name":"author","type":"object","required":true,"use":"author details; replaces the catalog value in the Installed list"},{"name":"author.name","required":true,"use":"not documented"},{"name":"author.email","required":false,"use":"not documented"},{"name":"author.url","required":false,"use":"not documented"},{"name":"keywords","type":"string[]","required":true,"use":"terms that activate the power when they appear in a prompt"},{"name":"homepage","required":false,"use":"not documented"},{"name":"repository","required":false,"use":"shown as a link only when HTTP or HTTPS; replaces the catalog value"},{"name":"license","required":false,"use":"not documented"}]

Powers follow the Agent Plugins format. The docs give no types except author (an object) and keywords (an array of strings), so the other fields carry no type. The legacy POWER.md format still loads.
