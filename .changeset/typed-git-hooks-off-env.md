---
"@osdlc/typed-git": minor
---

New `gitConfigEnv(entries, parent?)`: the variables that set git config for
every git a call reaches, to pass as a call's `env`. It sets each entry after
whatever the environment already holds, as the next `GIT_CONFIG_KEY_<n>` pair
and at the end of `GIT_CONFIG_PARAMETERS`. Setting it through
`GIT_CONFIG_COUNT` alone is not enough: git reads `GIT_CONFIG_PARAMETERS`
after it, so a `-c` a parent git passed on would still win.

New `hooksOffEnv(parent?)`: `gitConfigEnv` with `core.hooksPath=/dev/null`,
so a program started from a git alias or hook run as
`git -c core.hooksPath=.husky` runs no hooks.

`checkout` takes `noTrack`, which adds `--no-track` after `-b`/`-B <branch>`:
the new branch gets no `branch.<name>.remote` or `.merge`.
