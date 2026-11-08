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
  median,
  parseCriterion,
  parseVitest,
  pick,
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
