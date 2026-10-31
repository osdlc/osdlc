---
"@osdlc/repo-cleaner": minor
---

Pull request evidence now comes from a provider, and GitLab is one (prototype). `--provider auto|github|gitlab|none` on every sweeping command picks it; `auto`, the default, reads the remote's host, so a `gitlab` host asks `glab` for merge requests and any other host asks `gh` as before. `--no-gh` is `--provider none`. A plan records the choice for `apply`'s re-check. `RepoInfo.provider` says which provider was asked and what its probe found; `fetchPrs` takes a provider or a `Gh` client as before. Not yet done: Gitea, Forgejo, Bitbucket, a host-to-provider config, and GitLab squash metadata.
