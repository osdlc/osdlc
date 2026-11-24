---
"@osdlc/trust-repo": minor
---

**Breaking:** the `TrustStore` interface now has overloads that take
`{ repo }` beside a path. Code that implements `TrustStore` itself must
provide them, or delegate to the store `trustStore()` returns instead.

A grant can now name a repository as well as a folder. Pass
`{ repo: 'github.com/acme/api' }` wherever a store method, `resolveExecGate`,
`trustDecision`, `policyDecision` or `policyExecGate` takes a root. This is for
a clone a tool may prune and make again in another folder: a grant on its path
would be lost each time, a grant on its name is not.

A repository key is trimmed and lower-cased, and must be `host/owner/name`
with a real host name. A name ending in `.git` is refused, so
`github.com/acme/api.git` and `github.com/acme/api` are never two grants.
`parseTrustRepo` checks a key and throws a `TypeError` a command line can
report as a usage error. A repository and a folder never
share a grant: a folder named `github.com/acme/api` is still a path. Scopes
work the same for both.

`trust` results and `listGrants` entries now carry `kind`, `path` or `repo`.
`list` and `listGrants` return folders first, then repositories. In a policy,
`paths` never matches a repository, and `owners` matches the host and owner
the key names, without calling `ownerOf`. A store written before reads as it
did.

`resolveRoot` returns a key in the kind it was given: a path stays a string,
and `{ repo }` comes back as `{ repo }` with the key lower-cased, ready to pass
to the other methods. Code that implements `TrustStore` itself must now
provide these overloads.
