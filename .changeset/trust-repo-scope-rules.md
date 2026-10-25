---
'@osdlc/trust-repo': minor
---

Stricter scopes, and an `untrustAll` that removes everything.

- New `parseTrustScope(input)`: a scope a person typed, trimmed and checked, with `*` refused. A CLI calls it on a `--scope` value and reports the `TypeError` as a usage error.
- `untrustAll(root)` now removes the root's marker and its whole `.scopes/` folder by path. Before, a grant stored under an untrimmed scope (`'foo '`) survived it.
- `listGrants()` no longer lists a per-scope marker whose file name is not the one its scope maps to. `isTrusted` never found such a marker, so it was not a working grant.
- A scope named after an `Object.prototype` member (`constructor`, `__proto__`) is now an ordinary scope. Before, `policyDecision` threw on it.

**Breaking changes**

- Every store method trims its scope, so `'just '` and `'just'` are one grant, and a blank scope (`' '`) throws a `TypeError`. What to do: nothing, unless you stored scopes with surrounding spaces on purpose. A grant an older release stored under such a scope no longer counts; grant it again.
- `trust(root, '*')` now throws a `TypeError`. A whole-repository grant is `trust(root)`, with no scope, so a typed scope cannot widen into one. `isTrusted`, `untrust` and `markerPath` still accept `'*'`. What to do: replace `trust(root, WHOLE_REPO_SCOPE)` with `trust(root)`.
- `engines.node` is `^22.22.2 || ^24.15.0 || >=26.0.0`, narrowed from `>=22`. Node 22.0 to 22.22.1, 23, 24.0 to 24.14 and 25 are no longer supported. What to do: upgrade Node to a supported release.
