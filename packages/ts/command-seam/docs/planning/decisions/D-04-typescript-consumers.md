---
id: D-04
type: decision
state: accepted
created: 2026-10-13
---

# D-04: TypeScript consumers

## Decision

- Consumers need TypeScript 5.4 or later.
- The source keeps explicit `.ts` import paths. The build rewrites them to
  `.js` in the emitted JavaScript. The `.d.ts` files in `dist/` keep the
  `.ts` paths.
- The types use the `NodeJS` namespace, so `@types/node` is declared as an
  optional peer dependency (range `*`).

## Why

- Explicit `.ts` paths match the files on disk, so Node's type stripping and
  the type checker read the source as written.
- TypeScript 5 resolves `.ts` paths in declaration files. Older versions do
  not. The declarations also use `NoInfer`, which needs TypeScript 5.4, so 5.4
  is the floor. Older versions are rare enough that changing every import path
  is not worth it.
- Without `@types/node`, a user gets "Cannot find namespace 'NodeJS'", or,
  with `skipLibCheck`, types that silently become `any`. The optional peer
  records the need in the manifest. Most Node projects already have it.

## Consequences

- The README tells users to install `@types/node`. It also names the
  TypeScript 5.4 floor.
