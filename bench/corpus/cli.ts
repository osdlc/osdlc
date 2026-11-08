// Writes the corpus as JSON for the Rust benchmarks:
//
//   node bench/corpus/cli.ts <out.json> [--stats]
//
// The file is `{ "bodies": string[], "largest": string, "slow": {name, body}[] }`.
// `--stats` prints the corpus size and construct counts to stderr.
import { writeFileSync } from "node:fs";

import { corpus } from "./index.ts";

const [out, ...flags] = process.argv.slice(2);
if (!out) {
  console.error("usage: node bench/corpus/cli.ts <out.json> [--stats]");
  process.exit(2);
}
const c = corpus();
writeFileSync(
  out,
  JSON.stringify({ bodies: c.bodies, largest: c.largest, slow: c.slow }),
);
if (flags.includes("--stats")) {
  const all = c.bodies.join("\n");
  const count = (re: RegExp) => (all.match(re) ?? []).length;
  const kb = all.length / 1024;
  console.error(
    JSON.stringify(
      {
        notes: c.bodies.length,
        totalKiB: Math.round(kb),
        largestKiB: Math.round(c.largest.length / 1024),
        perKiB: {
          wikilinks: +(count(/(?<!!)\[\[/g) / kb).toFixed(2),
          embeds: +(count(/!\[\[/g) / kb).toFixed(2),
          markdownLinks: +(count(/\]\([^)]+\)/g) / kb).toFixed(2),
          tags: +(count(/(?<=\s)#[\p{L}\p{N}_/-]+/gu) / kb).toFixed(2),
          fences: +(count(/^(```|~~~)/gm) / 2 / kb).toFixed(2),
          callouts: +(count(/^> \[!/gm) / kb).toFixed(2),
        },
      },
      null,
      2,
    ),
  );
}
