---
proposition:
  subject: "[OpenCode](../../harnesses/OpenCode.md)"
  predicate: plugins/install-location
  object:
    npm_plugins: installed into a generation directory under ~/.cache/opencode/npm/<package key>, or under $XDG_CACHE_HOME/opencode/npm when that variable is set
    local_plugins: loaded in place from the configured directory or from .opencode/plugins
    skills: a plugin does not install a skills folder; its server part can add, change or remove skills with ctx.skill.transform
direction: supports
strength: strong
hasEvidenceLines:
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode npm cache directory source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20npm%20cache%20directory%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode npm generation directory source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20npm%20generation%20directory%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode cache root source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20cache%20root%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode cache root app folder source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20cache%20root%20app%20folder%20source%20v2.3.0.md)"
      - "[2026-11-14 OpenCode global app name source v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20global%20app%20name%20source%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: strong
    description: npm.ts installs each package under <cache>/npm/<key>/<generation>; the cache root is $XDG_CACHE_HOME or ~/.cache, joined with opencode.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugins docs cached package plugins v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20cached%20package%20plugins%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugins docs discover v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugins%20docs%20discover%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugin docs local directory layout v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20local%20directory%20layout%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The plugins docs say startup loads cached package plugins and installs missing ones in the background, and that local plugin directories are loaded from where they are.
  - hasEvidenceItems:
      - "[2026-11-14 OpenCode plugin docs skill transform v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20skill%20transform%20v2.3.0.md)"
      - "[2026-11-14 OpenCode plugin docs skill transform example v2.3.0](../../study-results/OpenCode/2026-11-14%20OpenCode%20plugin%20docs%20skill%20transform%20example%20v2.3.0.md)"
    directionOfEvidenceProvided: supports
    strengthOfEvidenceProvided: moderate
    description: The server plugin docs give ctx.skill.transform as the way a plugin adds, updates or removes skills.
reportedIn:
  - "[OpenCode source util npm.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20util%20npm.ts%20at%20a6b15d3.md)"
  - "[OpenCode source util global-roots.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20util%20global-roots.ts%20at%20a6b15d3.md)"
  - "[OpenCode source util global.ts at a6b15d3](../../documents/github.com/OpenCode%20source%20util%20global.ts%20at%20a6b15d3.md)"
  - "[OpenCode docs source plugins at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20plugins%20at%20a6b15d3.md)"
  - "[OpenCode docs source Build plugins overview at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20Build%20plugins%20overview%20at%20a6b15d3.md)"
  - "[OpenCode docs source Build plugins server at a6b15d3](../../documents/github.com/OpenCode%20docs%20source%20Build%20plugins%20server%20at%20a6b15d3.md)"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T18:00:00Z
harness: "[OpenCode](../../harnesses/OpenCode.md)"
subject: "[Plugin install location](../../subjects/plugins/Plugin%20install%20location.md)"
scope:
  since: 2.3.0
  until: null
  platform: []
  model: null
status: current
---

The statement for versions before 2.3.0 gives the cache as `~/.cache/opencode/node_modules`, installed with Bun at startup. At v2.3.0 each package plugin has its own generation directories under `npm/` in the cache. That statement's open question, whether a plugin can install skills, is answered: there is no skills folder in a plugin, but a server plugin can register skills through `ctx.skill.transform`.
