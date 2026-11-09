# Benchmarks and the perf gate

Sharing an algorithm between libraries must not make one of them slower. Every
library that joins the markdown chain has benchmarks on one shared synthetic
corpus, and a CI job compares each pull request with its base.

## What is gated

`.github/workflows/perf-gate.yml` runs on every pull request. It runs the
benchmarks of the packages the change touches, and of the packages that depend
on them, on the base commit and on the head commit in the same job, three
rounds each, alternating sides. A benchmark's figure for a side is its best
round: the minimum over rounds of the median each round reports (runner noise
only adds time). A benchmark whose head figure is more than 15% above its base
figure is a suspect; the packages with a suspect run three more rounds in the
opposite order, and the job fails only for a suspect that is over 15% again.
A benchmark over the line in the first pass only is reported as `unconfirmed`.

- A benchmark that exists only on the head is new; it has no baseline and is
  not gated until it is on the base.
- A deliberate slowdown goes through with the `perf-accepted` label and a line
  `Perf-accepted: <reason>` (at least ten characters) in the pull request body.
  The job reruns when the label or the body changes.
- The shared inputs (this directory, `scripts/perf-gate.ts`, the workflow, the
  lockfiles and the Rust workspace manifest) pick every package.
- Both sides time the head's corpus (`bench/corpus/` is copied over the base's),
  so a pull request that changes the corpus is still compared on equal input.

Run it locally with two checkouts of the repository, both installed:

```sh
git worktree add ../base origin/main && (cd ../base && pnpm install --frozen-lockfile)
node scripts/perf-gate.ts ../base . --rounds 3
```

## The corpus

`bench/corpus/` builds a vault of 1200 synthetic notes from a seed (`node bench/corpus/cli.ts out.json --stats` prints its size and shape),
plus the slow inputs: markdown-link's linear-time cases and the ReDoS cases of markdown-render and markdown-astro. It
holds no real content. Notes carry frontmatter with tags, wikilinks (alias,
heading, block, self), embeds (sized), markdown links, tags in the obsidian,
unicode and ascii dialects, code spans, fences and callouts, with links and
tags also inside code, where they must not be found. The same seed gives the
same bytes. `corpus.test.ts` pins its shape.

`node bench/corpus/cli.ts out.json --stats` writes the corpus as JSON for the
Rust benchmarks and prints its density.

## Add a benchmark to a package

TypeScript: add `benches/<name>.bench.ts` to the package (it is not published),
a `"bench": "vitest bench --run"` script, and `benches` to the `include` of its
`tsconfig.json`:

```ts
import { test } from "vitest";
import { corpus } from "../../../../bench/corpus/index.ts";
import { runCases } from "../../../../bench/suite.ts";
import { inlineTags } from "../src/index.ts";

const { bodies } = corpus();
test("inlineTags", ({ bench }) =>
  runCases(bench, {
    vault: () => {
      for (const b of bodies) inlineTags(b);
    },
  }));
```

Each case is gated as `ts:<package>/<test title>/<case>`.

Rust: add `criterion = { workspace = true }` to `[dev-dependencies]`, a
`[[bench]]` with `harness = false`, and `benches/<name>.rs` that reads the
corpus from the JSON file named by `OSDLC_BENCH_CORPUS` (see
`packages/rust/markdown-link/benches/body_links.rs`). Each criterion id is
gated as `rust:<crate>/<group>/<function>`.

A package with a `benches/` directory is picked up with no other change. Give
the TypeScript and Rust twins the same case names so a reader can compare them.
Keep a case near a millisecond or longer where the work allows it: a case of a
few microseconds is dominated by runner noise.
