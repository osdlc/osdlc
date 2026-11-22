---
kind: docs
store: '[Bundler](../../stores/Bundler.md)'
observed: '2026-11-21'
locator: When Bundler manages the process
version: 4.1.0
version_basis: exact
reportedIn:
- '[Where gems are installed and how they load - RubyGems Guides](../../documents/RubyGems/Where%20gems%20are%20installed%20and%20how%20they%20load%20-%20RubyGems%20Guides.md)'
excerpt:
  exact: bundle install puts gems into the same gem home that gem install uses, so all projects on the
    same Ruby share one pool of installed gems.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Where gems are installed and how they load - RubyGems Guides (https://guides.rubygems.org/gem-installation-and-loading/) says, under When Bundler manages the process:

> bundle install puts gems into the same gem home that gem install uses, so all projects on the same Ruby share one pool of installed gems.
