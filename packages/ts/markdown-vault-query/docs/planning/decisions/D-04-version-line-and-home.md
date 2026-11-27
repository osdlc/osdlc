---
id: D-04
type: decision
state: accepted
created: 2026-11-22
---

# D-04: Version line, home and runtimes

## Decision

- The first public release is `0.5.0`, on the 0.x line. Before it the package had versions up to
  `0.4.1`. They were never published, and the CHANGELOG keeps their history.
- The package lives in osdlc/osdlc under `packages/ts/markdown-vault-query` and is published beside
  `@osdlc/markdown-vault`, which it imports at run time. The two are released together.
- Node.js 22 or later, ESM only, compiled `dist/` with `.d.ts`.
- Linux and macOS are tested. Windows is not tested ([T-02](../tasks/T-02-windows.md)).

## Why

- The version comes from replaying the development history under semver: one bump per merged
  change, a minor bump for each breaking change. The last breaking change was recent and the
  package has one consumer, so it is not ready for 1.0.
- The first release is a minor bump from the replayed `0.4.1`, because the move changes the
  package: it ships `dist/`, it runs on Node only, and some exports are renamed or tagged
  experimental ([D-03](D-03-api-and-stability-tiers.md)).
- A planned corpus model may replace the vault index under this package
  ([T-05](../tasks/T-05-corpus-model.md)). Publishing both packages at 0.x now means a breaking
  change in `@osdlc/markdown-vault` is a minor release here.
- The package's own engines range is never wider than its dependency's. The tests pass on Node 22.

## Would reopen it

The corpus model absorbing `@osdlc/markdown-vault`, or a first outside consumer asking for a stable
surface.
