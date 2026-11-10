import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  type BenchPackage,
  accepted,
  benchFilter,
  best,
  compare,
  confirmed,
  discover,
  groupByPackage,
  main,
  packagesOf,
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
  assert.match(t, /confirmation pass/);
  assert.doesNotMatch(table([], 0.15, false), /confirmation pass/);
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

test("best: the least disturbed round, so one noisy round cannot fail the gate", () => {
  assert.equal(best([1.4, 1, 1.3]), 1);
  // Base ran a noisy round and head a quiet one: pooled medians would call
  // this +20%, best rounds see no change.
  const rows = compare(
    new Map([["a", best([1, 1.2, 1.2])]]),
    new Map([["a", best([1.02, 1.03, 1.02])]]),
  );
  assert.equal(rows[0]?.status, "ok");
  // A real slowdown moves every round, the best one included.
  const slow = compare(
    new Map([["a", best([1, 1.05, 1.02])]]),
    new Map([["a", best([1.3, 1.35, 1.31])]]),
  );
  assert.equal(slow[0]?.status, "slower");
});

test("confirmed: a suspect fails only when the confirmation pass is over the line too", () => {
  const first = compare(
    new Map([
      ["p/a", 1],
      ["p/b", 1],
      ["p/c", 1],
      ["p/d", 1],
    ]),
    new Map([
      ["p/a", 1.3],
      ["p/b", 1.3],
      ["p/c", 1.3],
      ["p/d", 1.05],
    ]),
  );
  const again = compare(
    new Map([
      ["p/a", 1],
      ["p/b", 1],
      ["p/d", 1],
    ]),
    new Map([
      ["p/a", 1.28],
      ["p/b", 1.02],
      ["p/d", 1.3],
    ]),
  );
  const by = Object.fromEntries(confirmed(first, again).map((r) => [r.id, r]));
  assert.equal(by["p/a"]?.status, "slower");
  assert.ok(Math.abs((by["p/a"]?.confirm ?? 0) - 1.28) < 1e-9);
  // Over once, back in line the second time: noise.
  assert.equal(by["p/b"]?.status, "unconfirmed");
  // Not measured again: stays a failure.
  assert.equal(by["p/c"]?.status, "slower");
  // Only the first pass decides a benchmark that was not a suspect.
  assert.equal(by["p/d"]?.status, "ok");
  assert.equal(by["p/d"]?.confirm, undefined);
});

test("packagesOf names the packages of benchmark ids; table shows the confirmation", () => {
  assert.deepEqual(
    [...packagesOf(["ts:a/x/y", "ts:a/x/z", "rust:a/g/h"])],
    ["ts:a", "rust:a"],
  );
  const t = table([
    {
      id: "a",
      base: 1,
      head: 1.3,
      ratio: 1.3,
      confirm: 1.02,
      status: "unconfirmed",
    },
  ]);
  assert.match(t, /\| unconfirmed \(again \+2\.0%\) \|/);
});

test("main rejects a bad --confirm-rounds", () => {
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(main(["base", "head", "--confirm-rounds", "-1"]), 2);
    assert.equal(main(["base", "head", "--confirm-rounds", "x"]), 2);
  } finally {
    console.error = err;
  }
});

test("benchFilter selects exactly the suspects, with regex syntax escaped", () => {
  // criterion: the full id after the crate, anchored.
  const rs = benchFilter("rust", [
    "rust:markdown-tags/inline_tags obsidian/vault",
    "rust:markdown-tags/inline_tags obsidian/slow/redos-1.6k (x)",
  ]);
  assert.equal(
    rs,
    "^(?:inline_tags obsidian/slow/redos-1\\.6k \\(x\\)|inline_tags obsidian/vault)$",
  );
  const re = new RegExp(rs);
  assert.ok(re.test("inline_tags obsidian/vault"));
  assert.ok(re.test("inline_tags obsidian/slow/redos-1.6k (x)"));
  assert.ok(!re.test("inline_tags obsidian/vault2"));
  assert.ok(!re.test("inline_tags obsidian/largest-note"));
  assert.ok(!re.test("inline_tags obsidian/slow/redos-1x6k (x)"));
  // vitest: the test title only, once however many cases are suspect.
  const ts = benchFilter("ts", [
    "ts:markdown-link/scanBodyWith/vault",
    "ts:markdown-link/scanBodyWith/slow/failed-md-link-open",
    "ts:markdown-link/a+b/vault",
  ]);
  assert.equal(ts, "^(?:a\\+b|scanBodyWith)$");
  assert.ok(new RegExp(ts).test("scanBodyWith"));
  assert.ok(!new RegExp(ts).test("scanBodyWith2"));
  assert.ok(!new RegExp(ts).test("ab"));
});

test("groupByPackage gives each package only its own suspects", () => {
  assert.deepEqual(
    [...groupByPackage(["ts:a/x/y", "rust:a/g/h", "ts:a/x/z"])],
    [
      ["ts:a", ["ts:a/x/y", "ts:a/x/z"]],
      ["rust:a", ["rust:a/g/h"]],
    ],
  );
});
