# Contributing

Thanks for your interest in `@osdlc/rule-review`.

## Issues

Report bugs and ask for features in the
[issue tracker](https://github.com/osdlc/osdlc/issues). For a bug, include the
library version, your runtime and its version, your operating system, the
agent CLI and its version, and the command or call that misbehaves. Report
security problems privately. See [SECURITY.md](./SECURITY.md).

## Pull requests

This package lives in [osdlc/osdlc](https://github.com/osdlc/osdlc) under
`packages/ts/rule-review`. Open pull requests there. They are reviewed and
merged there. The design decisions and open work are in
[docs/planning](./docs/planning/README.md).

## Running the tests

The repository is a pnpm workspace. Install from the repository root, then
work in the package directory. The tests run on [Vitest](https://vitest.dev)
under Node `^22.22.2 || ^24.15.0 || >=26.0.0`. They need `git` on the PATH and run offline: a
stand-in agent answers every judgement, so no model is called and no key is
needed. The package imports its sibling libraries through their built `dist/`,
so run `pnpm run build` at the repository root first.

```sh
pnpm install
pnpm run build
cd packages/ts/rule-review
pnpm test
```

To run the CLI from a checkout, build the package and run
`node bin/rule-review.js --help`. To make an installed `rule-review` hand off
to your checkout, run `rule-review dev link` in it, or set `RULE_REVIEW_HOME`
to its path; `rule-review dev` lists the other subcommands.

`pnpm run test:eval` runs a small suite against a real agent: a throwaway
repository with planted rule breaches, scored against the known answers. It
needs an installed, signed-in agent CLI and costs real calls.
`RULE_REVIEW_EVAL_ENGINE` picks the engine (default `claude`) and
`RULE_REVIEW_EVAL_RUNS` the number of runs. The breaches are planted, so a
score has a fact to check against; they are also cleaner than real ones, so a
good score shows the judge is not broken, not that it is good. `pnpm test`
runs the harness with known-bad answers instead of a model
(`tests/eval/harness.test.ts`), so a harness that cannot fail is caught on
every push. The headers of the files in `tests/eval/` say more.

Other checks:

```sh
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run smoke
```

## Code style

- TypeScript, ES modules, and explicit `.ts` import paths.
- Prettier formats the code and oxlint checks it. Run `pnpm run format` and
  `pnpm run lint` before you commit.
- Add a test for each behaviour change or bug fix. Test with an injected
  `dispatch` or the stand-in agent, never a real model call.
- Shell out only through the command seam, never with a raw `child_process`
  call. A test checks this.
- A README example is a file under `examples/`. The README holds a copy, and
  `examples/readme.test.ts` fails when the two differ.
- For a change users can see, add a changeset: run `pnpm changeset` at the
  repository root. Start a breaking change's summary with `**Breaking:**`.
  Do not edit `CHANGELOG.md` or `version` by hand. The release writes them.
  See [packages/README.md](https://github.com/osdlc/osdlc/blob/main/packages/README.md).
