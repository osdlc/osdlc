---
proposition:
  subject: '[Bundler](../../stores/Bundler.md)'
  predicate: project/build-dirs
  object:
    dirs:
    - path: vendor/bundle
      marker: Gemfile
      holds: packages
      rebuild: re-download
    - path: vendor/cache
      marker: Gemfile
      holds: packages
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 Bundler build directories 1](../../study-results/Bundler/2026-11-21%20Bundler%20build%20directories%201.md)'
  - '[2026-11-21 Bundler build directories 2](../../study-results/Bundler/2026-11-21%20Bundler%20build%20directories%202.md)'
  - '[2026-11-21 Bundler build directories 3](../../study-results/Bundler/2026-11-21%20Bundler%20build%20directories%203.md)'
  - '[2026-11-21 Bundler build directories 4](../../study-results/Bundler/2026-11-21%20Bundler%20build%20directories%204.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The guides name vendor/bundle as the usual project install path and vendor/cache as where
    bundle cache copies .gem files; vendor/cache is sometimes committed on purpose for offline installs,
    so a cleaner should skip it when it is tracked by git.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[Bundler](../../stores/Bundler.md)'
subject: '[Build directories](../../subjects/project/Build%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- vendor/bundle exists only when a project sets path; the Bundler 5 default of a .bundle directory was
  not checked against a released version.
---

The guides name vendor/bundle as the usual project install path and vendor/cache as where bundle cache copies .gem files; vendor/cache is sometimes committed on purpose for offline installs, so a cleaner should skip it when it is tracked by git.
