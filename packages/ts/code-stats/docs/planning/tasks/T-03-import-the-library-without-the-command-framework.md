---
id: T-03
type: task
state: open
created: 2026-11-22
---

# T-03: Import the library without the command framework

## Goal

`import '@osdlc/code-stats'` loads what measuring needs, and no command framework.

## Today

The library entry, `src/index.ts`, exports `CodeStatsError` from `src/error.ts`. That file imports
`failureOf` from the root of `@osdlc/cli-tool`, to read the failure that `@osdlc/typed-git` or
`@osdlc/typed-gh` classified. The root of `@osdlc/cli-tool` is the command framework, and no
subpath of it exports `failureOf` by itself. So a program that only measures a folder loads the
framework too. Nothing else outside `src/cli/` imports `@osdlc/cli-tool`.

The command in `src/cli/` is built on the framework, so `@osdlc/cli-tool` stays a dependency.

## Approach

1. Give `failureOf` a light home. Two candidates: a subpath of `@osdlc/cli-tool` that holds only
   the failure module, or `@osdlc/result`, which already holds the `Failure` type it returns.
2. Import it from there in `src/error.ts`.
3. Add a test that imports the built library entry in a fresh process and fails when it loads a
   module of the framework.
4. Remove the sentence about this from the README's Install section.

## Acceptance criteria

- [ ] `src/error.ts` does not import the root of `@osdlc/cli-tool`.
- [ ] A test imports `dist/index.js` and finds no `commander` module loaded.
- [ ] The command's exit codes and hints are unchanged.
