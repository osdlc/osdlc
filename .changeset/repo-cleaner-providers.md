---
"@osdlc/repo-cleaner": minor
---

Pull request evidence now comes from a provider, and GitLab is one (prototype). `--provider auto|github|gitlab|none` on every sweeping command picks it; `auto`, the default, reads the remote's host, so a `gitlab` host asks `glab` for merge requests and any other host asks `gh` as before. `--no-gh` is `--provider none`. A plan records the choice for `apply`'s re-check. **Breaking (library):** `RepoInfo.provider` says which provider was asked and what its probe found, and replaces `hasGh` and `ghAuthenticated`. The `noGh` sweep and plan option is now `noProvider`. `fetchPrs` takes a provider (`githubProvider(gh)` for the old `Gh` form), and its third argument is an exact branch, not a prefix. The plan file keeps its `no_gh` field. Not yet done: Gitea, Forgejo, Bitbucket, a host-to-provider config, GitLab squash metadata, and GitLab installed under a sub-path. Without `--remotes` no provider is asked.
