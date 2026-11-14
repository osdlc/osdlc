---
proposition:
  subject: "[Grok Build](../../harnesses/Grok%20Build.md)"
  predicate: permissions/tool-rules
  object:
    supported: true
    allow_argv:
      - --allow
      - "{rules}"
    deny_argv:
      - --deny
      - "{rules}"
    config_key: "[permission] allow / deny / ask"
    syntax: ToolPrefix(glob_pattern); the tool names are Bash, Read, Edit, Write, Grep, Glob, MCPTool, WebFetch and WebSearch, and a bare * matches every tool
    precedence: deny, then ask, then allow, whatever the source or order
    note: Both flags repeat; --allowedTools and --disallowedTools are aliases. --tools and --disallowed-tools (headless only) keep or remove built-in tools from the toolset instead of gating them.
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 grok cli allow flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20allow%20flag.md)"
      - "[2026-11-14 grok cli deny flag](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20deny%20flag.md)"
      - "[2026-11-14 grok cli tools flags](../../study-results/Grok%20Build/2026-11-14%20grok%20cli%20tools%20flags.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: The argument definitions of --allow, --deny, --tools and --disallowed-tools.
  - hasEvidenceItems:
      - "[2026-11-14 grok allow deny repeat](../../study-results/Grok%20Build/2026-11-14%20grok%20allow%20deny%20repeat.md)"
      - "[2026-11-14 grok rule syntax](../../study-results/Grok%20Build/2026-11-14%20grok%20rule%20syntax.md)"
      - "[2026-11-14 grok rules vs disallowed tools](../../study-results/Grok%20Build/2026-11-14%20grok%20rules%20vs%20disallowed%20tools.md)"
      - "[2026-11-14 grok tools flags](../../study-results/Grok%20Build/2026-11-14%20grok%20tools%20flags.md)"
      - "[2026-11-14 grok rule evaluation order](../../study-results/Grok%20Build/2026-11-14%20grok%20rule%20evaluation%20order.md)"
      - "[2026-11-14 grok permission config arrays](../../study-results/Grok%20Build/2026-11-14%20grok%20permission%20config%20arrays.md)"
      - "[2026-11-14 grok rule tool names](../../study-results/Grok%20Build/2026-11-14%20grok%20rule%20tool%20names.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The headless and permissions guides.
reportedIn:
  - "[xai-org grok-build pager cli.rs](../../documents/github.com/xai-org%20grok-build%20pager%20cli.rs.md)"
  - "[Grok Build user guide Headless mode](../../documents/github.com/Grok%20Build%20user%20guide%20Headless%20mode.md)"
  - "[Grok Build user guide Permissions and safety](../../documents/github.com/Grok%20Build%20user%20guide%20Permissions%20and%20safety.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
harness: "[Grok Build](../../harnesses/Grok%20Build.md)"
subject: "[Tool allow and deny rules](../../subjects/permissions/Tool%20allow%20and%20deny%20rules.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
---
