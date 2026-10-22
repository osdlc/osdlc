/**
 * The output seam every CLI writes through, instead of naming
 * `process.stdout` / `process.stderr` itself.
 *
 * A handler that writes to a process stream directly cannot be tested without
 * monkeypatching a global, and a patch that leaks on a missed `finally`
 * corrupts every other test in the process. An injected sink is captured
 * instead.
 *
 * Exit codes are NOT part of this seam. They stay ordinary return values —
 * `CliIo` covers what gets printed, not whether the run succeeded.
 *
 * There is no `stdin` member, and ambient values a command needs beyond
 * output live in {@link CliContext} rather than widening this. An interactive
 * surface owning the terminal — raw mode, keystrokes, handing the terminal to
 * a spawned task — is a different thing, and folding it into a seam meant for
 * one-shot output would blur both.
 */
export interface CliIo {
  stdout(text: string): void
  stderr(text: string): void
}

/**
 * The real thing: writes to the actual process streams. This is the only
 * place a CLI names one.
 *
 * Declared as arrow-function properties, not methods, so `processIo` still
 * works when its members are destructured or spread (`{ ...processIo }`,
 * `{ stdout: processIo.stdout }`) — a method relying on `this` would break
 * the moment it left the object literal.
 */
export const processIo: CliIo = {
  stdout: (text) => {
    process.stdout.write(text)
  },
  stderr: (text) => {
    process.stderr.write(text)
  },
}

/**
 * A `CliIo` that accumulates what it is given instead of printing it, for
 * tests asserting on output.
 */
export function captureIo(): CliIo & { out: string; err: string } {
  const captured = {
    out: '',
    err: '',
    stdout: (text: string) => {
      captured.out += text
    },
    stderr: (text: string) => {
      captured.err += text
    },
  }
  return captured
}

/**
 * Everything ambient a `main` needs, beyond where its output goes.
 *
 * `cwd` and `env` arrive as values rather than being read from the process,
 * which is what lets a test drive a whole command in process against a
 * temporary directory. They sit here rather than on {@link CliIo} because
 * that seam is about output and widening it blurs what it promises.
 */
export interface CliContext {
  io: CliIo
  cwd: string
  env: Record<string, string | undefined>
}

/** The real ambient context: this process's streams, directory and environment. */
export function processContext(): CliContext {
  return { io: processIo, cwd: process.cwd(), env: process.env }
}

/**
 * A context wired to a capturing sink, for tests. `cwd` and `env` default to
 * the real ones because most tests only care about the output.
 */
export function captureContext(
  overrides: Partial<Omit<CliContext, 'io'>> = {},
): CliContext & { io: ReturnType<typeof captureIo> } {
  return {
    io: captureIo(),
    cwd: overrides.cwd ?? process.cwd(),
    env: overrides.env ?? process.env,
  }
}
