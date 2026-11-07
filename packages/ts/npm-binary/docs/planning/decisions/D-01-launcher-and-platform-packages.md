---
id: D-01
type: decision
state: accepted
created: 2026-11-07
---

# D-01: A launcher package and one package per platform, selected by npm

## Decision

- A product ships one launcher package and one package per platform. Each
  platform package sets `os` and `cpu`, and the launcher lists every one in
  `optionalDependencies` at its own version. npm installs only the package
  that matches the host.
- The launcher's `bin` is a small CommonJS script with no dependencies. It
  resolves `<platform package>/package.json` and runs the binary beside it.
- The library is a set of functions a release script calls. It does not
  build binaries, choose versions or tag releases; the product keeps its own
  build step and names.

## Why

- No install script runs, so the install works under `--ignore-scripts`, and
  nothing is downloaded from outside the registry. A postinstall download
  breaks behind proxies and in locked-down CI.
- One package that carries every platform's binary makes every user download
  all of them.
- Functions keep the library small and leave the release pipeline to the
  product. Two products with different build tools (cargo and
  `bun build --compile`) use the same functions.

## Alternatives weighed

- A release orchestrator that also writes npm platform packages
  ([putitoutthere](https://www.npmjs.com/package/putitoutthere)): it owns the
  whole release, its npm layout is not a public API, and it needs Node 24.
  Adopting it means replacing each product's release pipeline.
- [`@napi-rs/cli`](https://www.npmjs.com/package/@napi-rs/cli): the same
  layout for Node-API addons, not for executables run through `bin`.
- [`binary-install`](https://www.npmjs.com/package/binary-install) and
  similar: download at install time, which this decision avoids.
- [`npm-binary`](https://www.npmjs.com/package/npm-binary): an unrelated,
  unscoped package with no release since 2022.

## Consequences

- An install with optional dependencies turned off (`--omit=optional`), or
  from a lockfile made on another platform, has no platform package. The
  launcher names the package and the cause.
- Platform packages are gated by `os` and `cpu` only, with no `libc` field, so
  one Linux package serves glibc and musl hosts. Products ship a static (musl)
  Linux build. The README says so.
