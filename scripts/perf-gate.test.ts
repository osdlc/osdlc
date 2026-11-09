import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  type BenchPackage,
  accepted,
  compare,
  discover,
  main,
  median,
  parseCriterion,
  parseVitest,
  pick,
  table,
} from "./perf-gate.ts";

const link: BenchPackage = { lang: "ts", name: "markdown-link", deps: [] };
const linkRs: BenchPackage = { lang: "rust", name: "markdown-link", deps: [] };
const render: BenchPackage = {
  lang: "ts",
  name: "markdown-render",
  deps: ["markdown-link"],
};
const all = [link, linkRs, render];

test("compare: 15% is the line", () => {
  const rows = compare(
    new Map([
      ["a", 100],
      ["b", 100],
      ["c", 100],
      ["d", 100],
      ["gone", 1],
    ]),
    new Map([
      ["a", 115],
      ["b", 115.1],
      ["c", 80],
      ["d", 100],
      ["fresh", 1],
    ]),
  );
  const by = Object.fromEntries(rows.map((r) => [r.id, r.status]));
  assert.deepEqual(by, {
    a: "ok",
    b: "slower",
    c: "faster",
    d: "ok",
    gone: "removed",
    fresh: "new",
  });
});

test("median", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test("accepted needs the label and a stated reason", () => {
  const body =
    "text\n\nPerf-accepted: the scanner now keeps spans, a known cost\n";
  assert.equal(accepted(["perf-accepted"], body).ok, true);
  assert.equal(accepted([], body).ok, false);
  assert.equal(accepted(["perf-accepted"], "no reason here").ok, false);
  assert.equal(accepted(["perf-accepted"], "Perf-accepted:   \n").ok, false);
  assert.equal(accepted(["perf-accepted"], "Perf-accepted: ok").ok, false);
});

test("pick: own files, twins, dependents, shared inputs", () => {
  const names = (c: string[] | null) =>
    pick(c, all).map((p) => `${p.lang}:${p.name}`);
  assert.deepEqual(names(null), [
    "ts:markdown-link",
    "rust:markdown-link",
    "ts:markdown-render",
  ]);
  assert.deepEqual(names(["packages/rust/markdown-link/src/lib.rs"]), [
    "ts:markdown-link",
    "rust:markdown-link",
    "ts:markdown-render",
  ]);
  assert.deepEqual(names(["packages/ts/markdown-render/src/a.ts"]), [
    "ts:markdown-render",
  ]);
  assert.deepEqual(names(["packages/ts/path-guard/src/a.ts"]), []);
  assert.deepEqual(names(["bench/corpus/generate.ts"]), [
    "ts:markdown-link",
    "rust:markdown-link",
    "ts:markdown-render",
  ]);
  assert.deepEqual(names(["README.md"]), []);
});

test("parseVitest reads the p50 latency of each task", () => {
  const report = {
    testResults: [
      {
        assertionResults: [
          {
            benchmarks: [
              {
                name: "scan",
                tasks: [{ name: "vault", latency: { p50: 2.5 } }],
              },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(
    [...parseVitest("markdown-link", report)],
    [["ts:markdown-link/scan/vault", 2.5]],
  );
});

test("parseCriterion reads median estimates in ms and discover finds bench packages", () => {
  const root = mkdtempSync(join(tmpdir(), "perf-gate-test-"));
  const dir = join(root, "criterion", "grp", "slow_x", "new");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "estimates.json"),
    JSON.stringify({ median: { point_estimate: 2_000_000 } }),
  );
  writeFileSync(
    join(dir, "benchmark.json"),
    JSON.stringify({ full_id: "grp/slow/x" }),
  );
  assert.deepEqual(
    [...parseCriterion("c", join(root, "criterion"))],
    [["rust:c/grp/slow/x", 2]],
  );

  mkdirSync(join(root, "packages/ts/a/benches"), { recursive: true });
  writeFileSync(
    join(root, "packages/ts/a/package.json"),
    JSON.stringify({
      devDependencies: { "@osdlc/b": "workspace:^", vitest: "catalog:" },
    }),
  );
  writeFileSync(join(root, "packages/ts/a/benches/x.bench.ts"), "");
  mkdirSync(join(root, "packages/ts/b/benches"), { recursive: true });
  writeFileSync(join(root, "packages/ts/b/benches/notes.md"), "");
  assert.deepEqual(discover(root), [{ lang: "ts", name: "a", deps: ["b"] }]);
});

test("discover reads workspace dependencies from a Cargo.toml", () => {
  const root = mkdtempSync(join(tmpdir(), "perf-gate-test-"));
  mkdirSync(join(root, "packages/rust/a/benches"), { recursive: true });
  writeFileSync(join(root, "packages/rust/a/benches/x.rs"), "");
  writeFileSync(
    join(root, "packages/rust/a/Cargo.toml"),
    [
      "[dependencies]",
      "markdown-link = { workspace = true }",
      'serde = { version = "1" }',
      "",
    ].join("\n"),
  );
  assert.deepEqual(discover(root), [
    { lang: "rust", name: "a", deps: ["markdown-link"] },
  ]);
});

test("pick: -wasm twins count as their package; only the root package.json is shared", () => {
  const names = (c: string[]) => pick(c, all).map((p) => `${p.lang}:${p.name}`);
  assert.deepEqual(names(["packages/rust/markdown-link-wasm/src/lib.rs"]), [
    "ts:markdown-link",
    "rust:markdown-link",
    "ts:markdown-render",
  ]);
  assert.equal(names(["package.json"]).length, 3);
  assert.deepEqual(names(["packages/ts/path-guard/package.json"]), []);
  for (const f of [
    "pnpm-lock.yaml",
    "scripts/perf-gate.ts",
    ".github/workflows/perf-gate.yml",
    "packages/rust/Cargo.lock",
  ])
    assert.equal(names([f]).length, 3, f);
});

test("table: ms or us, and the sign of the change", () => {
  const t = table([
    { id: "a", base: 2, head: 3, ratio: 1.5, status: "slower" },
    { id: "b", base: 0.002, head: 0.001, ratio: 0.5, status: "faster" },
    { id: "c", base: null, head: 1, ratio: null, status: "new" },
  ]);
  assert.match(t, /\| a \| 2\.00 ms \| 3\.00 ms \| \+50\.0% \| slower \|/);
  assert.match(t, /\| b \| 2\.0 us \| 1\.0 us \| -50\.0% \| faster \|/);
  assert.match(t, /\| c \| - \| 1\.00 ms \|  \| new \|/);
});

test("main rejects malformed arguments with exit code 2", () => {
  const quiet = (argv: string[]) => {
    const err = console.error;
    console.error = () => {};
    try {
      return main(argv);
    } finally {
      console.error = err;
    }
  };
  assert.equal(quiet([]), 2);
  assert.equal(quiet(["base"]), 2);
  assert.equal(quiet(["base", "head", "--rounds"]), 2);
  assert.equal(quiet(["base", "head", "--rounds", "0"]), 2);
  assert.equal(quiet(["base", "head", "--rounds", "x"]), 2);
  assert.equal(quiet(["base", "head", "--out", "--rounds", "5"]), 2);
  assert.equal(quiet(["base", "head", "--changed"]), 2);
  assert.equal(quiet(["base", "head", "--bogus"]), 2);
});

test("main stops early when no package with benchmarks is affected", () => {
  const root = mkdtempSync(join(tmpdir(), "perf-gate-test-"));
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(main([root, root, "--rounds", "1"]), 0);
  } finally {
    console.log = log;
  }
});
