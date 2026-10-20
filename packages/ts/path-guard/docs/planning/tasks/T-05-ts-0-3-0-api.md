---
id: T-05
type: task
state: open
created: 2026-10-20
---

# T-05: TypeScript 0.3.0 API

## Goal

`@osdlc/path-guard` ships the 0.3.0 shape that
[D-06](../decisions/D-06-api-makes-the-filesystem-visible.md) sets: a
`lexical` namespace, a `PathGuard` class bound to one `Resolver`, a `./node`
entry for the real disk, and the split error kinds.

## Today

`index.ts` exports a flat API. `resolve.ts` and `contained.ts` import
`node:fs` and `node:path`, so `.` loads Node. The `Resolver` is an optional
last argument that defaults to `nodeResolver`. `isInside`, `lexicalAbsolute`
and `realpathOrSelf` read cwd for relative input. `./lexical` already ships
`validateRelative`, `isUnder`, `toRelative` and `PathError`, and loads no
`node:` module.

## Approach

1. Add the `lexical` namespace: `validateRelative`, `isUnder`,
   `absolute(path, cwd)` and `toRelative`. A relative path where an absolute
   one is required throws `PathError` of kind `not_absolute`.
2. Add `guard.ts` with `PathGuard`: `resolve`, `tryResolve`, `contains` and
   `realPath`. Move the walk from `resolve.ts` into it unchanged.
3. Add `node.ts` with `nodeResolver`, `nodeGuard` and the race-checked file
   helpers from `contained.ts`. Add `./node` to `exports`.
4. Make `.` import no `node:` module.
5. Add the kinds `unresolvable`, `empty_root`, `not_under_root` and
   `not_absolute` to `PathErrorKind`. Throw each where D-06 says.
6. Remove `isInside`, `realpathOrSelf`, `canonicalExistingPrefix`,
   `lexicalAbsolute`, `resolveInside`, `tryResolveInside` and the flat
   `contains`, unless the owner keeps them as deprecated exports.
7. Apply the owner's answers to D-06's open questions.

## Acceptance criteria

- [ ] The package version is 0.3.0.
- [ ] `exports` has the entries D-06 names, and a test fails on any `node:`
      import reachable from `.` or `./lexical`.
- [ ] `PathGuard` driven by an in-memory `Resolver` passes the filesystem
      cases with no disk access.
- [ ] The parity test passes against the 0.3.0 fixture
      ([T-06](T-06-parity-fixture-0-3-0.md)).
- [ ] The smoke test imports every entry from the packed tarball.
- [ ] The README, TSDoc and CHANGELOG describe the new shape, each removed or
      moved export and its replacement, and name the Rust twin version.
- [ ] [D-05](../decisions/D-05-kept-names-for-0-2.md) is marked
      `superseded` by D-06.
- [ ] The PR links the Rust PR ([T-04](T-04-rust-0-3-0-api.md)), as the
      [twin rule](../../../../../README.md#twin-libraries) asks.
