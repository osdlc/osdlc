---
id: D-02
type: decision
state: accepted
created: 2026-11-08
---

# D-02: First version and stability

## Decision

- The first public version is 0.8.0. `package.json` was set to 0.7.1 by hand, the last version of the history, and a minor changeset makes the release 0.8.0. Changesets drive every version after it.
- The package stays 0.x. The vault-as-a-setting change was breaking, and the API is not yet frozen.
- `RunOptions`, `RewriteOptions`, `FileRewriteResult` and `Direction` are exported, because public signatures use them.
- `rewriteFile`, `buildRefIndex`, `resolveRef`, `pathKey` and `exportVault` are `@experimental`: reachable, but free to change in a minor release. The README lists them, and a test compares that list with the tags.
- `remarkWikilinksFromConfig` takes `{ vault }`, like `loadConfig`.
- The package no longer re-exports `WIKILINK_RE`, `FIELD_MAX` and `MAX_SCAN_LENGTH` from `@osdlc/markdown-render`.
- One named error class, to let the options grow, is deferred to 0.9.

## Why

- Callers that sit outside the package need the types in its signatures, and a dependency's constants are not this package's API.
- Marking the helpers experimental keeps them usable without promising them.

## Consequences

A breaking change to a stable item needs a minor release and a changelog entry marked Breaking.
