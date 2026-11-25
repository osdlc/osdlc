---
id: D-02
type: decision
state: accepted
created: 2026-11-22
---

# D-02: The API for the first release

## Decision

The first public release keeps the API of the unpublished 0.3.1 with these changes. The owner
confirmed them on 2026-11-24.

| Change | Why |
| --- | --- |
| `htmlToMarkdown` is removed. | It converts a few HTML tags with regular expressions and has no caller. It is outside what the package is for. Reverse this if a user needs it: it is one file and its tests. |
| `SampleDataset` is removed. | A type for a demo, not for the format. The renderer defines its own. |
| `validateCanvas` is removed. | An alias of `validateCanvasData` with a narrower parameter. `validateCanvasData` and `isValidCanvas` stay. |
| `success`, `failure` and `generateId` are no longer exported. | They are plumbing for the handlers. `generateId` makes ids from `Math.random`, which is no contract to offer. |
| `getAnchorPoint` takes `PositionedBox`, a structural type, not an `HTMLElement`. | A program with no DOM types can compile against the declarations. An `HTMLElement` with inline `left` and `top` still fits. |
| `RESIZE_CURSORS` is typed `Record<NonNullable<ResizeDirection>, string>`. | A key that is not a direction is an error at compile time, and the lookup needs no cast. |
| `ErrorCode` and `ValidationErrorCode` may gain values in a minor release. | Say so in the TSDoc and the README, so a `switch` has a `default`. |
| The package ships compiled `dist/` with declarations and supports Node only. | Node does not run TypeScript under `node_modules`. |

Every other export stays as it was. The stability of each is in [D-03](D-03-version-line-and-stability.md).

## Why

- No version was published, so removing an export breaks no installed program. The one package in
  this repository that imports this one is moved in the same release.
- Each removal is an item that is not part of the package's job or that a caller should not depend
  on.

## Consequences

- A package that imported a removed item changes: `validateCanvas` becomes `validateCanvasData`, and
  `SampleDataset` moves to the package that needs it.
