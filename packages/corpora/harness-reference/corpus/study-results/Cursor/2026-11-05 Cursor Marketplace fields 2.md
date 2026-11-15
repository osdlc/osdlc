---
kind: source
reportedIn:
  - "[cursor plugins marketplace.schema.json](../../documents/github.com/cursor%20plugins%20marketplace.schema.json.md)"
harness: "[Cursor](../../harnesses/Cursor.md)"
observed: 2026-11-05
locator: schemas/marketplace.schema.json:1-115 at 2776ddd2355d6d6c8747d3964600f28daf62f049
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/marketplace-fields@cursor#observation-2
---

Imported from `facts/cursor/plugins/marketplace-fields.md`, observation 2.

- schema_file: ".cursor-plugin/marketplace.json"
- schema_fields: [{"name":"name","type":"string","required":true,"use":"marketplace id"},{"name":"owner","type":"object","required":false,"use":"marketplace owner or organisation"},{"name":"owner.name","type":"string","required":"conditional","use":"owner name","note":"Required when owner is set."},{"name":"owner.email","type":"string","required":false,"use":"contact email; format email"},{"name":"metadata","type":"object","required":false,"use":"arbitrary metadata; extra keys allowed"},{"name":"metadata.description","type":"string","required":false,"use":"short marketplace description"},{"name":"plugins","type":"array","required":true,"use":"plugins in the marketplace"}]
- schema_entry_fields: [{"name":"name","type":"string","required":true,"use":"plugin id matching the name in its plugin.json"},{"name":"source","type":"string","required":true,"use":"plugin directory relative to the marketplace root, or a remote URL"},{"name":"description","type":"string","required":false,"use":"short plugin description"},{"name":"minClientVersions","type":"object","required":false,"use":"minimum client versions to install, keyed by client id"}]

The schema the official cursor/plugins marketplace repository checks in CI. Entries are closed (additionalProperties false), so the docs' other entry fields fail it.
