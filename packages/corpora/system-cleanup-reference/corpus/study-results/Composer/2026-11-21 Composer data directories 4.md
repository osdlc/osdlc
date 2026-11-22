---
kind: source
store: '[Composer](../../stores/Composer.md)'
observed: '2026-11-21'
locator: getCacheDir
reportedIn:
- '[src Composer Factory.php](../../documents/Composer/src%20Composer%20Factory.php.md)'
excerpt:
  exact: '$xdgCache = Platform::getEnv(''XDG_CACHE_HOME'') ?: $userDir . ''/.cache'';'
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

src Composer Factory.php (https://raw.githubusercontent.com/composer/composer/main/src/Composer/Factory.php) says, under getCacheDir:

> $xdgCache = Platform::getEnv('XDG_CACHE_HOME') ?: $userDir . '/.cache';
