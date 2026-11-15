---
kind: source
reportedIn:
  - "[anomalyco opencode plugin host.ts at 32ece82](../../documents/github.com/anomalyco%20opencode%20plugin%20host.ts%20at%2032ece82.md)"
harness: "[OpenCode](../../harnesses/OpenCode.md)"
observed: 2026-11-05
locator: packages/plugin/src/host.ts:25-92 at 32ece823b820702961a7538ff02891f3791615c2
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/manifest-fields@opencode#observation-1
---

Imported from `facts/opencode/plugins/manifest-fields.md`, observation 1.

- file: "package.json"
- fields: [{"name":"name","type":"string","required":"conditional","use":"package name; resolves exports for a local directory, and is the id of a plugin with no server part","note":"A local directory is resolved through package.json only when both name and exports are set; otherwise OpenCode uses root file names."},{"name":"exports","type":"object","required":"conditional","use":"maps the plugin parts to files","note":"See name."},{"name":"exports[\".\"]","type":"string","required":false,"use":"server part, also read as exports[\"./server\"]"},{"name":"exports[\"./server\"]","type":"string","required":false,"use":"server part; tried before \".\""},{"name":"exports[\"./tui\"]","type":"string","required":false,"use":"terminal UI part"},{"name":"exports[\"./rpc\"]","type":"string","required":false,"use":"typed RPC contract the other parts call"},{"name":"exports[\"./gui-experimental\"]","type":"string","required":false,"use":"prebuilt CommonJS bundle for OpenCode Desktop; must end in .js or .cjs"}]
- fallback_files: "server (else index), tui, rpc with .ts, .tsx or .js; gui-experimental.cjs or gui-experimental.js"
- plugin_id: "set by Plugin.define in the server part, not by the manifest"
