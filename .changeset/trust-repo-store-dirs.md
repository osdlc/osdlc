---
"@osdlc/trust-repo": minor
---

**Breaking:** `list`, `listGrants` and `tighten` can now throw, when the
store's directory cannot be resolved (a relative `<PREFIX>_ROOT`, say). Catch
the error where you call them, or pass an absolute root.

A trust store can now live where the tool's other machine-local files live.
Pass `vendorDirs` (the same `{ vendor, envVars }` value `machineConfigFile`
takes) and the store is `<state home>/<tool>/trusted/`, resolved through
`@osdlc/tiered-dirs`. It follows the convention, Windows' own state home, and
the `<PREFIX>_ROOT` and `<PREFIX>_STATE_DIR` overrides. A `dirs` factory pins
the convention or injects a rooted tree. A tool under a family root passes
`app`, as in `{ tool: 'osdlc', app: 'pr-update' }`, and gets
`<state home>/osdlc/pr-update/trusted/`. Its grants are its own: no other app,
and not the family root, sees them. `trustStoreDir` takes the same options.
`envVars` and the `TrustVendorDirs` type are exported.

A tool that opts in reads only the new place. Grants made before, in the old
place (`$XDG_STATE_HOME/<tool>/trusted/`, or `~/.local/state/<tool>/trusted/`),
are not carried over, so the person runs the tool's `trust` command again,
once per tool per machine. The old markers are never read or touched, so an
older release of the tool keeps using the old place.
The new place is the old folder only on Linux, or macOS under `xdg`, with no
`app`, no `<PREFIX>_ROOT` or `<PREFIX>_STATE_DIR`, and an `XDG_STATE_HOME`
that is unset or absolute. There the grants are already in place; anywhere
else the store starts empty.

A `dirs` factory alone places the store. Passing `env` or `home` beside it
throws a `TypeError`, since they would be ignored; the factory closes over
them instead.

A tool that passes neither `vendorDirs` nor `dir` keeps exactly the place it
used before.

`list`, `listGrants` and `tighten` used to be documented as never throwing.
They now throw when the store's directory cannot be resolved, for example for
a relative `<PREFIX>_ROOT`.

A per-scope marker filed in another repository's `.scopes` folder is no
longer listed by `listGrants`, nor reported by `untrustAll` for a repository
whose grants it did not remove. `isTrusted` never read it.
