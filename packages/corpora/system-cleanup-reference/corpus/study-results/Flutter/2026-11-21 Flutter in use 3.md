---
kind: source
store: '[Flutter](../../stores/Flutter.md)'
observed: '2026-11-21'
locator: lock
reportedIn:
- '[Flutter cache.dart](../../documents/Flutter/Flutter%20cache.dart.md)'
excerpt:
  exact: _fileSystem.path.join(flutterRoot, 'bin', 'cache', 'lockfile'),
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

Flutter cache.dart (https://raw.githubusercontent.com/flutter/flutter/master/packages/flutter_tools/lib/src/cache.dart) says, under lock:

> _fileSystem.path.join(flutterRoot, 'bin', 'cache', 'lockfile'),
