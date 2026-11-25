---
id: D-08
type: decision
state: accepted
created: 2026-11-22
---

# D-08: Framework-agnostic, with one DOM-shaped helper

## Decision

The package imports no UI framework and names no DOM type. The model, operations, history, geometry
and view model are plain data and functions. The view model is a class with events, so any
framework can subscribe to it.

One helper reads a rendered element: `getAnchorPoint` takes the structural type `PositionedBox`,
with inline `style.left` and `style.top` strings and `offsetWidth` and `offsetHeight`. A browser's
`HTMLElement` fits it. `getAnchorPointFromBounds` does the same job from numbers, for use outside a
browser.

## Why

- A renderer in any framework, a command-line tool and a server can share one implementation of the
  rules.
- A structural type keeps the declarations free of the DOM library, so a Node-only program compiles
  against them.
- The build config sets `types: []`, so a source file that uses a runtime global fails the build.

## Consequences

- The package runs on any JavaScript runtime with ES2022.
