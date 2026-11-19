---
proposition:
  subject: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
  predicate: plugins/manifest-fields
  object:
    file: plugin.json
    fields:
      - name: $schema
        type: string
        required: true
        use: must equal the Agent Plugins 1.0.0 schema URI; marks the root plugin.json as an Agent Plugins manifest
      - name: name
        type: string
        required: true
        use: plugin id; lowercase letters, digits, dots or hyphens, at most 64 characters; also the display name
      - name: version
        type: string
        required: false
        use: plugin version
      - name: description
        type: string
        required: false
        use: short and long description in the interface
      - name: author.name
        type: string
        required: false
        use: developer name in the interface
      - name: author.email
        type: string
        required: false
        use: parsed, not used
      - name: author.url
        type: string
        required: false
        use: parsed, not used
      - name: homepage
        type: string
        required: false
        use: website URL in the interface
      - name: repository
        type: string
        required: false
        use: parsed, not used
      - name: license
        type: string
        required: false
        use: parsed, not used
      - name: keywords
        type: string[]
        required: false
        use: plugin keywords
      - name: extensions
        type: object
        required: false
        use: namespaced settings; Codex reads extensions["com.openai"]
      - name: extensions["com.openai"]
        type: object
        required: false
        use: OpenAI overlay, parsed with the .codex-plugin/plugin.json field set; its apps, hooks, onboardingSkill and interface replace the defaults
        note: When absent, a .codex-plugin/plugin.json next to the root manifest supplies the overlay.
      - name: extensions["com.openai"].onboardingSkill
        type: string
        required: false
        use: path to a packaged SKILL.md run as setup after install
    defaults:
      skills: skills
      mcp_servers: mcp.json
      category: Other
    legacy_file: .codex-plugin/plugin.json
    legacy_also_read:
      - .claude-plugin/plugin.json
      - .cursor-plugin/plugin.json
    legacy_fields:
      - name: name
        type: string
        required: false
        use: plugin id; the plugin directory's name when empty
      - name: version
        type: string
        required: false
        use: plugin version; blank is treated as absent
      - name: description
        type: string
        required: false
        use: plugin description
      - name: keywords
        type: string[]
        required: false
        use: plugin keywords
      - name: skills
        type: string | string[]
        required: false
        use: skill directories; paths must be dot-slash relative and stay inside the plugin root
      - name: commands
        type: string | string[]
        required: false
        use: command files migrated into skills; default commands directory
      - name: mcpServers
        type: string | object
        required: false
        use: MCP server config file path, or inline servers
      - name: apps
        type: string
        required: false
        use: path to the .app.json of registered MCP server mappings
      - name: hooks
        type: string | string[] | object | object[]
        required: false
        use: hook file paths or inline hooks
      - name: interface.displayName
        type: string
        required: false
        use: display name
      - name: interface.shortDescription
        type: string
        required: false
        use: subtitle
      - name: interface.longDescription
        type: string
        required: false
        use: long description
      - name: interface.developerName
        type: string
        required: false
        use: publisher name
      - name: interface.category
        type: string
        required: false
        use: category; a marketplace entry's category wins
      - name: interface.capabilities
        type: string[]
        required: false
        use: capability labels
      - name: interface.websiteUrl
        type: string
        required: false
        use: website link
        note: Alias websiteURL.
      - name: interface.privacyPolicyUrl
        type: string
        required: false
        use: privacy policy link
        note: Alias privacyPolicyURL.
      - name: interface.termsOfServiceUrl
        type: string
        required: false
        use: terms of service link
        note: Alias termsOfServiceURL.
      - name: interface.defaultPrompt
        type: string | string[]
        required: false
        use: starter prompts; at most 3, each at most 128 characters
      - name: interface.brandColor
        type: string
        required: false
        use: brand color
      - name: interface.composerIcon
        type: string
        required: false
        use: composer icon path
      - name: interface.logo
        type: string
        required: false
        use: logo path
      - name: interface.logoDark
        type: string
        required: false
        use: dark logo path
      - name: interface.screenshots
        type: string[]
        required: false
        use: screenshot paths
      - name: extensions["com.openai"].onboardingSkill
        type: string
        required: false
        use: path to a packaged SKILL.md run as setup after install
    overlay_rule: an extensions.com.openai object replaces the whole .codex-plugin/plugin.json overlay; the two are not merged
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-05 Codex CLI Plugin manifest fields](../../study-results/Codex%20CLI/2026-11-05%20Codex%20CLI%20Plugin%20manifest%20fields.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Codex CLI Plugin manifest fields 2](../../study-results/Codex%20CLI/2026-11-05%20Codex%20CLI%20Plugin%20manifest%20fields%202.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: source observed 2026-11-05.
  - hasEvidenceItems:
      - "[2026-11-05 Codex CLI Plugin manifest fields 3](../../study-results/Codex%20CLI/2026-11-05%20Codex%20CLI%20Plugin%20manifest%20fields%203.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: docs observed 2026-11-05.
reportedIn:
  - "[openai codex core-plugins source at a037e65](../../documents/github.com/openai%20codex%20core-plugins%20source%20at%20a037e65.md)"
  - "[OpenAI docs Package your plugin](../../documents/developers.openai.com/OpenAI%20docs%20Package%20your%20plugin.md)"
contributions:
  - contributor:
      name: harness-reference import
      agentType: software
    activityType: created
    date: 2026-11-05T00:00:00Z
harness: "[Codex CLI](../../harnesses/Codex%20CLI.md)"
subject: "[Plugin manifest fields](../../subjects/plugins/Plugin%20manifest%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
open:
  - The plugin submission docs mark version, description, author.name, interface, interface.capabilities, interface.composerIcon and interface.logo as required in the Codex format, and list fields the CLI parser never reads (interface.supportURL, brandColorDark, composerIconDark, id, review.*, publication.*). The CLI loader treats every one of them as optional or ignores it. Are those requirements enforced anywhere a CLI user would meet them, or only at directory upload?
imported_from: fact:plugins/manifest-fields@codex#scope-[null,null,null]
---

Imported from `facts/codex/plugins/manifest-fields.md`.

Open questions:
- The plugin submission docs mark version, description, author.name, interface, interface.capabilities, interface.composerIcon and interface.logo as required in the Codex format, and list fields the CLI parser never reads (interface.supportURL, brandColorDark, composerIconDark, id, review.*, publication.*). The CLI loader treats every one of them as optional or ignores it. Are those requirements enforced anywhere a CLI user would meet them, or only at directory upload?
