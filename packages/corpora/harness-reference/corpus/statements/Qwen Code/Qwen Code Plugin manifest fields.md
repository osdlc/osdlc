---
proposition:
  subject: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
  predicate: plugins/manifest-fields
  object:
    file: qwen-extension.json
    fields:
      - name: name
        type: string
        required: true
        use: extension id; letters, digits, underscores, dots and dashes
      - name: version
        type: string
        required: false
        use: extension version
        note: Typed as a required string, but the loader checks only name.
      - name: displayName
        type: string | Record<string, string>
        required: false
        use: display name; a map is resolved by locale
      - name: description
        type: string | Record<string, string>
        required: false
        use: description; a map is resolved by locale
      - name: mcpServers
        type: Record<string, MCPServerConfig>
        required: false
        use: MCP servers loaded at startup; settings.json wins on a name clash
      - name: lspServers
        type: string | object
        required: false
        use: not documented
      - name: contextFileName
        type: string | string[]
        required: false
        use: context files; default QWEN.md
      - name: commands
        type: string | string[]
        required: false
        use: command directory; default commands
      - name: skills
        type: string | string[]
        required: false
        use: skill directory; default skills
      - name: skillStates
        type: Record<string, boolean>
        required: false
        use: not documented
      - name: agents
        type: string | string[]
        required: false
        use: subagent directory; default agents
      - name: workflows
        type: string | string[]
        required: false
        use: workflow directories or .js files; default workflows
      - name: settings
        type: ExtensionSetting[]
        required: false
        use: values asked for at install, passed to MCP servers as environment variables
      - name: settings.name
        type: string
        required: true
        use: setting display name
      - name: settings.description
        type: string
        required: true
        use: what the setting is for
      - name: settings.envVar
        type: string
        required: true
        use: environment variable that is set
      - name: settings.sensitive
        type: boolean
        required: false
        use: hide the value
      - name: hooks
        type: object keyed by hook event
        required: false
        use: inline hook definitions
      - name: channels
        type: Record<string, ExtensionChannelConfig>
        required: false
        use: custom channel adapters keyed by channel type
      - name: channels.entry
        type: string
        required: true
        use: JS entry that exports a ChannelPlugin
      - name: channels.displayName
        type: string
        required: false
        use: name in CLI output
      - name: channels.requiredConfigFields
        type: string[]
        required: false
        use: extra config fields the channel needs
    also_loaded: a root plugin.json that declares the Agent Plugins schema is loaded natively; .claude-plugin/plugin.json, gemini-extension.json and .qoder-plugin/plugin.json are converted to qwen-extension.json on install
    docs_fields:
      - name
      - version
      - mcpServers
      - channels
      - contextFileName
      - commands
      - skills
      - agents
      - workflows
      - settings
    docs_omit:
      - displayName
      - description
      - lspServers
      - skillStates
      - hooks
    agent_plugin_file: plugin.json
    agent_plugin_fields:
      - name: $schema
        type: string
        required: true
        use: must equal the Agent Plugins 1.0.0 schema URI
      - name: name
        type: string
        required: true
        use: id and display name; 1-64 lowercase letters, digits, dots or hyphens
      - name: version
        type: string
        required: false
        use: version; default 1.0.0
      - name: description
        type: string
        required: false
        use: description
      - name: author
        type: object
        required: false
        use: checked for type; keys name, email, url
      - name: homepage
        type: string
        required: false
        use: checked for type
      - name: repository
        type: string
        required: false
        use: checked for type
      - name: license
        type: string
        required: false
        use: checked for type
      - name: keywords
        type: string[]
        required: false
        use: checked for type
      - name: extensions
        type: object
        required: false
        use: accepted; a non-object is ignored with a warning
    claude_file: .claude-plugin/plugin.json
    claude_fields_converted:
      - name
      - version
      - description
      - author.name
      - author.email
      - author.url
      - homepage
      - repository
      - license
      - keywords
      - dependencies
      - commands
      - agents
      - skills
      - hooks
      - mcpServers
      - workflows
      - outputStyles
      - lspServers
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Qwen Code Plugin manifest fields](../../study-results/Qwen%20Code/2026-11-05%20Qwen%20Code%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Qwen Code Plugin manifest fields 2](../../study-results/Qwen%20Code/2026-11-05%20Qwen%20Code%20Plugin%20manifest%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Qwen Code Plugin manifest fields 3](../../study-results/Qwen%20Code/2026-11-05%20Qwen%20Code%20Plugin%20manifest%20fields%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Qwen Code Plugin manifest fields 4](../../study-results/Qwen%20Code/2026-11-05%20Qwen%20Code%20Plugin%20manifest%20fields%204.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
reportedIn:
  - "[QwenLM qwen-code extensionManager.ts at 1bac51b](../../documents/github.com/QwenLM%20qwen-code%20extensionManager.ts%20at%201bac51b.md)"
  - "[Qwen Code docs Extensions at 1bac51b](../../documents/github.com/Qwen%20Code%20docs%20Extensions%20at%201bac51b.md)"
  - "[QwenLM qwen-code agent-plugins-v1 manifest.ts at 1bac51b](../../documents/github.com/QwenLM%20qwen-code%20agent-plugins-v1%20manifest.ts%20at%201bac51b.md)"
  - "[QwenLM qwen-code claude-converter.ts at 1bac51b](../../documents/github.com/QwenLM%20qwen-code%20claude-converter.ts%20at%201bac51b.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Qwen Code](../../harnesses/Qwen%20Code.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/manifest-fields@qwen-code#scope-[null,null,null]
---

Imported from `facts/qwen-code/plugins/manifest-fields.md`.
