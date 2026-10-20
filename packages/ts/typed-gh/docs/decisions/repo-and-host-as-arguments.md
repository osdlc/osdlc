---
type: decision
state: proposed
created: 2026-10-20
---

# The client names its repo and host in the argv

## Decision

- `Gh` and `AsyncGh` take two optional options: `repo` (`owner/name`) and
  `hostname`. `withRepo(repo)` returns the same client aimed at another repo,
  keeping the runner and the hostname.
- The target goes into each verb's argv:
  - `pr`, `issue` and `label` verbs get `--repo <host>/<owner>/<name>`.
  - `api` and `api graphql` verbs fill `{owner}` and `{repo}` themselves and
    get `--hostname`.
  - `auth status` gets `--hostname`.
  - `repo list` and `repo view` take the owner or repo as a positional
    argument, and `GH_HOST` for the host.
- `gh search` has no host flag. `GhVerb` gains an optional `env` field, used
  only to set `GH_HOST` on a search.
- With no `repo` option, the client adds nothing, and gh works out the repo
  from `cwd` as today. The library does not look up an ambient repo, and a
  failure is null like any query.
- `hostname` is any GitHub host: `github.com`, a GitHub Enterprise Server host,
  or a `<tenant>.ghe.com` host. Other forges (Forgejo, Gitea, GitLab) are out
  of scope; gh does not speak their APIs.

## Why

- Many consumers name the repository, have no clone, or target an Enterprise
  host. Today only `prList` takes a repo and nothing takes a host.
- With arguments, a `CommandFailed` error and a test both show which repo and
  host a call hit. With `GH_REPO` and `GH_HOST` in the environment they would
  not.
- A verb stays complete on its own, as the three-modes decision requires. A
  verb run through a caller's own runner hits the repo its argv names, not
  whatever the environment says.

## Consequences

- Every verb builder that touches a repo takes the target as a parameter.
  The `api` verbs carry a little more code to fill the placeholders.
- `parsePrUrl` accepts Enterprise hosts and returns `hostname`.
- A caller that relied on `{owner}/{repo}` resolving from the clone still gets
  that when it passes no `repo`.
