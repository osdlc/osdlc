---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/manifest
  object:
    file: package.json
    key: "exports: the root export or server, and the tui, gui-experimental and rpc subpaths"
    optional: true
    fallback: root files named server (else index), tui and rpc with .ts, .tsx or .js, and gui-experimental.cjs or .js
    required_fields: name and exports, for a local directory to load through package.json
    name: plugin
    skills: not declared in the manifest; the server part registers skills with ctx.skill.transform
direction: supports
strength: moderate
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugin docs parts v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20parts%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugin docs local directory layout v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20local%20directory%20layout%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugin docs published package v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20published%20package%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugin docs skill transform v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20skill%20transform%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The build-plugins pages say a plugin is an npm package whose parts are package exports, give the file-name fallback for a local directory, and show skills registered in code.
reportedIn:
  - "[OpenCode docs source Build plugins overview at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20Build%20plugins%20overview%20at%20a6b15d3.md)"
  - "[OpenCode docs source Build plugins server at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20Build%20plugins%20server%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T12:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Plugin manifest](../../subjects/plugins/Plugin%20manifest.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

A plugin is an npm package, not a folder of skills. From the build-plugins docs at v2.3.0.
