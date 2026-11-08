---
id: D-02
type: decision
state: proposed
created: 2026-11-08
---

# D-02: Version line and stability

Pending the owner's sign-off.

## Decision

- The first published version is `0.1.0`, following version 0 of the markdown-db spec.
- All eight exports are stable within 0.x: `findCorpora`, `validateCorpus`, `CorpusReport`,
  `Data`, `idProblem`, `fold`, `markdownLink` and `encodePath`. None carries `@experimental`, and
  the README's experimental list is empty. A test checks that the two agree.
- A minor release may change any export, and the CHANGELOG marks it as breaking. A patch
  release does not.
- The `<file>: <field>` prefix of a problem line is part of the contract, as the spec fixes it.
  The message text is not.

## Why

- The package and the spec are a few days old, so a 1.0 promise would come too early.
- The exports are few and each one is tested and used by its first consumer. Marking some as
  experimental would say nothing more than 0.x already says.

## Consequences

- A change to the spec's version 0 that changes what is reported comes in a minor release.
- An export added later that is not settled carries `@experimental` and is listed in the README.
