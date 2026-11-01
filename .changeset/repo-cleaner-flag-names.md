---
'@osdlc/repo-cleaner': minor
---

**Breaking (CLI):** `--remote <name>` is now `--measure-remote <name>`, so it is no longer one letter away from `--remotes`. Typing `--remote` when you meant `--remotes` used to fail with "argument missing". `--no-gh` is gone; use `--provider none`, which does the same. The help no longer says the tool asks `gh`, since the provider can be GitLab.
