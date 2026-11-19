---
proposition:
  subject: "[Claude Code](../../harnesses/Claude%20Code.md)"
  predicate: plugins/manifest-fields
  object:
    file: .claude-plugin/plugin.json
    fields:
      - name: $schema
        type: string
        required: false
        use: JSON Schema URL for editor autocomplete; ignored at load time
      - name: name
        type: string
        required: true
        use: plugin id; every component is namespaced under it
      - name: displayName
        type: string
        required: false
        use: shown in the UI in place of name; a marketplace entry's displayName wins
      - name: version
        type: string
        required: false
        use: keeps users on that version until it changes; not checked against semver
      - name: description
        type: string
        required: false
        use: short explanation of what the plugin provides
      - name: author
        type: object
        required: false
        use: author details
      - name: author.name
        required: conditional
        use: not documented
        note: Required when author is set.
      - name: author.email
        required: false
        use: not documented
      - name: author.url
        required: false
        use: not documented
      - name: homepage
        type: string
        required: false
        use: documentation URL; must parse as a URL or the plugin fails to load
      - name: repository
        type: string
        required: false
        use: source repository URL; not validated
      - name: license
        type: string
        required: false
        use: SPDX identifier
      - name: keywords
        type: string[]
        required: false
        use: discovery tags
      - name: metadata
        type: object
        required: false
        use: free-form data for the author; Claude Code does not read it
        note: Requires v2.1.222 or later.
      - name: icon
        type: string
        required: false
        use: listing icon in Anthropic's directory; Claude Code does not read it
      - name: documentationUrl
        type: string
        required: false
        use: listing link in Anthropic's directory; Claude Code does not read it
      - name: supportUrl
        type: string
        required: false
        use: listing link in Anthropic's directory; Claude Code does not read it
      - name: privacyPolicyUrl
        type: string
        required: false
        use: listing link in Anthropic's directory; Claude Code does not read it
      - name: termsOfServiceUrl
        type: string
        required: false
        use: listing link in Anthropic's directory; Claude Code does not read it
      - name: defaultEnabled
        type: boolean
        required: false
        use: whether the plugin starts enabled when the user has not set it; default true
      - name: dependencies
        type: (string | object)[]
        required: false
        use: plugins that must be enabled for this one to work
      - name: settings
        type: object
        required: false
        use: settings applied while enabled; only agent and subagentStatusLine take effect
      - name: userConfig
        type: object
        required: false
        use: values the user is prompted for when the plugin is enabled
      - name: userConfig.<key>.type
        required: true
        use: one of string, number, boolean, directory, file
      - name: userConfig.<key>.title
        required: true
        use: label in the configuration dialog
      - name: userConfig.<key>.description
        required: true
        use: help text beneath the field
      - name: userConfig.<key>.required
        required: false
        use: dialog refuses an empty value
      - name: userConfig.<key>.default
        type: string | number | boolean | string[]
        required: false
        use: value used when the user gives none
      - name: userConfig.<key>.options
        required: false
        use: fixed values for a string field, shown as a picker
        note: Requires v2.1.271 or later.
      - name: userConfig.<key>.multiple
        required: false
        use: lets a string field hold an array of strings
      - name: userConfig.<key>.sensitive
        required: false
        use: masks input and stores the value in secure storage
      - name: userConfig.<key>.min
        required: false
        use: lower bound for a number
      - name: userConfig.<key>.max
        required: false
        use: upper bound for a number
      - name: types
        type: path
        required: false
        use: a .d.ts file declaring a mod's state values and nouns
      - name: channels
        type: object[]
        required: false
        use: message channels, each bound to one of the plugin's MCP servers
      - name: channels[].server
        required: true
        use: key of the MCP server the channel binds to
      - name: channels[].displayName
        required: false
        use: configuration dialog title; defaults to the server name
      - name: channels[].userConfig
        type: object
        required: false
        use: options to prompt for, same shape as userConfig
      - name: skills
        type: path | path[]
        required: false
        use: skill directories; adds to the default skills scan
      - name: commands
        type: path | path[] | object
        required: false
        use: command files, directories, or a name-to-source/content map; replaces the default commands scan
      - name: agents
        type: path | path[]
        required: false
        use: agent .md files; replaces the default agents scan
      - name: hooks
        type: path | object | (path | object)[]
        required: false
        use: hook files or inline hook config; loaded together with hooks/hooks.json
      - name: mcpServers
        type: path | object | (path | object)[]
        required: false
        use: MCP config files, .mcpb or .dxt bundles, or inline servers; loaded together with .mcp.json
      - name: lspServers
        type: path | object | (path | object)[]
        required: false
        use: LSP config files or inline servers; loaded together with .lsp.json
      - name: outputStyles
        type: path | path[]
        required: false
        use: output style files or directories; replaces the default output-styles scan
      - name: workflows
        type: path | path[]
        required: false
        use: workflow .js files or directories; replaces the default workflows scan
      - name: experimental
        type: object
        required: false
        use: container for themes, monitors and evals, whose shape may still change
      - name: experimental.themes
        type: path | path[]
        required: false
        use: theme files or directories; replaces the default themes scan
      - name: experimental.monitors
        type: path | array
        required: false
        use: monitors file or inline array; default monitors/monitors.json
      - name: experimental.evals
        type: path | path[]
        required: false
        use: eval case directory when it is not evals
      - name: themes
        type: path | path[]
        required: false
        use: old spelling of experimental.themes; still loads, with a validate warning
      - name: monitors
        type: path | array
        required: false
        use: old spelling of experimental.monitors; still loads, with a validate warning
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Claude Code Plugin manifest fields](../../study-results/Claude%20Code/2026-11-05%20Claude%20Code%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[Claude Code docs Plugin manifest reference](../../documents/code.claude.com/Claude%20Code%20docs%20Plugin%20manifest%20reference.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Claude Code](../../harnesses/Claude%20Code.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
imported_from: fact:plugins/manifest-fields@claude-code#scope-[null,null,null]
---

Imported from `facts/claude-code/plugins/manifest-fields.md`.
