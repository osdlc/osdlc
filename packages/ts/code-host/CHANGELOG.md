# @osdlc/code-host

## 0.4.4

### Patch Changes

- Updated dependencies [0cf31de]
  - @osdlc/command-seam@0.11.0
  - @osdlc/typed-gh@0.9.3
  - @osdlc/typed-git@0.7.2

## 0.4.3

### Patch Changes

- Updated dependencies [910deca]
- Updated dependencies [910deca]
  - @osdlc/command-seam@0.10.0
  - @osdlc/config-layers@0.7.1
  - @osdlc/typed-gh@0.9.2
  - @osdlc/typed-git@0.7.1

## 0.4.2

### Patch Changes

- Updated dependencies [007d8ee]
- Updated dependencies [cc2abe4]
- Updated dependencies [72f5049]
- Updated dependencies [b5aac07]
- Updated dependencies [41ef520]
  - @osdlc/config-layers@0.7.0
  - @osdlc/typed-gh@0.9.0
  - @osdlc/typed-git@0.7.0

## 0.4.1

### Patch Changes

- Updated dependencies [ae400e5]
  - @osdlc/typed-gh@0.8.0

## 0.4.0

### Minor Changes

- d9b0f77: **Breaking:** the port's queries return a `Result<T, CodeHostFailure>` instead of `null` for a failure. `listPrs`, `listPrDetails`, `getPr`, `listComments`, `reviewThreads` and `prForBranch` now say why they failed, with a `kind` (`not-installed`, `not-authenticated`, `network`, `not-found`, `rate-limited`, `timeout`, `http`, `unreadable`, `unsupported`, ...), a `message`, a `hint` and the `host`, the same for GitHub and Forgejo. `getPr` of a missing PR and `prForBranch` of a branch with no PR are still a success with `null`. `listPrs`, `getPr`, `selectCodeHost` and the others now return a `Result`, so a caller must read `.ok` and `.value` or `.error` instead of testing for `null`. `selectCodeHost` returns a `Result` and reports `no-remote`, `bad-remote` and `missing-token` as failures instead of throwing. Mutations still throw, now a `FailureError` carrying the same classified failure, so a signed-out `gh` during a write reads as `not-authenticated`. Forgejo's `getPr` fails when its comments, reviews or status call fails, where it read the failure as an empty list or as a PR with no checks. New exports: `CodeHostFailure`, `CodeHostFailureKind`, `missingToolFailure` (the `not-installed` failure for a host's tool, worded as the adapters word it) and `badRemoteFailure`. `@osdlc/result` is a new dependency.

### Patch Changes

- fb712e0: Ship the compiled `dist/` only. The `bun` export condition and the TypeScript source are no longer in the package, so Bun, Node and every bundler load the same compiled ESM and `.d.ts` files. Bun still works through the compiled `dist/`.
- fb712e0: Make every package follow the same conventions. The published manifests and READMEs change; the runtime code and the `dist/` files do not.
  
  - `author` is `sksizer` in every manifest (`@osdlc/typed-gh` had none).
  - `engines.node` is no wider than any dependency's. `@osdlc/typed-gh` and `@osdlc/code-host` now declare `^22.22.2 || ^24.15.0 || >=26.0.0`, the range of `@osdlc/typed-git` and its dependency `hosted-git-info`. `@osdlc/cli-tool` and `@osdlc/trust-repo` declare `>=22`, not `>=22.18`: a `dist/` install needs no TypeScript stripping.
  - `@osdlc/tsconfig` and `@osdlc/prettier-config` are ESM with `sideEffects: false`, and ship SECURITY.md and CONTRIBUTING.md. `@osdlc/prettier-config` has an `exports` map (`.` is `index.json`) in place of `main`.
  - Every README has `## Install` and `## Licence` sections, and every CHANGELOG starts `# @osdlc/<name>`.
  - `@osdlc/color` and `@osdlc/markdown-contract` no longer set a coverage threshold.
  - `@osdlc/yaml-splice` reaches its WebAssembly glue through a `#wasm` entry in `imports`. The shipped `dist/` files are the same.
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [fb712e0]
- Updated dependencies [fb712e0]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
- Updated dependencies [d9b0f77]
  - @osdlc/command-seam@0.9.0
  - @osdlc/typed-gh@0.7.0
  - @osdlc/typed-git@0.6.0
  - @osdlc/config-layers@0.6.1
  - @osdlc/result@0.1.0

## 0.3.1

### Patch Changes

- 41f1d6b: First public release. `@osdlc/code-host` is the `CodeHost` port for pull requests: what a code host answers about a pull request, with an adapter for each host. It moves here from the development repository, where it was `@sksizer/code-host`.
  
  - `CodeHost`: the port for pull requests, with GitHub and Forgejo adapters. Every shell-out goes through an injected command runner, so tests need no network and no login.
  - The GitHub adapter works through the `gh` CLI and `@osdlc/typed-gh`.
  - The Forgejo adapter uses `curl` and the REST API. It reads its token from `FORGEJO_TOKEN` by default; the `forgejoTokenEnv` option names another variable.
  - `selectCodeHost`: picks the adapter from the git remote.
  - Auth checks for both hosts, for a doctor command to run.
  - `PrFacts` and `assemblePrFacts`: the facts about a pull request, gathered through the port.
  - A `code_host` config section, read through `@osdlc/config-layers`.
  - PR-reference parsing.
  - Depends on `@osdlc/command-seam`, `@osdlc/config-layers`, `@osdlc/typed-gh`, `@osdlc/typed-git` and `zod`. ESM with `.d.ts` types, for Node 22.18 or newer; Bun also runs it. Licence `MIT OR Apache-2.0`.
