---
kind: docs
store: '[ccache](../../stores/ccache.md)'
observed: '2026-11-21'
locator: cache_dir
version: 4.14.3
version_basis: exact
reportedIn:
- '[ccache ccache(1)](../../documents/ccache/ccache%20ccache%281%29.md)'
excerpt:
  exact: On non-Windows systems, the default is $HOME/.ccache if such a directory exists, otherwise $XDG_CACHE_HOME/ccache
    if XDG_CACHE_HOME is set, otherwise $HOME/Library/Caches/ccache (macOS) or $HOME/.cache/ccache (other
    systems).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

ccache ccache(1) (https://ccache.dev/manual/latest.html) says, under cache_dir:

> On non-Windows systems, the default is $HOME/.ccache if such a directory exists, otherwise $XDG_CACHE_HOME/ccache if XDG_CACHE_HOME is set, otherwise $HOME/Library/Caches/ccache (macOS) or $HOME/.cache/ccache (other systems).
