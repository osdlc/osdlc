# @osdlc/tsconfig

## 0.4.1

### Patch Changes

- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.

## 0.4.0

### Minor Changes

- ac5f0d1: The licence is now `MIT OR Apache-2.0`, with `LICENSE-MIT` and `LICENSE-APACHE`. It was `MIT`.

## [0.3.3] - 2026-10-16

### Changed

- Renamed from `@sksizer/tsconfig`. No other changes.
- To move, replace `@sksizer/tsconfig` with `@osdlc/tsconfig` in `devDependencies` and in every
  `extends`.

## [0.3.2] - 2026-10-15

### Changed

- First release made from [sksizer/sdlc](https://github.com/sksizer/sdlc) CI, through npm trusted
  publishing, so the package now carries provenance. The package contents are unchanged.

## [0.3.1] - 2026-10-15

### Changed

- Published to npm from [sksizer/sdlc](https://github.com/sksizer/sdlc), with a LICENSE file
  and a README written for outside readers. The resolution probe runs as `npm run typecheck`.

## [0.3.0] - 2026-09-06

### Changed

- **BREAKING:** `exactOptionalPropertyTypes` moves into the shared `base` preset, so every consumer
  now compiles under it.

## [0.2.0] - 2026-09-04

### Changed

- **BREAKING:** Shipping-model options split out of the shared bar into the `source-shipped` preset;
  `base` no longer carries them.

### Fixed

- Presets no longer resolve a sibling package to a `dist/` nothing builds.
- Presets stop naming internal packages and counts in their docs.

## [0.1.0] - 2026-09-01

### Added

- Initial `@sksizer/tsconfig` workspace package: the shared compiler bar as `base`, plus `node-lib`,
  `bun-lib`, `build` and `vue` presets.
- A `bun` resolution condition.
