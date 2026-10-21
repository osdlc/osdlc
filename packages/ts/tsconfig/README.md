# @osdlc/tsconfig

Strict TypeScript compiler presets: one shared bar, plus the package shapes
that recur on top of it. Consumed through `extends`; ships no code.

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
| `build` | The emit block, as a mixin. Not a standalone config — see below. |

## Use

`base` and `source-shipped` differ by two options, and TypeScript couples them:
`allowImportingTsExtensions` is rejected unless `noEmit`, `emitDeclarationOnly`
or `rewriteRelativeImportExtensions` is set (TS5096). A package consumed as
TypeScript source, importing `./x.ts`, wants `source-shipped` (directly or
through `node-lib`, `bun-lib` or `vue`). A package that builds with tsc and
imports `./x.js` wants `base`.

```jsonc
// tsconfig.json — the family preset, then your own per-package facts
{
  "extends": "@osdlc/tsconfig/node-lib",
  "include": ["index.ts", "sync.ts"]
}
```

`lib`, `types`, `jsx` and `include` are genuine per-package facts, so a package
still states the ones where it really differs from its preset. What it should
not restate is anything the preset already says.

The emit mixin goes **last in an array**, on top of the package's own config:

```jsonc
// tsconfig.build.json
{
  "extends": ["./tsconfig.json", "@osdlc/tsconfig/build"],
  "compilerOptions": { "rootDir": "." }
}
```

TypeScript applies array entries left to right, and the extending file's own
`compilerOptions` last — so `build`'s `noEmit: false` lands on top of the dev
config's `noEmit: true`, while `rootDir` and `include` stay where they belong.
`build` deliberately declares no `extends` and no `include`; `presets/build.json`
explains why each of those would break silently.

## Adding a preset

Add the file under `presets/`, **and add both its `exports` keys** (the
extensionless and `.json` spellings) to `package.json`. Then add it to
`tests/resolve.json`. Skipping the `exports` entry still resolves from inside
this package and breaks every consumer; `npm run typecheck` (tsc over
`tests/resolve.json`) is what catches that.

## Not for framework-generated configs

A config that extends `./.nuxt/tsconfig.json` or `astro/tsconfigs/*` must stay
that way. Layering this bar on top would clobber the `paths`, `types`,
`moduleResolution` and `jsx` the generator computed.

## Source and releases

Developed and released in
[osdlc/osdlc](https://github.com/osdlc/osdlc/tree/main/packages/ts/tsconfig),
under `packages/ts/tsconfig`. Report issues at
[osdlc/osdlc/issues](https://github.com/osdlc/osdlc/issues).

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
