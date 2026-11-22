---
kind: docs
store: '[nvm](../../stores/nvm.md)'
observed: '2026-11-21'
locator: Environment variables
reportedIn:
- '[nvm nvm README](../../documents/nvm-sh/nvm%20nvm%20README.md)'
excerpt:
  exact: other shells (like dash) cannot tell where a sourced file lives, so they use the default install
    location (`$XDG_CONFIG_HOME/nvm` when `XDG_CONFIG_HOME` is set, otherwise `~/.nvm`).
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

nvm nvm README (https://raw.githubusercontent.com/nvm-sh/nvm/master/README.md) says, under Environment variables:

> other shells (like dash) cannot tell where a sourced file lives, so they use the default install location (`$XDG_CONFIG_HOME/nvm` when `XDG_CONFIG_HOME` is set, otherwise `~/.nvm`).
