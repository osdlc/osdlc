---
'@osdlc/code-host': minor
---

Behaviour change: a Forgejo PR whose head repository is unknown is now reported `isCrossRepository: true` by `listPrDetails`, as `getPr` already read it as a fork. A caller never takes such a PR's branch for a branch of this repository.
GitHub is detected from the remote's parsed hostname (`github.com` or a subdomain), so a URL that only mentions `github.com` in its path, or a host such as `notgithub.com`, is taken as Forgejo. The Forgejo PR listing now reads every page, with the author filter applied before the limit, and keeps paging when the server's `MAX_RESPONSE_ITEMS` is below the page size asked for. GitHub's `listComments` and the review comments `getPr` reads now cover every page; both use `gh api --paginate --slurp`, which needs gh 2.48 or later. A CR or LF in the Forgejo token is dropped, so it can no longer add a curl option.
Behaviour change (stricter): the default Forgejo runner (`selectCodeHost` without `curl`) runs `curl` only from an absolute `PATH` entry. It runs in the repository and reads the token on stdin, so a `curl` the repository ships, found through a relative or empty `PATH` entry, no longer receives the token; with no `curl` on an absolute entry the run fails as `curl` not found.
