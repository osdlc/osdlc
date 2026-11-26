---
id: D-05
type: decision
state: accepted
created: 2026-11-22
---

# D-05: Build: compiled `dist/` and one stylesheet

## Decision

- The package ships compiled JavaScript and declarations in `dist/`, not its `.ts` and `.vue`
  source. Node does not run TypeScript under `node_modules`, and the home's package shape requires
  `dist/`.
- A Vite library build writes `dist/index.js` and `dist/style.css`. `vue`,
  `@osdlc/json-canvas-core` and `dompurify` are external: a consumer installs them.
- `vue-tsc` writes the declarations. `scripts/declarations.mjs` then rewrites the `.ts` and `.vue`
  specifiers in them to `.js` and `.vue.js`, which Node resolution finds, and removes the
  stylesheet import.
- The Vite config lives in `vitest.config.ts`, because the home allows no other TypeScript file at
  the package root. Tests and the build compile the single-file components with the same plugin.
- The built JavaScript does not import CSS. The host imports `@osdlc/json-canvas-vue/style.css`
  once. `src/index.ts` keeps `import './index.css'` because Vite needs it to write the stylesheet.
- `typecheck` runs `vue-tsc`, which reads the single-file components.

## Alternatives

- Ship the source and let the host's bundler compile it, as the unpublished versions did. The home's
  checks refuse it, and a Node consumer cannot load it.
- Inline the CSS into the JavaScript. A host that has a content security policy, or that wants to
  override the theme, is better served by a stylesheet it controls.

## Why

- Every consumer, Node or bundler, loads the same files, and the package checks can pack and install
  it.
- A bare dependency's `import './index.css'` did not survive a Nuxt client build. One explicit
  stylesheet import is the same in every host.

## Consequences

- `build` runs before `typecheck`, because the examples import the package by name and resolve it
  through `exports`.
- T-03 tracks removing the declarations step.
