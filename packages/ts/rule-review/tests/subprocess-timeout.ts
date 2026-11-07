/** Per-test timeout for tests that spawn processes; bun's 5s default is too tight under load. */
export const SUBPROCESS_TIMEOUT_MS = 30_000
