---
kind: docs
store: '[Bundler](../../stores/Bundler.md)'
observed: '2026-11-21'
locator: Should you commit vendor/cache?
version: 4.1.0
version_basis: exact
reportedIn:
- '[Caching and vendoring - RubyGems Guides](../../documents/RubyGems/Caching%20and%20vendoring%20-%20RubyGems%20Guides.md)'
excerpt:
  exact: Committing vendor/cache means a checkout of your repository contains everything needed to run
    bundle install with no network at all.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Caching and vendoring - RubyGems Guides (https://guides.rubygems.org/caching-and-vendoring/) says, under Should you commit vendor/cache?:

> Committing vendor/cache means a checkout of your repository contains everything needed to run bundle install with no network at all.
