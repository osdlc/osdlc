/**
 * Process helpers shared by the real-spawn tests. Not a `*.test.ts` file, so
 * the test runner does not collect it.
 */

/** True while `pid` exists. Throws on a non-positive or NaN pid, which would signal a group or mean nothing. */
export function alive(pid: number): boolean {
  if (!(pid > 0)) throw new Error(`not a pid: ${pid}`)
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** True once `pid` no longer exists, polling for up to `withinMs`. */
export async function gone(pid: number, withinMs = 2_000): Promise<boolean> {
  const end = performance.now() + withinMs
  while (performance.now() < end) {
    if (!alive(pid)) return true
    await new Promise((res) => setTimeout(res, 25))
  }
  return false
}

/**
 * Kill a leftover test process. Skips a pid that was never set (0 or NaN):
 * `kill(0)` would signal the test runner's own process group.
 */
export function reap(pid: number): void {
  if (!(pid > 0)) return
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // already gone
  }
}
