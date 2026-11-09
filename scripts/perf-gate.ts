// The perf gate: runs the benchmarks of the packages a pull request touches
// on the base commit and on the head commit, in one job, and fails when a
// gated benchmark is more than THRESHOLD slower on the head, twice.
//
//   node scripts/perf-gate.ts <base-dir> <head-dir> [--changed <file>] [--rounds N] [--confirm-rounds N] [--out <dir>]
//   node scripts/perf-gate.ts pick <head-dir> --changed <file>
//
// <base-dir> and <head-dir> are two checkouts of the repository (a git
// worktree for the base), both installed. --changed is a file listing the
// changed paths, one per line; without it every package with benchmarks runs.
// bench/README.md says what a benchmark is and how a package adds one.
//
// How the numbers are made comparable:
//   - Both sides run on the same runner in the same job, and their runs
//     alternate (base, head, head, base, ...) over --rounds rounds, so a
//     slow minute of the runner hits both.
//   - A benchmark's figure for a side is its best round: the minimum over
//     rounds of the median each round reports (vitest's p50 latency;
//     criterion's median). Runner noise (a busy neighbour, a throttled core)
//     only ever adds time, so the best round is the least disturbed one; a
//     real slowdown moves the best round too.
//   - A benchmark over the threshold in that pass is a suspect. The packages
//     with a suspect run again, --confirm-rounds rounds in the opposite
//     order, and a suspect fails only when it is over the threshold again.
//     A noise spike has to strike twice; a real slowdown does.
//   - Both sides time the corpus of the head: bench/corpus/ is copied over
//     the base's, so a PR that changes the corpus is still compared on equal
//     input.
//
// A benchmark only the head has is new and not gated. A slowdown past the
// threshold passes when the PR carries the `perf-accepted` label and a
// `Perf-accepted: <reason>` line in its body (PERF_LABELS and PERF_BODY in the
// environment, as the workflow sets them).
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

/** A benchmark median may grow by this fraction before the gate fails. */
export const THRESHOLD = 0.15;
/** The label that lets a deliberate slowdown through. */
export const ACCEPT_LABEL = "perf-accepted";
/** Shortest reason, in characters, that counts as a stated reason. */
const MIN_REASON = 10;

/** One package that has benchmarks, in one language. */
export interface BenchPackage {
  lang: "ts" | "rust";
  /** The directory name under packages/<lang>/. */
  name: string;
  /** Names of other benchmarked-language packages it depends on (workspace dependencies). */
  deps: string[];
}

/** Median time per iteration by benchmark id, in milliseconds. */
export type Medians = Map<string, number>;

/** How one benchmark moved. `unconfirmed` is over the threshold in the first pass only. */
export interface Row {
  id: string;
  base: number | null;
  head: number | null;
  /** head / base, or null when either side is missing. */
  ratio: number | null;
  /** head / base in the confirmation pass, for a benchmark that ran in it. */
  confirm?: number;
  status: "ok" | "slower" | "faster" | "new" | "removed" | "unconfirmed";
}

/** Packages with a `benches/` directory holding at least one benchmark file. */
export function discover(root: string): BenchPackage[] {
  const out: BenchPackage[] = [];
  for (const lang of ["ts", "rust"] as const) {
    const dir = join(root, "packages", lang);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const benches = join(dir, name, "benches");
      if (!existsSync(benches)) continue;
      const want = lang === "ts" ? /\.bench\.ts$/ : /\.rs$/;
      if (!readdirSync(benches).some((f) => want.test(f))) continue;
      out.push({ lang, name, deps: dependencies(root, lang, name) });
    }
  }
  return out;
}

/** Names of the workspace packages `name` depends on. */
function dependencies(
  root: string,
  lang: "ts" | "rust",
  name: string,
): string[] {
  if (lang === "ts") {
    const pkg = JSON.parse(
      readFileSync(join(root, "packages/ts", name, "package.json"), "utf8"),
    ) as Record<string, Record<string, string> | undefined>;
    const all = {
      ...pkg["dependencies"],
      ...pkg["devDependencies"],
      ...pkg["peerDependencies"],
    };
    return Object.keys(all)
      .filter((d) => d.startsWith("@osdlc/"))
      .map((d) => d.slice("@osdlc/".length));
  }
  const toml = readFileSync(
    join(root, "packages/rust", name, "Cargo.toml"),
    "utf8",
  );
  return [
    ...toml.matchAll(/^([a-z0-9_-]+)\s*=\s*\{[^}]*workspace\s*=\s*true/gm),
  ].map((m) => m[1] as string);
}

/**
 * The packages to run for the changed paths: a package whose own directory,
 * or whose twin's, changed; every package when a shared input changed (the
 * corpus, the harness, this script, the workflow, a lockfile or a toolchain
 * pin); and every package that depends on one of those.
 */
export function pick(
  changed: string[] | null,
  all: BenchPackage[],
): BenchPackage[] {
  if (changed === null) return all;
  const shared =
    /^(bench\/|scripts\/perf-gate|\.github\/workflows\/perf-gate\.yml$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|package\.json$|packages\/rust\/(Cargo\.(toml|lock)|rust-toolchain\.toml)$)/;
  if (changed.some((f) => shared.test(f))) return all;
  const names = new Set<string>();
  for (const f of changed) {
    const m = /^packages\/(?:ts|rust)\/([^/]+)\//.exec(f);
    if (m) names.add((m[1] as string).replace(/-wasm$/, ""));
  }
  // Add dependents until nothing new joins.
  for (let grew = true; grew;) {
    grew = false;
    for (const p of all) {
      if (!names.has(p.name) && p.deps.some((d) => names.has(d))) {
        names.add(p.name);
        grew = true;
      }
    }
  }
  return all.filter((p) => names.has(p.name));
}

/** Whether the PR carries the label and a stated reason. */
export function accepted(
  labels: string[],
  body: string,
): { ok: boolean; reason: string | null } {
  if (!labels.includes(ACCEPT_LABEL)) return { ok: false, reason: null };
  const m = /^\s*perf-accepted:[ \t]*(\S.*)$/im.exec(body);
  const reason = m?.[1]?.trim() ?? "";
  return reason.length >= MIN_REASON
    ? { ok: true, reason }
    : { ok: false, reason: null };
}

/** The median of `values`, which must not be empty. */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2
    ? (s[mid] as number)
    : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** The best (smallest) of `values`, which must not be empty. */
export function best(values: number[]): number {
  return Math.min(...values);
}

/** Compare two sides' figures. Rows are sorted by id. */
export function compare(
  base: Medians,
  head: Medians,
  threshold = THRESHOLD,
): Row[] {
  const rows: Row[] = [];
  for (const id of [...new Set([...base.keys(), ...head.keys()])].sort()) {
    const b = base.get(id) ?? null;
    const h = head.get(id) ?? null;
    if (b === null || h === null) {
      rows.push({
        id,
        base: b,
        head: h,
        ratio: null,
        status: b === null ? "new" : "removed",
      });
      continue;
    }
    const ratio = h / b;
    const status =
      ratio > 1 + threshold
        ? "slower"
        : ratio < 1 - threshold
          ? "faster"
          : "ok";
    rows.push({ id, base: b, head: h, ratio, status });
  }
  return rows;
}

/**
 * Settle the first pass with the confirmation pass: a `slower` row whose
 * confirmation ratio is not over the threshold again becomes `unconfirmed`.
 * A suspect the confirmation pass did not measure stays `slower`.
 */
export function confirmed(
  rows: Row[],
  again: Row[],
  threshold = THRESHOLD,
): Row[] {
  const by = new Map(again.map((r) => [r.id, r]));
  return rows.map((r) => {
    if (r.status !== "slower") return r;
    const c = by.get(r.id)?.ratio;
    if (c === null || c === undefined) return r;
    return {
      ...r,
      confirm: c,
      status: c > 1 + threshold ? "slower" : "unconfirmed",
    };
  });
}

/** The `<lang>:<package>` of each benchmark id, without repeats. */
export function packagesOf(ids: string[]): Set<string> {
  return new Set(ids.map((id) => id.slice(0, id.indexOf("/"))));
}

/** `<id> -> ms` from a vitest JSON report (reporter=json) of one package. */
export function parseVitest(pkg: string, report: unknown): Medians {
  const out: Medians = new Map();
  const files =
    (report as { testResults?: { assertionResults?: unknown[] }[] })
      .testResults ?? [];
  for (const file of files) {
    for (const a of (file.assertionResults ?? []) as {
      benchmarks?: {
        name: string;
        tasks: { name: string; latency: { p50: number } }[];
      }[];
    }[]) {
      for (const group of a.benchmarks ?? []) {
        for (const task of group.tasks)
          out.set(`ts:${pkg}/${group.name}/${task.name}`, task.latency.p50);
      }
    }
  }
  return out;
}

/** `<id> -> ms` from criterion's `benchmark.json` and `estimates.json` pairs under `dir`. */
export function parseCriterion(crate: string, dir: string): Medians {
  const out: Medians = new Map();
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = join(d, e.name);
      if (
        e.name === "new" &&
        existsSync(join(p, "estimates.json")) &&
        existsSync(join(p, "benchmark.json"))
      ) {
        const est = JSON.parse(
          readFileSync(join(p, "estimates.json"), "utf8"),
        ) as { median: { point_estimate: number } };
        const meta = JSON.parse(
          readFileSync(join(p, "benchmark.json"), "utf8"),
        ) as { full_id: string };
        out.set(
          `rust:${crate}/${meta.full_id}`,
          est.median.point_estimate / 1e6,
        );
      } else if (e.name !== "report") {
        walk(p);
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

function sh(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): string {
  return execFileSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 256 << 20,
  });
}

/** Build what a package's benchmarks import, on one side. */
function build(root: string, p: BenchPackage): void {
  if (p.lang === "ts")
    sh(
      "pnpm",
      [
        "--filter",
        `{./packages/ts/${p.name}}...`,
        "--if-present",
        "run",
        "build",
      ],
      root,
    );
}

/** Run one package's benchmarks on one side; its medians. */
function runPackage(
  root: string,
  p: BenchPackage,
  corpusFile: string,
  scratch: string,
): Medians {
  if (p.lang === "ts") {
    const out = join(
      scratch,
      `${p.name}-${Math.random().toString(36).slice(2)}.json`,
    );
    sh(
      "pnpm",
      [
        "exec",
        "vitest",
        "bench",
        "--run",
        "--reporter=json",
        `--outputFile=${out}`,
      ],
      join(root, "packages/ts", p.name),
    );
    return parseVitest(p.name, JSON.parse(readFileSync(out, "utf8")));
  }
  const rustRoot = join(root, "packages/rust");
  const target = join(rustRoot, "target", "criterion");
  rmSync(target, { recursive: true, force: true });
  sh("cargo", ["bench", "-p", p.name, "--benches", "--locked"], rustRoot, {
    OSDLC_BENCH_CORPUS: corpusFile,
  });
  return parseCriterion(p.name, target);
}

/** The markdown table of the rows. */
export function table(rows: Row[], threshold = THRESHOLD): string {
  const fmt = (v: number | null): string =>
    v === null
      ? "-"
      : v >= 1
        ? `${v.toFixed(2)} ms`
        : `${(v * 1000).toFixed(1)} us`;
  const lines = [
    `Best round's median per iteration, head against base; a gated benchmark fails above +${Math.round(threshold * 100)}% in the first pass and again in the confirmation pass.`,
    "",
    "| benchmark | base | head | change | |",
    "| --- | ---: | ---: | ---: | --- |",
  ];
  for (const r of rows) {
    const change =
      r.ratio === null
        ? ""
        : `${r.ratio >= 1 ? "+" : ""}${((r.ratio - 1) * 100).toFixed(1)}%`;
    const again =
      r.confirm === undefined
        ? ""
        : ` (again ${r.confirm >= 1 ? "+" : ""}${((r.confirm - 1) * 100).toFixed(1)}%)`;
    lines.push(
      `| ${r.id} | ${fmt(r.base)} | ${fmt(r.head)} | ${change} | ${r.status === "ok" ? "" : r.status}${again} |`,
    );
  }
  return lines.join("\n");
}

function changedFiles(file: string | undefined): string[] | null {
  if (file === undefined) return null;
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const USAGE =
  "usage: node scripts/perf-gate.ts <base-dir> <head-dir> [--changed <file>] [--rounds N] [--confirm-rounds N] [--out <dir>]";

/** Run the gate; returns the process exit code. */
export function main(argv: string[]): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        changed: { type: "string" },
        rounds: { type: "string" },
        "confirm-rounds": { type: "string" },
        out: { type: "string" },
      },
    });
  } catch (e) {
    console.error(`perf gate: ${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  const { positionals } = parsed;
  const { changed, rounds: roundsArg, out: outDir } = parsed.values;
  if (positionals[0] === "pick") {
    const head = positionals[1] ?? ".";
    const picked = pick(changedFiles(changed), discover(head));
    console.log(JSON.stringify(picked.map((p) => `${p.lang}:${p.name}`)));
    return 0;
  }
  const [base, head] = positionals;
  if (!base || !head) {
    console.error(USAGE);
    return 2;
  }
  const rounds = Number(roundsArg ?? 3);
  const confirmRounds = Number(parsed.values["confirm-rounds"] ?? 3);
  if (!Number.isInteger(rounds) || rounds < 1) {
    console.error("perf gate: --rounds must be a positive integer");
    return 2;
  }
  if (!Number.isInteger(confirmRounds) || confirmRounds < 0) {
    console.error("perf gate: --confirm-rounds must be a non-negative integer");
    return 2;
  }
  const picked = pick(changedFiles(changed), discover(head));
  if (picked.length === 0) {
    console.log(
      "perf gate: no package with benchmarks is affected; nothing to compare.",
    );
    return 0;
  }
  console.log(
    `perf gate: ${picked.map((p) => `${p.lang}:${p.name}`).join(", ")}; ${rounds} rounds`,
  );

  const scratch = mkdtempSync(join(tmpdir(), "perf-gate-"));
  // Also runs when a build or benchmark throws.
  process.once("exit", () => rmSync(scratch, { recursive: true, force: true }));
  const corpusFile = join(scratch, "corpus.json");
  sh("node", [join(head, "bench/corpus/cli.ts"), corpusFile], head);
  // Both sides time the head's corpus.
  if (existsSync(join(base, "bench")))
    cpSync(join(head, "bench/corpus"), join(base, "bench/corpus"), {
      recursive: true,
    });

  const roots = { base, head } as const;
  // A new benchmark's package is absent on the base.
  const onBase = new Set(discover(base).map((q) => `${q.lang}:${q.name}`));
  const hasBenches = (p: BenchPackage): boolean =>
    onBase.has(`${p.lang}:${p.name}`);
  for (const side of ["base", "head"] as const) {
    for (const p of picked)
      if (side === "head" || hasBenches(p)) build(roots[side], p);
  }
  type Samples = Map<string, number[]>;
  /** Run `rounds` rounds of `packages`; each round's median per benchmark, by side. */
  const measure = (
    packages: BenchPackage[],
    count: number,
    firstSide: "base" | "head",
    label: string,
  ): { base: Samples; head: Samples } => {
    const got = {
      base: new Map<string, number[]>(),
      head: new Map<string, number[]>(),
    };
    for (let round = 0; round < count; round++) {
      const order =
        (round % 2 === 0) === (firstSide === "base")
          ? (["base", "head"] as const)
          : (["head", "base"] as const);
      for (const p of packages) {
        for (const side of order) {
          if (side === "base" && !hasBenches(p)) continue;
          console.log(
            `${label} ${round + 1}/${count}: ${side} ${p.lang}:${p.name}`,
          );
          const medians = runPackage(roots[side], p, corpusFile, scratch);
          // An empty report would otherwise read as "no benchmarks, nothing slower".
          if (medians.size === 0)
            throw new Error(
              `perf gate: ${side} ${p.lang}:${p.name} reported no benchmarks`,
            );
          for (const [id, ms] of medians) {
            const list = got[side].get(id) ?? [];
            list.push(ms);
            got[side].set(id, list);
          }
        }
      }
    }
    return got;
  };
  const reduce = (m: Samples): Medians =>
    new Map([...m].map(([id, v]) => [id, best(v)]));

  const samples = measure(picked, rounds, "base", "round");
  let rows = compare(reduce(samples.base), reduce(samples.head));
  let confirmSamples: { base: Samples; head: Samples } | null = null;
  const suspects = packagesOf(
    rows.filter((r) => r.status === "slower").map((r) => r.id),
  );
  if (suspects.size > 0 && confirmRounds > 0) {
    console.log(
      `perf gate: over the threshold in ${[...suspects].join(", ")}; confirming ${confirmRounds} rounds`,
    );
    // The opposite order from the first pass, so neither side always goes first.
    confirmSamples = measure(
      picked.filter((p) => suspects.has(`${p.lang}:${p.name}`)),
      confirmRounds,
      "head",
      "confirm",
    );
    rows = confirmed(
      rows,
      compare(reduce(confirmSamples.base), reduce(confirmSamples.head)),
    );
  }
  const text = table(rows);
  console.log(text);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "perf-gate.json"),
      JSON.stringify(
        {
          rounds,
          confirmRounds: confirmSamples ? confirmRounds : 0,
          rows,
          samples: { base: [...samples.base], head: [...samples.head] },
          confirmSamples: confirmSamples && {
            base: [...confirmSamples.base],
            head: [...confirmSamples.head],
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(join(outDir, "perf-gate.md"), text + "\n");
  }

  const slower = rows.filter((r) => r.status === "slower");
  const labels = (process.env["PERF_LABELS"] ?? "")
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
  const verdict = accepted(labels, process.env["PERF_BODY"] ?? "");
  let summary = text;
  let code = 0;
  if (slower.length > 0) {
    if (verdict.ok) {
      summary += `\n\nSlowdown accepted by the \`${ACCEPT_LABEL}\` label: ${verdict.reason}`;
    } else {
      summary += `\n\n${slower.length} benchmark(s) are more than ${Math.round(THRESHOLD * 100)}% slower. To let a deliberate slowdown through, add the \`${ACCEPT_LABEL}\` label and a line \`Perf-accepted: <reason>\` to the PR body.`;
      code = 1;
    }
    console.log(summary.slice(text.length));
  }
  if (process.env["GITHUB_STEP_SUMMARY"])
    appendFileSync(
      process.env["GITHUB_STEP_SUMMARY"],
      `## Perf gate\n\n${summary}\n`,
    );
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  process.exit(main(process.argv.slice(2)));
