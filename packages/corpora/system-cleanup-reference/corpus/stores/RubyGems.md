---
slug: rubygems
category: language-package-manager
vendor: RubyGems (Ruby Central)
homepage: https://rubygems.org
docs: https://guides.rubygems.org
repository: https://github.com/rubygems/rubygems
license: MIT OR Ruby
open_source: true
platforms:
- macos
- linux
- windows
cli: gem
checked: '2026-11-21'
sources:
- '[Where gems are installed and how they load - RubyGems Guides](../documents/RubyGems/Where%20gems%20are%20installed%20and%20how%20they%20load%20-%20RubyGems%20Guides.md)'
- '[Caching and vendoring - RubyGems Guides](../documents/RubyGems/Caching%20and%20vendoring%20-%20RubyGems%20Guides.md)'
- '[Environment variables - RubyGems Guides](../documents/RubyGems/Environment%20variables%20-%20RubyGems%20Guides.md)'
- '[Command Reference - RubyGems Guides](../documents/RubyGems/Command%20Reference%20-%20RubyGems%20Guides.md)'
---

RubyGems is Ruby's package manager and the gem command. It installs every version of every gem side by side in a per-Ruby gem home (or a user install directory under ~/.gem or ~/.local/share/gem), keeps the downloaded .gem files in that repository's cache/ directory, and caches remote gem specifications.

## Open

- in use: No source found documents a lock file or process that marks the gem home as in use.
- build directories: RubyGems creates no project-local directories according to the sources read; see the Bundler entry for vendor/bundle and vendor/cache.
