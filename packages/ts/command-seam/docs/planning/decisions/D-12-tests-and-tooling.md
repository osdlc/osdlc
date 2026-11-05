---
id: D-12
type: decision
state: accepted
created: 2026-10-13
---

# D-12: Tests and tooling

## Decision

In the package:

- The tests use Vitest on Node ([T-02](../tasks/T-02-vitest.md)). A probe that
  needs `bun` skips when no `bun` is on `PATH`.
- The examples import the package by its name, as a user would. CI builds
  before it tests, because under Node that name resolves to `dist/`.
- A test typechecks the code snippets in the README and in these decisions.
  It fails when one of its rules matches no snippet, so a stale rule cannot
  hide a broken snippet.
- Test titles describe behaviour. They carry no tracking ids.
- A test that needs a grandchild in its own session starts it with the
  test's own runtime, not with perl.
- A grandchild test that must also hold on Windows has a variant built from
  the test's own runtime (`process.execPath`), not `sh`, and that variant
  runs on every platform. Its grandchild is started `detached`, so only the
  behaviour under test can end it. The `sh` variant may stay, POSIX only.
- `typecheck` covers the tests and the examples as well as the source.
- `tsconfig.json` extends `@osdlc/tsconfig/node-lib`, with no `paths` and no
  `customConditions`: the package's own name and its workspace siblings resolve
  through `exports` to `dist/`, so the typecheck runs after the build.
  `vitest.config.ts` aliases the package's own name to its source for the
  examples. `tsconfig.build.json` adds `@osdlc/tsconfig/build` and
  Node types only. The prettier config is `@osdlc/prettier-config`. Both
  config packages are devDependencies, as are `prettier` and `oxlint`, so
  `format` and `lint` run in a clean checkout.
- The workspace in osdlc/osdlc uses pnpm with a committed lockfile. Every
  GitHub Action there is pinned to a commit SHA. CI runs on Node 22, 24 and
  26, on Linux and macOS. The suite also runs on Windows as tier 2
  (`packages-windows-tier2.yml`, Node 22 and 24), which reports but never
  blocks.

## Why

- Vitest runs on Node, which is what users run. The move is a port, not a
  rewrite, so it does not block the first release.
- Typechecked tests catch a test that calls the API wrongly.
- The runtime is always present, so the grandchild test never skips for a
  missing tool.
- On Windows the `sh` is Git Bash (MSYS). Its `$!` may not be a Windows
  pid, so a probe or a kill by that pid can reach some other process, and
  its writes to a closed pipe do not reliably fail. A Node process has a
  real pid and a write that fails. Node also kills the attached processes a
  Node parent started when that parent dies (a Windows job object), so an
  attached grandchild would die with the child and pass a test for the wrong
  reason ([#491](https://github.com/osdlc/osdlc/issues/491)).
- A lockfile and pinned actions make CI repeatable and limit what a
  compromised dependency can do.
- Shared config packages keep one source for the compiler and format rules
  across the libraries hosted in osdlc/osdlc.

## Consequences

- Contributors need only Node and pnpm. Build before typecheck and test.
- A clean `NODE_ENV` run of the whole suite is not added. The Node matrix
  and the Vitest move cover that case.
