/**
 * The output interface every CLI writes through, instead of naming
 * `process.stdout` / `process.stderr` itself.
 *
 * A handler that writes to a process stream directly cannot be tested without
 * monkeypatching a global. A patch that leaks on a missed `finally` breaks
 * every other test in the process. An injected `CliIo` can be captured
 * instead.
 *
 * Exit codes are not part of this interface. They stay ordinary return
 * values. `CliIo` covers what gets printed, not whether the run succeeded.
 *
 * There is no `stdin` member. Other values a command needs beyond output are
 * in {@link CliContext}. An interactive program that controls the terminal
 * (raw mode, keystrokes, handing the terminal to a spawned task) needs a
 * different interface, so it is not added here.
 */
export interface CliIo {
  stdout(text: string): void
  stderr(text: string): void
}

/**
 * Writes to the real process streams. This is the only place a CLI names one.
 *
 * Declared as arrow-function properties, not methods, so `processIo` still
 * works when its members are destructured or spread (`{ ...processIo }`,
 * `{ stdout: processIo.stdout }`). A method that used `this` would break once
 * it was taken off the object.
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
 * What a `main` needs from its environment, beyond where its output goes.
 *
 * `cwd` and `env` are passed in as values rather than read from the process.
 * That lets a test run a whole command in process against a temporary
 * directory. They are here rather than on {@link CliIo} because `CliIo` is
 * only about output.
 */
export interface CliContext {
  io: CliIo
  cwd: string
  env: Record<string, string | undefined>
  /**
   * What the streams are connected to. Absent means none is a terminal, which
   * is the safe reading: no color, no prompt, help wrapped at 80 columns.
   */
  terminal?: Terminal
}

/**
 * Which of the process streams are terminals, and how wide stdout is.
 * @experimental
 */
export interface Terminal {
  stdin: boolean
  stdout: boolean
  stderr: boolean
  /** The width of stdout in columns, when it is a terminal. */
  columns?: number
}

/** The real ambient context: this process's streams, directory and environment. */
export function processContext(): CliContext {
  return {
    io: processIo,
    cwd: process.cwd(),
    env: process.env,
    terminal: {
      stdin: process.stdin.isTTY === true,
      stdout: process.stdout.isTTY === true,
      stderr: process.stderr.isTTY === true,
      ...(process.stdout.columns !== undefined ? { columns: process.stdout.columns } : {}),
    },
  }
}

/**
 * Whether output to stdout should be colored.
 *
 * `NO_COLOR` set to anything but the empty string turns color off, and wins.
 * `FORCE_COLOR` set to anything but `0` or `false` turns it on. Otherwise
 * color follows whether stdout is a terminal, and `TERM=dumb` turns it off.
 * A JSON answer is never colored; the caller passes `json: true` for one.
 * @experimental
 */
export function colorEnabled(ctx: CliContext, opts: { json?: boolean } = {}): boolean {
  if (opts.json === true) return false
  const no = ctx.env['NO_COLOR']
  if (no !== undefined && no !== '') return false
  const force = ctx.env['FORCE_COLOR']
  if (force !== undefined && force !== '0' && force !== 'false') return true
  if (ctx.env['TERM'] === 'dumb') return false
  return ctx.terminal?.stdout === true
}

/**
 * A context that captures output, for tests. `cwd` and `env` default to
 * the real ones because most tests only care about the output.
 */
export function captureContext(
  overrides: Partial<Omit<CliContext, 'io'>> = {},
): CliContext & { io: ReturnType<typeof captureIo> } {
  return {
    io: captureIo(),
    cwd: overrides.cwd ?? process.cwd(),
    env: overrides.env ?? process.env,
    ...(overrides.terminal !== undefined ? { terminal: overrides.terminal } : {}),
  }
}
