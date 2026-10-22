# TypeScript runtime and layout

How TypeScript code in `plugin/` runs, in BOTH of the forms it ships in, and
where it lives. The plugin ships two kinds of TypeScript — single-shot
entry-point scripts and multi-file importable libraries — and it runs in two
forms: the **dev/workspace source tree run by Bun** and the **compiled `bun`
binary that ships to consumers**. This document records that model, the portable
idioms in the shared source, the launcher, the directory split between the code
categories, how a script imports a library, how tests discover libraries, and
the canonical reference implementation to copy when adding a new library.

## Two forms, one source tree, one runtime

The same `solutions/ontological/lib/**` + `solutions/ontological/cli/**` source ships in two forms
([[D-0014-cli-primary-npm-distribution]], [[D-2APS-sdlc-standalone-binary-app]]),
both running under **Bun**:

- **Dev / workspace — Bun runs the `.ts` directly.** In this repo (and any
  plugin checkout) Bun is the runtime and the test runner. There is no build
  step: `bun run solutions/ontological/cli/sdlc.ts …` executes the TypeScript with no
  transpile, no `dist/` to keep in sync, no type-stripping tool.

- **Consumers — a compiled `bun` binary.** `bun build --compile`
  (`solutions/ontological/scripts/build-binary.ts`) bundles the source plus its deps and an
  embedded copy of the Bun runtime into one self-contained executable per
  platform, distributed on npm as a per-platform `optionalDependency` behind a
  thin Node shim (see "The compiled binary" below). Consumers need neither Bun
  nor Node's own module resolution — the binary carries everything.

Because Bun runs BOTH forms, the source has no plain-Node-compatibility
constraint: `Bun.*` globals, `bun:*` imports, and the Bun `import.meta` idioms
are all fine in shipped code.

### Portable idioms — `@lib/util/runtime`

Shared source routes a few runtime touchpoints through helpers in
`solutions/ontological/lib/util/runtime.ts` so one source works as both a loose `.ts` tree and
a bundled binary:

| helper                     | what it gives                                       |
|----------------------------|-----------------------------------------------------|
| `moduleDir(import.meta.url)`| "the folder this file lives in"                     |
| `isMain(import.meta.url)`   | "run me directly" guard (also false under the compiled binary) |
| `moduleExt(import.meta.url)`| the suffix this module's sibling modules carry, for a directory that scans its own peers |
| `runtimeExec()`             | the live runtime executable, for re-spawns          |
| `xRunner()`                 | the package runner (`bunx`)                          |

`moduleExt` backs the directory-scanning idiom (the registry discovery walk, the
docs `list-ops` sibling): a module that reads its own directory for peers looks
for the suffix it is itself running as, rather than hard-coding one. It is NOT a
fit for a peer that ships as `.ts` only regardless of the caller's own runtime
form (`migrate.ts`'s per-version transform modules) — those resolve by what is
actually on disk instead, with a statically-bundled fallback
(`lib/_generated/migration-manifest.ts`) for when running bundled breaks even a
correctly-found `.ts` path (see `migrate.ts`'s `loadTransform`).

## Runtime dependency: Bun (dev)

The plugin's TypeScript is developed and tested under [`Bun`](https://bun.sh),
both the runtime and the test runner. Entry-point scripts under
`solutions/ontological/scripts/` carry a `#!/usr/bin/env bun` shebang and are executed
directly or shelled to with `bun run …`. Dependencies are declared once in the
root `package.json` and installed into a single `node_modules/` with
`bun install`; there is no per-script dependency block.

Install `Bun` once per machine:

```text
curl -fsSL https://bun.sh/install | bash
```

On macOS it is also available via Homebrew (`brew install oven-sh/bun/bun`);
on Windows use `powershell -c "irm bun.sh/install.ps1 | iex"`. See
<https://bun.sh/docs/installation> for the full matrix.

`Bun` is a **hard dependency for developing in this repo.** Running the source
`.ts` (or `bun test`) with `bun` absent fails. Treat "bun is on PATH" and
"`bun install` has been run" as preconditions of working here. (A consumer of
the shipped binary needs no Bun on PATH — the binary embeds the Bun runtime.)

### Typechecking and tests

- **Typecheck:** `bunx tsc --noEmit` against the root `tsconfig.json`
  (`module: esnext`, `moduleResolution: bundler`, `noEmit`). It is `strict`,
  with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `allowImportingTsExtensions` (imports carry an
  explicit `.ts` suffix), and `verbatimModuleSyntax`. A clean tree produces
  **zero** `tsc` errors.
- **Test a file or directory:** `bun test <path>`. **Whole suite:** `bun test`
  (also `bun run test`). Tests use Bun's runner —
  `import { test, expect, describe } from "bun:test"`.

## The compiled binary

`solutions/ontological/scripts/build-binary.ts` produces the shipped form: a single
self-contained executable via `bun build --compile`
([[D-2APS-sdlc-standalone-binary-app]]). The pipeline:

1. **regenerate `solutions/ontological/lib/_generated/op-manifest.ts`** — a static barrel of
   `import "<op module>"` lines. `bun build --compile` bundles a STATIC import
   graph, so the registry's runtime discovery walk (a computed dynamic `import()`)
   would include no op modules; the barrel makes the bundler pull in — and
   self-register — every op.
2. **tar the runtime-asset + harness surface** (the `.eta` templates,
   `entities/*/definition.md`, `skills/`, `conventions/`, `.claude-plugin/`, the
   `site-template/`) into `plugin-assets.tar`, stamping the `.claude-plugin`
   manifest versions to `package.json`'s on the way in. The `with { type: "file" }`
   import bakes the tar into the binary; at first run the binary extracts it to a
   version-keyed cache so every module-relative asset read still resolves.
3. **`bun build --compile`** — bundle the source + its deps (`markdown-contract`,
   `@osdlc/detect-harness`, and the rest) + the embedded Bun runtime into the
   executable.

`build-npm-wrapper.ts` then assembles the npm distribution: one
`@sksizer/sdlc-<os>-<arch>` package per platform (the binary, os/cpu-gated) plus
the main `@sdlc/cli` package whose `bin` is a plain-Node shim that resolves
and execs the matching platform binary. `release.yml` cross-compiles every
target, packs, smoke-tests, and (gated on `NPM_TOKEN`) publishes.

## The launcher: the invocation seam

`solutions/ontological/cli/sdlc` (a bash script) is the invocation seam for a source checkout.
Every skill calls `${CLAUDE_PLUGIN_ROOT}/cli/sdlc <verb>`; the launcher resolves
its own directory and execs the `sdlc.ts` source under **Bun** (it also honours
the `sdlc dev` runtime-selector redirect). The `corpus-invocation` gate keeps
every skill and doc on this `${CLAUDE_PLUGIN_ROOT}/cli/sdlc` form, so the seam is
stable regardless of how the CLI is run. A bash launcher (rather than a shebang
binary) sidesteps shebang-length / interpreter quirks entirely.

The shipped consumer form is the standalone compiled binary (above), invoked
directly through the npm shim — it does not go through this launcher.

One property of the entry file `solutions/ontological/cli/sdlc.ts` worth calling out: it sets
`process.exitCode` rather than calling `process.exit()`. Under the plain-Node
distribution shim, `process.exit()` can terminate before an asynchronous
(piped/redirected) stdout buffer flushes, silently truncating output; assigning
the code lets the event loop drain stdout first.

## Two code categories

TypeScript in `plugin/` falls into exactly two buckets, by a single decision
rule: **if it is invoked once and exits, it is a script; if it is imported by
something else, it is a library.**

- **`solutions/ontological/scripts/`** holds entry points. Each file is a single-file script —
  a `#!/usr/bin/env bun` shebang and a body that does one job and exits.
- **`solutions/ontological/lib/`** holds libraries. Each `solutions/ontological/lib/<name>/` is a
  normal importable package whose public surface is re-exported from an `index.ts`. Library code
  lives here whenever it is multi-file, importable, and shared across consumers. A library is never
  executed directly.

`solutions/ontological/lib/` is a peer of `solutions/ontological/scripts/`,
`solutions/ontological/cli/`, `solutions/ontological/lib/model/entities/`, and
`solutions/ontological/plugin/plugins/sdlc/skills/`. When unsure which bucket a new file belongs in,
apply the rule literally: a thing other things `import` is a library under
`solutions/ontological/lib/<name>/`; a thing you type at a shell and that exits is a script under
`solutions/ontological/scripts/`.

## Entry-point script anatomy

An entry-point script is the shebang plus the body. Importing a library needs
no bootstrap. Two import forms are in use:

- **Relative import with an explicit `.ts` extension** (the default):

  ```typescript
  #!/usr/bin/env bun
  import { works } from "../lib/_example/index.ts";

  const ok = works();
  console.log(ok ? "OK" : "FAIL");
  process.exit(ok ? 0 : 1);
  ```

- **A tsconfig path alias** for cross-tree imports. The aliases declared in
  `tsconfig.json`'s `paths`:

  | alias            | resolves to            |
  |------------------|------------------------|
  | `@lib/*`         | `solutions/ontological/lib/*`         |
  | `@cli/*`         | `solutions/ontological/cli/*`         |
  | `@validators/*`  | `plugin/validators/*`  |
  | `@scripts/*`     | `solutions/ontological/scripts/*`     |

  e.g. `import { fetchNamespace } from "@lib/services/lease";`. Prefer relative
  imports within a tree; reserve the aliases for reaching across trees. **Write
  aliases extensionlessly** (`@lib/registry`, not `@lib/registry.ts`): the
  `tsconfig.json` `paths` map resolves them for the typecheck, and Bun's bundler
  resolves them when running the source and when compiling the binary.

## Library anatomy

A library is a package directory under `solutions/ontological/lib/`:

```text
solutions/ontological/lib/<name>/
  index.ts               # the public surface: re-exports what callers use
  <module>.ts            # implementation modules
  <module>.test.ts       # unit tests, peers of the module they test
  tests/
    <thing>.test.ts      # integration/e2e only — see below
    fixtures/            # fixture corpora and shared test helpers
```

`index.ts` defines or re-exports the library's public API so callers write
`import { thing } from "@lib/<name>"` rather than reaching into submodules. A
directory with an `index.ts` is the package.

**Unit tests sit as peers of the module they test** ([[B-6LOH-conventions]]):
`fs.ts` and `fs.test.ts` share a directory, and the test imports its subject as
`from "./fs.ts"`. The pairing is visible in one listing, and a module with no
test is visible by the same glance.

**Integration and e2e tests keep their own `tests/` directory.** These are the
suites that spawn subprocesses, build real git repositories, or boot a server —
they exercise several modules at once, so no single peer position is truthful,
and they carry fixture corpora that want a home of their own. Shared test
helpers (`_helpers.ts` and friends) live there too.

Bun's runner discovers both by the `.test.ts` suffix at any depth, so neither
placement needs test configuration.

Libraries have **no shebang** — they are imported, never executed. Any
third-party dependency a library needs is declared once in the root
`package.json` (`dependencies` today: `@hono/node-server`, `@osdlc/detect-harness`,
`commander`, `eta`, `hono`, `markdown-contract`, `tinyglobby`, `yaml`, `zod`).
Adding a dependency is a deliberate `package.json` edit; the binary bundles it
via `bun build --compile`, so it must resolve and bundle cleanly under Bun.

## What NOT to put a shebang on

The shebang is for direct-execution entry points only. Do not put one on:

- **Library code.** Modules under `solutions/ontological/lib/<name>/` are imported, not run.
- **Test files.** `bun test` is invoked once for many `*.test.ts` modules.
- **Generated TypeScript.** Emitted code is not a hand-run entry point; the
  generator (or a wrapper) carries the shebang.

Note the one deliberate exception to the "`env bun`" default: the unified CLI
entry `solutions/ontological/cli/sdlc.ts` carries `#!/usr/bin/env node` so the emitted
`sdlc.js` runs under Node as the package `bin` (see "The launcher" above). Its
`.ts` form is only ever run via `bun run` (by the launcher), which ignores the
shebang.

## Reference implementation

`solutions/ontological/lib/_example/` is the project's permanent, canonical working example of this
convention — a one-function smoke-test library (`works(): boolean`) exercised by a
`bootstrap.test.ts`. It proves `solutions/ontological/lib/` packages are importable and that Bun
discovers `*.test.ts` alongside the module it tests.

To author a new library, copy the shape of `_example`:

1. Create `solutions/ontological/lib/<name>/index.ts` and expose the public API there.
2. Add `solutions/ontological/lib/<name>/<module>.test.ts` beside the module it tests,
   importing it as `from "./<module>.ts"`. Bun discovers it by the `.test.ts`
   suffix; no new test config is needed. A suite that needs a subprocess, a real
   git repository, or a fixture corpus goes in `tests/` instead.
3. If an entry-point script must call the library, follow the shebang and
   import conventions above: `#!/usr/bin/env bun` and
   `import { thing } from "../lib/<name>/index.ts"` (or `@lib/<name>`).

Run `bun test solutions/ontological/lib/<name>/` to confirm the new library wires up the same way
the example does.
