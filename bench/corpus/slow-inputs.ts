// Inputs that made a scanner slow or quadratic once. They are the regression
// cases of markdown-link's linear-time test (tests/linear.test.ts) and of the
// ReDoS tests that markdown-render and markdown-vault-astro carry, written as data
// so a benchmark can time each one. A scanner that is linear on them stays
// near the same cost per byte as on the vault notes.

/** One pathological body, named for the benchmark that reports it. */
export interface SlowInput {
  name: string;
  body: string;
}

/** `prefix`, `n` spaces, `|`, `n` spaces and an `x`, never closed. */
function ambiguousWhitespace(prefix: string, n: number): string {
  return `${prefix}${" ".repeat(n)}|${" ".repeat(n)}x`;
}

/**
 * The slow-input bodies. `scale` is the repeat count of the linear-time
 * cases; the default keeps one scan well under a second.
 */
export function slowInputs(scale = 20_000): SlowInput[] {
  const spaces = " ".repeat(scale);
  return [
    {
      name: "slow/wikilink-padded-inner",
      body: `[[${spaces}x${spaces}x${spaces}]]`,
    },
    { name: "slow/failed-md-link-open", body: "[](a".repeat(scale) },
    { name: "slow/failed-md-link-close", body: `${"[](a".repeat(scale)})` },
    {
      name: "slow/failed-md-link-scheme",
      body: `${"[](a:".repeat(scale)}.md)`,
    },
    { name: "slow/failed-md-link-path", body: `${"[](a/".repeat(scale)}.x)` },
    { name: "slow/many-short-wikilinks", body: "[[a]] ".repeat(scale) },
    { name: "slow/redos-wikilink-120", body: ambiguousWhitespace("[[", 120) },
    { name: "slow/redos-wikilink-1600", body: ambiguousWhitespace("[[", 1600) },
    { name: "slow/redos-embed-120", body: ambiguousWhitespace("![[", 120) },
    { name: "slow/redos-embed-1600", body: ambiguousWhitespace("![[", 1600) },
    { name: "slow/unterminated-openers", body: "[[".repeat(5000) },
  ];
}
