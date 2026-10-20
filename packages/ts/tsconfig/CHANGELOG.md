# Changelog

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
