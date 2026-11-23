---
"@osdlc/trust-repo": minor
---

A grant can now name a repository as well as a folder. Pass
`{ repo: 'github.com/acme/api' }` wherever a store method, `resolveExecGate`,
`trustDecision`, `policyDecision` or `policyExecGate` takes a root. This is for
a clone a tool may prune and make again in another folder: a grant on its path
would be lost each time, a grant on its name is not.

A repository key is trimmed and lower-cased, and must be `host/owner/name`
with a real host name. `parseTrustRepo` checks one and throws a `TypeError`
a command line can report as a usage error. A repository and a folder never
share a grant: a folder named `github.com/acme/api` is still a path. Scopes
work the same for both.

`trust` results and `listGrants` entries now carry `kind`, `path` or `repo`.
`list` and `listGrants` return folders first, then repositories. In a policy,
`paths` never matches a repository, and `owners` matches the host and owner
the key names, without calling `ownerOf`. Stores without repository grants
read and behave as before.
