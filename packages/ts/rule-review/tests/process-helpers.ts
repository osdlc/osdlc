/** Waiting on a child process in a test. */

/** Poll `check` until true; throw naming `what` if it never is. */
export async function waitFor(
  what: string,
  check: () => boolean,
  ceilingMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + ceilingMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

/** Whether a process with this pid is still running. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
