---
proposition:
  subject: '[RubyGems](../../stores/RubyGems.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: all
      path: $GEM_HOME
      holds: packages
      rebuild: re-download
    - platform: all
      path: $GEM_HOME/cache
      holds: cache
      rebuild: re-download
    - platform: all
      path: ~/.gem/ruby
      holds: packages
      rebuild: re-download
    - platform: all
      path: ~/.local/share/gem/ruby
      holds: packages
      rebuild: re-download
    - platform: all
      path: ~/.gem/specs
      holds: cache
      rebuild: re-download
    - platform: all
      path: $XDG_CACHE_HOME/gem/specs
      holds: cache
      rebuild: re-download
direction: supports
strength: moderate
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 RubyGems data directories 1](../../study-results/RubyGems/2026-11-21%20RubyGems%20data%20directories%201.md)'
  - '[2026-11-21 RubyGems data directories 2](../../study-results/RubyGems/2026-11-21%20RubyGems%20data%20directories%202.md)'
  - '[2026-11-21 RubyGems data directories 3](../../study-results/RubyGems/2026-11-21%20RubyGems%20data%20directories%203.md)'
  - '[2026-11-21 RubyGems data directories 4](../../study-results/RubyGems/2026-11-21%20RubyGems%20data%20directories%204.md)'
  - '[2026-11-21 RubyGems data directories 5](../../study-results/RubyGems/2026-11-21%20RubyGems%20data%20directories%205.md)'
  - '[2026-11-21 RubyGems data directories 6](../../study-results/RubyGems/2026-11-21%20RubyGems%20data%20directories%206.md)'
  - '[2026-11-21 RubyGems data directories 7](../../study-results/RubyGems/2026-11-21%20RubyGems%20data%20directories%207.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: moderate
  description: The guides say the gem home normally sits inside the Ruby installation (so it has no fixed
    home path), user installs go to ~/.gem/ruby or ~/.local/share/gem/ruby, downloaded .gem files stay
    in each repository's cache/ directory, and remote specs are cached in ~/.gem/specs or $XDG_CACHE_HOME/gem/specs.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[RubyGems](../../stores/RubyGems.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- The guides give the user install directory as ~/.gem/ruby/<ruby version> without a Windows-specific
  spelling.
- Deleting a gem home also removes compiled native extensions, which are rebuilt on reinstall.
---

The guides say the gem home normally sits inside the Ruby installation (so it has no fixed home path), user installs go to ~/.gem/ruby or ~/.local/share/gem/ruby, downloaded .gem files stay in each repository's cache/ directory, and remote specs are cached in ~/.gem/specs or $XDG_CACHE_HOME/gem/specs.
