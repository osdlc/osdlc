# S-0001: Package shape, TypeScript

## Purpose

Every TypeScript library under `packages/ts/` has the same shape, so a change
that fixes one library fixes the rest, and a consumer meets the same layout in
each. This standard says what that shape is.

## Rule

- **Dist-only ESM with `.d.ts`.** The tarball ships `dist/` plus the README,
  CHANGELOG, licences, SECURITY and CONTRIBUTING (and a `bin/` or `docs/` a
  library already ships). No TypeScript source ships; a hand-written `.d.ts`
  is the one exception. Each `exports` entry is exactly
  `{ "types": "./dist/X.d.ts", "default": "./dist/X.js" }`, with no `bun`
  condition. Bun still works, through the compiled `dist/`. The tarball ships
  no source maps, since they would point at the unshipped source.
- **Node 22 or later**, as each library's `engines.node` says. A library's
  range is never wider than a workspace dependency's, so the ones that depend on
  `@osdlc/typed-git` carry its `^22.22.2 || ^24.15.0 || >=26.0.0`.
- **Vitest under Node** for every test, with a `vitest.config.ts` in the
  library. No script invokes `bun`, and `@types/bun` is not a dependency.
- **pnpm** installs and runs the scripts.
- **Build first.** Libraries resolve each other, and their own name, through
  `exports` to `dist/`. `tsconfig.json` has no `customConditions`, and no
  `paths` entry maps to a file outside the package (a sibling's source
  included), so the build config adds no bun types. A library's `vitest.config.ts` may alias its
  own name to its source, so its examples run on the source without a build.
- **Metadata.** `author` is `sksizer`, and `license` is `MIT OR Apache-2.0`,
  the one licence every library declares.
- **Source in `src/`, tests in `tests/`, examples in `examples/`.** No
  TypeScript sits at the package root but `vitest.config.ts`, and no
  `*.test.ts` sits under `src/`. `tsconfig.build.json` emits `src` with
  `rootDir: "src"`, so `src/a/b.ts` becomes `dist/a/b.js`. `examples/` holds a
  `*.test.ts` that runs the README example through the package name. Docs live
  in `docs/planning/`, with a README index, and a user guide in `docs/guide/`,
  which the site publishes under the library's page.
- **The same scripts and files.** `typecheck` checks the source and the build
  config, `smoke` runs `tests/smoke.mjs`, the CHANGELOG starts
  `# @osdlc/<name>`, the README has `## Install` and `## Licence`, and
  `.gitignore` lists `node_modules/`, `dist/` and `coverage/`. There is no
  coverage threshold.
- **One lint config and one catalog.** `.oxlintrc.json` at the repository root
  is the only one; oxlint finds it from every package. A third-party version
  that more than one package uses, and the shared dev tooling, is pinned once
  in `pnpm-workspace.yaml`'s `catalog:` and written `"catalog:"` in the
  package. `pnpm pack` turns `catalog:` and `workspace:` into versions in the
  packed manifest.
- **The config packages** (`tsconfig`, `prettier-config`) ship JSON and no
  code. They are exempt from the build, test, `src/`, examples and smoke
  rules, and are ESM with an `exports` map, `sideEffects: false`, SECURITY.md
  and CONTRIBUTING.md.

## Enforcement

`scripts/package-shape-ts.mjs` holds the checks, as functions over data that
`scripts/check-packages.mjs` reads from each package and from its packed
tarball. `scripts/package-shape-ts.test.mjs` tests them.

```sh
pnpm run build
pnpm run check:packages
```

CI runs the same two steps in `.github/workflows/packages-ci.yml`. The check
also packs each library, runs publint and Are The Types Wrong on the tarball,
and loads it in a clean consumer project.

## Exemptions

The two config packages, `tsconfig` and `prettier-config`, ship JSON and no
code. They are exempt from the build, test, `src/`, examples and smoke rules,
and keep the config-package rules instead (see the last rule above). No other
package is exempt.
