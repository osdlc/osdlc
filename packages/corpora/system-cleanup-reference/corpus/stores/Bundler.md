---
slug: bundler
category: language-package-manager
vendor: RubyGems (Ruby Central)
homepage: https://bundler.io
docs: https://guides.rubygems.org/command-reference/bundle-config/
repository: https://github.com/rubygems/rubygems
license: MIT
open_source: true
platforms:
- macos
- linux
- windows
cli: bundle
checked: '2026-11-21'
sources:
- '[Caching and vendoring - RubyGems Guides](../documents/RubyGems/Caching%20and%20vendoring%20-%20RubyGems%20Guides.md)'
- '[Where gems are installed and how they load - RubyGems Guides](../documents/RubyGems/Where%20gems%20are%20installed%20and%20how%20they%20load%20-%20RubyGems%20Guides.md)'
- '[bundle config - RubyGems Guides](../documents/RubyGems/bundle%20config%20-%20RubyGems%20Guides.md)'
- '[bundle clean - RubyGems Guides](../documents/RubyGems/bundle%20clean%20-%20RubyGems%20Guides.md)'
- '[bundle list - RubyGems Guides](../documents/RubyGems/bundle%20list%20-%20RubyGems%20Guides.md)'
---

Bundler installs the gems a Ruby application's Gemfile.lock pins. By default it installs into the shared RubyGems gem home, optionally into a project path such as vendor/bundle, keeps compact index data (and, if opted in, downloaded gems) in ~/.bundle/cache, and bundle cache copies .gem files into vendor/cache.

## Open

- in use: No source found documents a lock file or process that marks a bundle path as in use.
