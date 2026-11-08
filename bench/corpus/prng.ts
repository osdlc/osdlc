// A small seeded generator (mulberry32), so the corpus is the same bytes on
// every machine and every run. Math.random is never used.

/** A function that returns the next value in [0, 1). */
export type Random = () => number;

/** A generator seeded by `seed`. */
export function prng(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [lo, hi]. */
export function int(rand: Random, lo: number, hi: number): number {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** One element of `items`. */
export function pick<T>(rand: Random, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] as T;
}

/** True with probability `p`. */
export function chance(rand: Random, p: number): boolean {
  return rand() < p;
}

/** A log-normal sample with the given median, so most notes are small and a few are large. */
export function logNormal(rand: Random, median: number, sigma: number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * normal);
}
