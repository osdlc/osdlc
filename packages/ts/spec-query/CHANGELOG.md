# @osdlc/spec-query

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- `decode`, `decodeEntries`, `encode` and `specQueryKeys` no longer read inherited names such as
  `valueOf` as a declared type (it threw `TypeError`); only an own entry of `types` naming a real
  field type counts.
- A `__proto__` key in defaults, a patch or a decoded path is now copied as plain data by `diff`,
  `merge` and the decoders, so the result keeps `Object.prototype` and nothing is polluted.
- `encode` and `encodeEntries` drop a string, or a key, holding a lone surrogate instead of throwing
  `URIError`.
- `diff` and `merge` treat a `Date`, `Map` or class instance as one opaque value instead of an empty
  object, so two different dates now differ.
- `decode` keeps valid `%XX` escapes around a malformed one (`a%20b%` reads `a b%`) instead of
  leaving the whole text undecoded.
- `diff` tells `NaN` and `Infinity` apart from `null`.
- `diff` returns a fresh copy; mutating the result no longer changes the input.

### Changed

- The package ships built ESM from `dist/` only, with types beside it; tests live in
  `tests/` and run under Vitest; licence is now `MIT OR Apache-2.0` (adds `LICENSE-APACHE`), with
  `SECURITY.md` and `CONTRIBUTING.md`.

## [0.1.0] - 2026-09-07

### Added

- Initial release: `diff`/`merge` of a value against a defaults object, and
  `encode`/`decode` of that difference as a readable query string, so view state can live in the URL. No dependencies.
