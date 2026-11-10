/**
 * A stand-in for command-seam's forwarded signal. The real one is set only by a signal
 * that the process's own forwarding handled, which a unit test cannot send safely.
 * A test file mocks `@osdlc/command-seam` with `mockForwarding` and sets `forwarded.signal`.
 */

export const forwarded: { signal: NodeJS.Signals | undefined } = { signal: undefined }

/** The `vi.mock` factory: the real module with `forwardedSignal`/`forwardedExitCode` read from `forwarded`. */
export async function mockForwarding(
  importOriginal: () => Promise<typeof import('@osdlc/command-seam')>,
): Promise<typeof import('@osdlc/command-seam')> {
  const actual = await importOriginal()
  return {
    ...actual,
    forwardedSignal: () => forwarded.signal,
    forwardedExitCode: () =>
      forwarded.signal === undefined ? undefined : 128 + (forwarded.signal === 'SIGINT' ? 2 : 15),
  }
}
