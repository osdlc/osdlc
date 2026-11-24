---
"@osdlc/typed-git": minor
---

New `hooksOffEnv(parent?)`: the variables that turn git's hooks off, to pass
as a call's `env`. It sets `core.hooksPath=/dev/null` after whatever the
environment already holds, as the next `GIT_CONFIG_KEY_<n>` pair and at the
end of `GIT_CONFIG_PARAMETERS`. Setting it through `GIT_CONFIG_COUNT` alone is
not enough: git reads `GIT_CONFIG_PARAMETERS` after it, so a program started
from a git alias or hook run as `git -c core.hooksPath=.husky` would still run
the hooks.
