# @osdlc/code-host

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
