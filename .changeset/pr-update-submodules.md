---
'@osdlc/pr-update': minor
---

The update worktree now gets the repository's git submodules: with a `.gitmodules` present, `pr_update.submodules: auto` (the default; `off` disables it) runs `git submodule update --init --recursive` after each PR's checkout and again when the update moved a gitlink or changed `.gitmodules`, before `verify`, resolvers and `lockfile_install` run. A submodule that will not check out fails the PR as `submodule setup failed: <detail>` without recording a failed attempt. A conflict on a submodule pointer names the base's and the branch's commits.
