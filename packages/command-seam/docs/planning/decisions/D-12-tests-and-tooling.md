---
id: D-12
type: decision
state: accepted
created: 2026-10-13
---

# D-12: Tests and tooling

## Decision

In the package:

- The tests use `bun:test` for now. They move to Vitest in a later release
  ([T-02](../tasks/T-02-vitest.md)).
- The examples import the package by its name, as a user would. CI builds
  before it tests, because under Node that name resolves to `dist/`.
- A test typechecks the code snippets in the README and in these decisions.
  It fails when one of its rules matches no snippet, so a stale rule cannot
  hide a broken snippet.
- Test titles describe behaviour. They carry no tracking ids.
- A test that needs a grandchild in its own session starts it with the
  test's own runtime, not with perl.
- `typecheck` covers the tests and the examples as well as the source.
- `tsconfig.json` extends `@osdlc/tsconfig/bun-lib`, because the tests
  use `bun:test`. `tsconfig.build.json` adds `@osdlc/tsconfig/build` and
  Node types only. The prettier config is `@osdlc/prettier-config`. Both
  config packages are devDependencies, as are `prettier` and `oxlint`, so
  `format` and `lint` run in a clean checkout.
- The workspace in osdlc/osdlc uses pnpm with a committed lockfile. Every
  GitHub Action there is pinned to a commit SHA. CI runs on Node 22 and 24,
  on Linux and macOS.

## Why

- Vitest runs on Node, which is what users run. The move is a port, not a
  rewrite, so it does not block the first release.
- Typechecked tests catch a test that calls the API wrongly.
- The runtime is always present, so the grandchild test never skips for a
  missing tool.
- A lockfile and pinned actions make CI repeatable and limit what a
  compromised dependency can do.
- Shared config packages keep one source for the compiler and format rules
  across the libraries hosted in osdlc/osdlc.

## Consequences

- Contributors need Bun as well as Node until the Vitest move.
- A clean `NODE_ENV` run of the whole suite is not added. The Node matrix
  and the Vitest move cover that case.
