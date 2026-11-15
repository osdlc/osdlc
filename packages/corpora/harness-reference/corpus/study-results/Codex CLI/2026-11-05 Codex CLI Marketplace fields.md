---
kind: source
reportedIn:
  - "[openai codex marketplace.rs at a037e65](../../documents/github.com/openai%20codex%20marketplace.rs%20at%20a037e65.md)"
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
observed: 2026-11-05
locator: codex-rs/core-plugins/src/marketplace.rs:20-25, 166-185, 1004-1079, 1104-1172 at a037e65ead8f6789f960e9450bfe6af5a87a0053
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
imported_from: fact:plugins/marketplace-fields@codex#observation-1
---

Imported from `facts/codex/plugins/marketplace-fields.md`, observation 1.

- file: ".agents/plugins/marketplace.json"
- also_read: [".agents/plugins/api_marketplace.json",".claude-plugin/marketplace.json",".cursor-plugin/marketplace.json"]
- fields: [{"name":"name","type":"string","required":true,"use":"marketplace id; the part after @ in plugin-name@marketplace-name"},{"name":"interface.displayName","type":"string","required":false,"use":"marketplace title in the plugin browser"},{"name":"plugins","type":"array","required":true,"use":"the plugin entries"}]
- entry_fields: [{"name":"name","type":"string","required":true,"use":"plugin id within the marketplace"},{"name":"source","type":"string | object","required":true,"use":"where the plugin is installed from; a string is a local path"},{"name":"source.source","type":"string","required":true,"use":"source kind: local, url, git-subdir or npm"},{"name":"source.path","type":"string","required":"conditional","use":"local plugin directory, or the subdirectory inside a git repository","note":"Required for local and git-subdir; optional for url."},{"name":"source.url","type":"string","required":"conditional","use":"git repository URL","note":"Required for url and git-subdir."},{"name":"source.ref","type":"string","required":false,"use":"git ref to check out (url, git-subdir)"},{"name":"source.sha","type":"string","required":false,"use":"git commit to check out (url, git-subdir)"},{"name":"source.package","type":"string","required":"conditional","use":"npm package name","note":"Required for npm."},{"name":"source.version","type":"string","required":false,"use":"npm version, dist-tag or range"},{"name":"source.registry","type":"string","required":false,"use":"npm registry; HTTPS, no credentials, query or fragment"},{"name":"policy.installation","type":"string","required":false,"use":"NOT_AVAILABLE, AVAILABLE (default) or INSTALLED_BY_DEFAULT"},{"name":"policy.authentication","type":"string","required":false,"use":"ON_INSTALL (default) or ON_USE"},{"name":"policy.products","type":"array","required":false,"use":"products the plugin is offered in; carried, not enforced"},{"name":"category","type":"string","required":false,"use":"category; wins over the plugin manifest's interface.category"}]
- other_entry_fields: "any other key is kept as fallback plugin-manifest metadata (displayName, author.name, homepage, interface) for a plugin with no manifest of its own"
- source_forms: ["relative path string","local","url","git-subdir","npm"]
