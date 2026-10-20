---
id: T-01
type: task
state: done
created: 2026-10-19
---

# T-01: A browser-safe `./lexical` entry point

## Goal

A pure package or a browser bundle can import the text checks without
pulling in Node. `@osdlc/path-guard/lexical` exports `validateRelative`,
`PathError`, `PathErrorKind`, a text-only containment check and `toRelative`.
Nothing it loads imports `node:*`.

## Today

The package has one entry point, `.`. `index.ts` re-exports `resolve.ts`,
which imports `node:fs` and `node:path`, and `contained.ts`, which imports
`node:fs`, `node:fs/promises` and `node:path`. Any import of the package
loads them.

| Export | Module | Pure today |
| --- | --- | --- |
| `validateRelative`, `PathError`, `PathErrorKind` | `lexical.ts` | yes, no imports |
| `toRelative` | `resolve.ts` | its logic is pure, but its module imports `node:fs` |
| `isInside` | `contained.ts` | no, uses `node:path` `relative` and `sep` |

A consumer that hit this: the dev repo's ontology package is pure and also
loads in a dashboard's browser bundle. Its three schema checks cannot import
path-guard, so they keep their own one-line checks until this lands.

## Approach

1. Add `./lexical` to `exports` in `package.json`, built from a `lexical.ts`
   that imports nothing from Node.
2. Move `toRelative` and the helpers it uses (`components`, `startsWith`)
   into a pure module. `resolve.ts` imports them from there.
3. Add a POSIX text containment check with no `node:path`. Keep `isInside`
   in `.` as it is, so 0.2.x callers see no change.
4. Keep `.` exporting everything it does today. The change is additive, so
   it can ship in a 0.2.x patch or minor release before the 0.3.0 redesign.
5. Add a test that bundles `./lexical` for the browser, or scans its built
   files, and fails on any `node:` import.

## Notes

- Shipped in 0.2.3. The text-only containment check is `isUnder`.
- The API review planned for 0.3.0 puts the text checks in a `lexical`
  namespace with no ambient state. Whether 0.3.0 keeps the `./lexical`
  subpath is decided then.
- The Rust crate needs no change: it has no browser build.
