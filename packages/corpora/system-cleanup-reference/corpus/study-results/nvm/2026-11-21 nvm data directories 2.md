---
kind: source
store: '[nvm](../../stores/nvm.md)'
observed: '2026-11-21'
locator: nvm_version_dir
reportedIn:
- '[nvm nvm.sh](../../documents/nvm-sh/nvm%20nvm.sh.md)'
excerpt:
  exact: nvm_echo "${NVM_DIR}/versions/node"
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
---

nvm nvm.sh (https://raw.githubusercontent.com/nvm-sh/nvm/master/nvm.sh) says, under nvm_version_dir:

> nvm_echo "${NVM_DIR}/versions/node"
