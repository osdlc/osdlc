---
id: T-03
type: task
state: open
created: 2026-11-22
---

# T-03: Drop the declarations step

## Goal

`vue-tsc` writes declarations that resolve under Node as they are, and `scripts/declarations.mjs` is
deleted.

## Today

`vue-tsc` writes a relative specifier as the source has it. The declarations name `./markdown.ts`,
`./components/Canvas/index.vue` and `./index.css`, none of which resolves from `dist/`. The
preset's rewrite of `.ts` to `.js` cannot be on, because TypeScript then rejects every import of a
`.vue` file. `scripts/declarations.mjs` rewrites the three kinds after the emit (see
[D-05](../decisions/D-05-build-and-stylesheet.md)).

## Approach

- [ ] Check each `vue-tsc` and TypeScript release for a setting that rewrites a `.vue` specifier.
- [ ] When one exists, turn it on, delete the script and remove it from the `build` script.

## Acceptance criteria

- [ ] `package-checks ts` passes with the script removed.
