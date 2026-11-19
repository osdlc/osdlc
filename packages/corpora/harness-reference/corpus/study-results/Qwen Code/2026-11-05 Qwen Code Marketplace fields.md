---
kind: source
reportedIn:
  - "[QwenLM qwen-code claude-converter.ts at 1bac51b](../../documents/github.com/QwenLM%20qwen-code%20claude-converter.ts%20at%201bac51b.md)"
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
observed: 2026-11-05
locator: packages/core/src/extension/claude-converter.ts:96-120, 520-530, 1048-1060, 1121-1127, 1150-1300; sourceRegistry.ts:105-123, 222-245 at 1bac51b7d9e28d5c0f7d9a0a6fcd3add14443ebb
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/marketplace-fields@qwen-code#observation-1
---

Imported from `facts/qwen-code/plugins/marketplace-fields.md`, observation 1.

- file: ".claude-plugin/marketplace.json"
- fields: [{"name":"name","type":"string","required":true,"use":"marketplace name shown in Discover"},{"name":"owner.name","type":"string","required":false,"use":"not documented","note":"Declared non-optional in the TS type; not checked at load."},{"name":"owner.email","type":"string","required":false,"use":"not documented","note":"Declared non-optional in the TS type; not checked at load."},{"name":"plugins","type":"array","required":true,"use":"plugin entries"},{"name":"metadata.description","type":"string","required":false,"use":"not documented"},{"name":"metadata.version","type":"string","required":false,"use":"not documented"},{"name":"metadata.pluginRoot","type":"string","required":false,"use":"declared in the type; relative sources resolve from the marketplace directory, not from it"}]
- entry_fields: [{"name":"name","type":"string","required":true,"use":"plugin name; the part after : in an install spec"},{"name":"source","type":"string | object","required":true,"use":"where the plugin comes from; a string is a relative path or an http(s) git URL"},{"name":"source.repo","type":"string","required":"conditional","use":"GitHub owner/repo","note":"For source github."},{"name":"source.url","type":"string","required":"conditional","use":"git URL","note":"For source url and git-subdir."},{"name":"source.path","type":"string","required":"conditional","use":"subdirectory in the repository","note":"For source git-subdir."},{"name":"source.ref","type":"string","required":false,"use":"git ref (git-subdir)"},{"name":"source.sha","type":"string","required":false,"use":"git commit, used before ref (git-subdir)"},{"name":"strict","type":"boolean","required":false,"use":"true requires the plugin's own plugin.json; default false merges the entry with it"},{"name":"category","type":"string","required":false,"use":"shown in Discover"},{"name":"tags","type":"string[]","required":false,"use":"not documented"},{"name":"description","type":"string","required":false,"use":"shown in Discover"},{"name":"version","type":"string","required":false,"use":"shown in Discover"},{"name":"author.name","type":"string","required":false,"use":"shown in Discover"},{"name":"homepage","type":"string","required":false,"use":"shown in Discover"},{"name":"lastUpdated","type":"string","required":false,"use":"shown in Discover; also read as updatedAt or updated"},{"name":"installs","type":"number","required":false,"use":"shown in Discover; also read as installCount or downloads"}]
- other_entry_fields: "an entry also takes every Claude plugin.json field, merged into the converted manifest"
- source_forms: ["relative path string","http(s) URL string","github","url","git-subdir"]
