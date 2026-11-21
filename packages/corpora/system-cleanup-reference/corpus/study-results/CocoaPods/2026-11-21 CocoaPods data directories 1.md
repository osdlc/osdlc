---
kind: source
store: '[CocoaPods](../../stores/CocoaPods.md)'
observed: '2026-11-21'
locator: DEFAULTS
reportedIn:
- '[CocoaPods config.rb](../../documents/CocoaPods/CocoaPods%20config.rb.md)'
excerpt:
  exact: :cache_root => Pathname.new(Dir.home) + 'Library/Caches/CocoaPods',
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

CocoaPods config.rb (https://raw.githubusercontent.com/CocoaPods/CocoaPods/master/lib/cocoapods/config.rb) says, under DEFAULTS:

> :cache_root => Pathname.new(Dir.home) + 'Library/Caches/CocoaPods',
