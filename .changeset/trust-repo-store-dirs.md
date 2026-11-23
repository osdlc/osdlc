---
"@osdlc/trust-repo": minor
---

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

A tool that passes neither `vendorDirs` nor `dir` keeps exactly the place it
used before, so nothing moves until a tool opts in.

When a tool opts in and its new place differs from the old one
(`$XDG_STATE_HOME/<tool>/trusted/`, or `~/.local/state/<tool>/trusted/`), the
existing markers are copied to the new place once, checked, and recorded as
moved. When there is nothing to copy, the first grant in the new store
records the move, so a store this package wrote is never filled from the old
place later. After that only the new place is read. The old markers are
left as they were, so an older release of the tool keeps using the old place and
still finds every grant it knew; a grant it adds there later is not copied.
A copy that fails leaves no new store behind and makes the trust check fail,
so nothing runs without consent; the next run tries again.

While `<PREFIX>_ROOT`, `<PREFIX>_STATE_DIR` or `<PREFIX>_CONVENTION` is set,
or under tiered-dirs' test root, the store gets no old markers, whatever
folder it lands in, and never gets them later. The person is asked for
consent again there. The unmoved place moves once, the first time the tool
runs with none of those variables set. Fix the tool's convention in its
`dirs` factory, with `conventionFromEnv: false`, before it opts in.

`list`, `listGrants` and `tighten` used to be documented as never throwing.
They now throw when the store's directory cannot be resolved, for example for
a relative `<PREFIX>_ROOT`. A failed move does not make them throw.

A per-scope marker filed in another repository's `.scopes` folder is no
longer listed by `listGrants`, nor reported by `untrustAll` for a repository
whose grants it did not remove. `isTrusted` never read it, and the move does
not copy it.
