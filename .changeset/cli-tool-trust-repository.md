---
"@osdlc/cli-tool": minor
---

**Breaking:** a word after `--` in the `trust` command is now a usage error,
where it was ignored. Drop the words after `--`, or give the repository
before it to a service with `parseRepo`.

The shared `trust` command can take a repository by name, such as
`tooly trust github.com/acme/api`, for a clone whose folder the tool may
prune and make again. A tool turns this on by giving its `TrustService` a
`parseRepo` (with `@osdlc/trust-repo`, its `parseTrustRepo`). The service then
receives the repository as `req.repo` in `trust`, `--untrust`,
`--untrust-all` and `--show`, and `--scope` works with it. A repository the
service refuses, or one given with `--list`, is a usage error, and so is
any word after `--`, which before was ignored. With no
repository the command acts on the working directory, as before, and a
service without `parseRepo` takes no argument at all. `untrustAll` now also
receives the request, and an entry can say `kind: 'repo'`.
