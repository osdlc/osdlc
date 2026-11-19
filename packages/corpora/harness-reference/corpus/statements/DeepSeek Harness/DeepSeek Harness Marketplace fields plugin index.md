---
proposition:
  subject: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
  predicate: plugins/marketplace-fields
  object:
    applicable: true
    catalog_file: a JSON index file at a URL the user adds; no fixed name (the guide's example is index.json)
    fields:
      - name: format
        type: number
        required: true
        use: must be 1
      - name: title
        type: LocalizedText
        required: true
        use: index name
      - name: description
        type: LocalizedText
        required: false
        use: index description
      - name: metadata.categories
        type: object
        required: false
        use: maps an id to { title }
      - name: metadata.labels
        type: object
        required: false
        use: maps an id to { title }
      - name: metadata.sortKeys
        type: object
        required: false
        use: maps an id to { title, order }
      - name: plugins
        type: array
        required: true
        use: the plugins, in the publisher's default order
    entry_fields:
      - name: name
        type: string
        required: true
        use: npm package name, unique in the index
      - name: title
        type: LocalizedText
        required: false
        use: card title; the card shows name without it
      - name: description
        type: LocalizedText
        required: false
        use: card description
      - name: icon
        type: string
        required: false
        use: "inline data: URL or a URL, resolved against the index URL"
      - name: author
        type: string
        required: false
        use: display text
      - name: homepage
        type: string
        required: false
        use: linked from the plugin page
      - name: repository
        type: object
        required: false
        use: "{ url, directory? }, linked as Source code"
      - name: metadata.category
        type: string
        required: false
        use: one declared category id
      - name: metadata.labels
        type: array
        required: false
        use: declared label ids
      - name: metadata.sortKeys
        type: object
        required: false
        use: declared sort-key ids mapped to numbers or null
      - name: versions
        type: array
        required: true
        use: at least one version
    version_fields:
      - name: version
        type: string
        required: true
        use: exact SemVer, unique within the plugin
      - name: publishTimestamp
        type: number
        required: true
        use: publish time in Unix seconds
      - name: source
        type: object
        required: true
        use: "{ type: npm, registry? } or { type: git, url, commit, path? }"
      - name: engines.dsh
        type: string
        required: false
        use: SemVer range of DSH versions the version runs on
    unknown_fields: ignored at every level
    note: DSH rejects the whole index when a rule is violated. The fields come from the guide's tables; the validator source was not read.
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 dsh plugin index top-level fields](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20plugin%20index%20top-level%20fields.md)"
      - "[2026-11-14 dsh plugin index plugins field](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20plugin%20index%20plugins%20field.md)"
      - "[2026-11-14 dsh plugin index plugin fields](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20plugin%20index%20plugin%20fields.md)"
      - "[2026-11-14 dsh plugin index versions field](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20plugin%20index%20versions%20field.md)"
      - "[2026-11-14 dsh plugin index version fields](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20plugin%20index%20version%20fields.md)"
      - "[2026-11-14 dsh index git source fields](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20index%20git%20source%20fields.md)"
      - "[2026-11-14 dsh plugin index unknown fields ignored](../../study-results/DeepSeek%20Harness/2026-11-14%20dsh%20plugin%20index%20unknown%20fields%20ignored.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The index format reference in the plugin indexes guide at 39163dd lists the index, plugin and version fields.
reportedIn:
  - "[deepseek-ai deepseek-harness plugin-market guide at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20plugin-market%20guide%20at%2039163dd.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
subject: "[Marketplace fields](../../subjects/plugins/Marketplace%20fields.md)"
scope:
  since: null
  until: null
  platform: []
  model: null
status: current
supersedes: "[DeepSeek Harness Marketplace fields](DeepSeek%20Harness%20Marketplace%20fields.md)"
---

The 2026-11-05 statement said DSH has no catalog an author writes. The plugin indexes guide on main (39163dd) documents an index file format with index, plugin and version fields. The older note on the official on-demand catalog generated inside the repository was not rechecked.
