# @osdlc/tsconfig

Strict TypeScript compiler presets: one shared strictness bar, plus presets for
the common package kinds built on it. You use them through `extends`. The
package ships no code.

## Install

```sh
npm install --save-dev @osdlc/tsconfig typescript
```

`pnpm add -D @osdlc/tsconfig typescript` and `yarn add -D @osdlc/tsconfig typescript` work too.

Requires TypeScript 5.7 or later (`build` uses `rewriteRelativeImportExtensions`
and the `${configDir}` template).

## Presets

| Preset | What it is |
|---|---|
| `base` | The shared bar, carrying nothing specific to how a package ships. |
| `source-shipped` | `base` + `allowImportingTsExtensions` and `noEmit`, for a package consumed as TypeScript source rather than as built `dist/`. |
| `node-lib` | `source-shipped` + the ES2022 runtime and node globals. |
| `bun-lib` | `node-lib` + bun's globals, for a package whose tests or runtime are Bun. |
| `vue` | `source-shipped` + the modern browser, the DOM, `jsx: preserve`, and no ambient types. |
| `build` | The emit options, as a mixin. Not a standalone config. See below. |

## Use

`base` and `source-shipped` differ by two options, and TypeScript requires them
together. It rejects `allowImportingTsExtensions` unless `noEmit`,
`emitDeclarationOnly` or `rewriteRelativeImportExtensions` is set (TS5096). A
package consumed as TypeScript source, importing `./x.ts`, uses
`source-shipped` (directly or through `node-lib`, `bun-lib` or `vue`). A package
that builds with tsc and imports `./x.js` uses `base`.

```jsonc
// tsconfig.json — the family preset, then your own per-package facts
{
  "extends": "@osdlc/tsconfig/node-lib",
  "include": ["index.ts", "sync.ts"]
}
```

`lib`, `types`, `jsx` and `include` differ between packages, so a package
still sets the ones where it differs from its preset. It should not repeat
anything the preset already sets.

The emit mixin goes last in an array, after the package's own config:

```jsonc
// tsconfig.build.json
{
  "extends": ["./tsconfig.json", "@osdlc/tsconfig/build"],
  "compilerOptions": { "rootDir": "." }
}
```

TypeScript applies array entries left to right, and the extending file's own
`compilerOptions` last. So `build`'s `noEmit: false` overrides the dev config's
`noEmit: true`, while `rootDir` and `include` come from the package. `build`
declares no `extends` and no `include` on purpose. `presets/build.json` explains
how each would break the build without an error.

## Adding a preset

Add the file under `presets/`, and add both its `exports` keys (with and
without `.json`) to `package.json`. Then add it to `tests/resolve.json`. Without
the `exports` entry the preset still resolves from inside this package, but
every consumer breaks. `npm run typecheck` (tsc over `tests/resolve.json`)
catches that.

## Not for framework-generated configs

A config that extends `./.nuxt/tsconfig.json` or `astro/tsconfigs/*` should
keep extending only that. Adding these presets on top would overwrite the
`paths`, `types`, `moduleResolution` and `jsx` the generator computed.

## Source and releases

Developed and released in
[osdlc/osdlc](https://github.com/osdlc/osdlc/tree/main/packages/ts/tsconfig),
under `packages/ts/tsconfig`. Report issues at
[osdlc/osdlc/issues](https://github.com/osdlc/osdlc/issues).

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
