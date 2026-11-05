/**
 * Synchronous prompts (yes/no, a line of text, one of a list), so a caller
 * inside a synchronous loop can ask between two steps. Also: finding a
 * terminal to ask on when stdin is a pipe, and failing with a typed error when
 * there is none.
 */

import { spawnSync } from 'node:child_process'
import { closeSync, openSync, readSync, writeSync } from 'node:fs'
import { isatty } from 'node:tty'

import { EXIT } from './exit.ts'
import { safe } from './safe.ts'

/** Only `y` or `yes`, in any case, means yes. */
export function isYes(answer: string): boolean {
  return /^y(es)?$/i.test(answer.trim())
}

const PAUSE = new Int32Array(new SharedArrayBuffer(4))

/**
 * Read up to the first newline from `fd`. Returns an empty string at end of
 * input. Reads one byte at a time so nothing after the newline is consumed
 * (the next call sees it) and a multi-byte character is decoded whole.
 */
export function readLine(fd = 0): string {
  return readLineOrEnd(fd) ?? ''
}

/** {@link readLine}, but `null` when input ended before any byte of a line was read. */
function readLineOrEnd(fd: number): string | null {
  const buf = Buffer.alloc(1)
  const bytes: number[] = []
  for (;;) {
    let n: number
    try {
      n = readSync(fd, buf, 0, 1, null)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EAGAIN') throw e
      // EAGAIN: stdin is non-blocking and has no input yet; wait and retry.
      Atomics.wait(PAUSE, 0, 0, 50)
      continue
    }
    if (n === 0 && bytes.length === 0) return null
    if (n === 0 || buf[0] === 0x0a) return Buffer.from(bytes).toString('utf8')
    bytes.push(buf[0]!)
  }
}

/**
 * Runs `stty` on the terminal: its output, trimmed, or null when it failed or
 * there is no `stty` (Windows).
 */
export type Stty = (args: readonly string[]) => string | null

function sttyOn(fd: number): Stty {
  return (args) => {
    const run = spawnSync('stty', args, { stdio: [fd, 'pipe', 'ignore'], encoding: 'utf8' })
    return run.status === 0 ? run.stdout.trim() : null
  }
}

/** Options for {@link discardTypeAhead}. */
export interface DiscardTypeAheadOptions {
  /** The terminal's file descriptor. Default 0. */
  fd?: number
  /** Runs `stty` on that terminal. Defaults to the real `stty`. */
  stty?: Stty
}

/**
 * Throw away whatever was typed on the terminal at `fd` before now, so keys
 * pressed while a long step ran cannot answer the question that follows it.
 * Returns the number of bytes thrown away; 0 when there were none or the
 * terminal's mode cannot be changed.
 *
 * A line still being typed (no Enter yet) sits in the terminal's line editor,
 * where a read cannot reach it. Leaving canonical mode for a moment hands it
 * to the reader; `min 0 time 0` makes a read with nothing waiting return at
 * once. The saved mode is put back before this returns.
 *
 * @throws Error when the saved mode cannot be put back.
 */
export function discardTypeAhead(opts: DiscardTypeAheadOptions = {}): number {
  const fd = opts.fd ?? 0
  const stty = opts.stty ?? sttyOn(fd)
  const saved = stty(['-g'])
  if (saved === null || saved === '') return 0
  if (stty(['-icanon', 'min', '0', 'time', '0']) === null) {
    stty([saved])
    return 0
  }
  let discarded = 0
  try {
    const buf = Buffer.alloc(256)
    for (;;) {
      let n: number
      try {
        n = readSync(fd, buf, 0, buf.length, null)
      } catch (e) {
        // EAGAIN: a non-blocking descriptor with nothing waiting.
        if ((e as NodeJS.ErrnoException).code === 'EAGAIN') break
        throw e
      }
      if (n === 0) break
      discarded += n
    }
  } finally {
    // A terminal left in `min 0 time 0` would answer the next read with an
    // empty line, which is the default answer. Better to stop than to ask.
    if (stty([saved]) === null) {
      throw new Error('cannot restore the terminal mode after reading typed-ahead input')
    }
  }
  return discarded
}

/** True when stdin and stderr are both terminals, so someone can see a question and answer it. */
export function canPrompt(): boolean {
  // `isatty`, not `process.stdin.isTTY`: touching `process.stdin` makes fd 0 non-blocking.
  return isatty(0) && isatty(2)
}

/**
 * A question that needed a person to answer it and got no answer. `reason`
 * says why: `no-terminal` when there was no terminal to ask on, and
 * `end-of-input` when input ended before an answer was typed.
 *
 * `runMain` and a command tree's `run` print its message and exit with
 * {@link NotInteractiveError.exit}. That is 2 ({@link EXIT.usage}) for
 * `no-terminal`, as the CLI standard asks of a command that would prompt with
 * nobody there: the command line has to change, to pass the flag that
 * answers instead. It is 1 for `end-of-input`, where someone was asked and
 * closed the input.
 * @experimental
 */
export class NotInteractiveError extends Error {
  /** Why there was no answer. */
  readonly reason: 'no-terminal' | 'end-of-input'
  /** The flag that answers instead, when the caller named one. The message names it too. */
  readonly flag: string | undefined
  /** The exit code for this error: 2 for `no-terminal`, 1 for `end-of-input`. */
  readonly exit: number
  constructor(reason: 'no-terminal' | 'end-of-input', options: { flag?: string | undefined } = {}) {
    const what =
      reason === 'no-terminal'
        ? 'cannot ask: there is no terminal to answer on'
        : 'no answer: input ended before one was typed'
    super(options.flag === undefined ? what : `${what}. Pass ${options.flag} instead.`)
    this.name = 'NotInteractiveError'
    this.reason = reason
    this.flag = options.flag
    this.exit = reason === 'no-terminal' ? EXIT.usage : EXIT.error
  }
}

/**
 * A terminal to ask on: where answers are read from and where questions are
 * written. Hand both to a prompt, and close it when done:
 *
 * ```ts
 * const tty = requireInteractive({ flag: '--yes' })
 * try {
 *   if (!askYesNo('Delete it?', { fd: tty.fd, write: tty.write })) return EXIT.ok
 * } finally {
 *   tty.close()
 * }
 * ```
 * @experimental
 */
export interface PromptTerminal {
  /** Where answers are read from: 0, or a descriptor open on the terminal device. */
  readonly fd: number
  /** Writes text where the person sees it: stderr, or the terminal device. */
  readonly write: (text: string) => void
  /**
   * `stdio` when stdin and stderr are the terminal, and `device` when they
   * are not and the terminal device was opened instead.
   */
  readonly source: 'stdio' | 'device'
  /** Close the descriptor this opened. Nothing to close for `stdio`. Safe to call twice. */
  close(): void
}

/**
 * Options for {@link openTty}.
 * @experimental
 */
export interface OpenTtyOptions {
  /**
   * The terminal device to open when stdin or stderr is not a terminal.
   * Default `/dev/tty`, the process's controlling terminal.
   */
  path?: string
  /** For tests: whether a descriptor is a terminal. Defaults to `isatty`. */
  isTerminal?: (fd: number) => boolean
}

/** Write all of `text` to `fd`. */
function writeAll(fd: number, text: string): void {
  const buf = Buffer.from(text)
  let written = 0
  while (written < buf.length) written += writeSync(fd, buf, written)
}

/**
 * A terminal to ask on, also when stdin is a pipe. When stdin and stderr are
 * both terminals, that is them. Otherwise the process's controlling terminal
 * (`/dev/tty`) is opened for reading and writing, so `generate | tool apply`
 * can read its data from the pipe and still ask the person at the keyboard.
 * Returns `null` when there is no terminal: no controlling terminal (a CI job,
 * cron, a detached process) or no `/dev/tty` (Windows).
 *
 * The prompts read stdin unless given another `fd`; this is how a caller
 * gives them one. Use it in a command whose stdin carries data. A command
 * that only asks a question should read the answer from stdin, so a script
 * can still answer it.
 * @experimental
 */
export function openTty(opts: OpenTtyOptions = {}): PromptTerminal | null {
  const isTerminal = opts.isTerminal ?? isatty
  if (isTerminal(0) && isTerminal(2)) {
    return {
      fd: 0,
      write: (text) => process.stderr.write(text),
      source: 'stdio',
      close: () => {},
    }
  }
  let fd: number
  try {
    fd = openSync(opts.path ?? '/dev/tty', 'r+')
  } catch {
    // ENXIO: no controlling terminal. ENOENT: no such device.
    return null
  }
  if (!isTerminal(fd)) {
    closeSync(fd)
    return null
  }
  let open = true
  return {
    fd,
    write: (text) => writeAll(fd, text),
    source: 'device',
    close: () => {
      if (!open) return
      open = false
      closeSync(fd)
    },
  }
}

/**
 * Options for {@link requireInteractive}.
 * @experimental
 */
export interface RequireInteractiveOptions extends OpenTtyOptions {
  /** The flag that answers instead, named in the error's message. */
  flag?: string
}

/**
 * {@link openTty}, but a missing terminal throws instead of returning `null`.
 * Call it before the work starts, so a run that will need an answer fails
 * at once rather than halfway through.
 *
 * @throws {@link NotInteractiveError} (`no-terminal`) when there is no terminal.
 * @experimental
 */
export function requireInteractive(opts: RequireInteractiveOptions = {}): PromptTerminal {
  const tty = openTty(opts)
  if (tty === null) throw new NotInteractiveError('no-terminal', { flag: opts.flag })
  return tty
}

/**
 * What every prompt takes: where the question is written, where the answer
 * is read from, and what happens when nobody can answer.
 */
export interface PromptOptions {
  /** Receives the question text. Default: stderr. */
  write?: (text: string) => void
  /** File descriptor the answer is read from. Default 0, stdin. */
  fd?: number
  /**
   * Throw away input typed before the question, when `fd` is a terminal, so
   * a key pressed early cannot answer it. Default true. The question says so
   * when something was thrown away.
   */
  discardTypeAhead?: boolean
  /**
   * Throw {@link NotInteractiveError} instead of answering without a person:
   * `no-terminal` before asking when `fd` is not a terminal (or, with no
   * `write` given, stderr is not one), and `end-of-input` when input ends
   * before an answer. Default false: whatever `fd` gives is the answer, and
   * end of input gives the default.
   * @experimental
   */
  required?: boolean
  /**
   * The flag that answers instead, named in a {@link NotInteractiveError}'s message.
   * @experimental
   */
  flag?: string
  /** For tests: runs `stty` for {@link discardTypeAhead}. Defaults to the real `stty`. */
  stty?: Stty
  /** For tests: whether `fd` is a terminal. Defaults to `isatty(fd)`. */
  isTerminal?: boolean
}

/**
 * Options for asking a yes/no question on the terminal: the default answer,
 * and the options every prompt takes.
 */
export interface AskYesNoOptions extends PromptOptions {
  /** The answer an empty line gives. */
  defaultYes?: boolean
}

/** A question about to be asked: where it goes, and how its answer is read. */
interface Asking {
  fd: number
  write: (text: string) => void
  required: boolean
  flag: string | undefined
}

/**
 * Check that someone can answer, when the prompt requires it, and throw away
 * keys typed early.
 */
function startAsking(opts: PromptOptions): Asking {
  const fd = opts.fd ?? 0
  const write = opts.write ?? ((text: string) => process.stderr.write(text))
  const terminal = opts.isTerminal ?? isatty(fd)
  const required = opts.required ?? false
  if (required && (!terminal || (opts.write === undefined && !isatty(2)))) {
    throw new NotInteractiveError('no-terminal', { flag: opts.flag })
  }
  if ((opts.discardTypeAhead ?? true) && terminal) {
    const discarded = discardTypeAhead({
      fd,
      ...(opts.stty === undefined ? {} : { stty: opts.stty }),
    })
    if (discarded > 0) write('(ignored what was typed before this question)\n')
  }
  return { fd, write, required, flag: opts.flag }
}

/** One answer, trimmed. `null` at end of input, or a throw when an answer is required. */
function readAnswer(asking: Asking): string | null {
  const line = readLineOrEnd(asking.fd)
  if (line === null && asking.required) {
    throw new NotInteractiveError('end-of-input', { flag: asking.flag })
  }
  return line === null ? null : line.trim()
}

/**
 * Write `question` with a `[y/N]` or `[Y/n]` hint and read one line. An empty
 * answer, or end of input, takes `defaultYes`. Otherwise only `y`/`yes` is yes.
 *
 * @throws {@link NotInteractiveError} when `required` is set and nobody can answer.
 */
export function askYesNo(question: string, opts: AskYesNoOptions = {}): boolean {
  const defaultYes = opts.defaultYes ?? false
  const asking = startAsking(opts)
  asking.write(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `)
  const answer = readAnswer(asking)
  return answer === null || answer === '' ? defaultYes : isYes(answer)
}

/**
 * Options for {@link askText}.
 * @experimental
 */
export interface AskTextOptions extends PromptOptions {
  /** The answer an empty line gives. Shown in brackets after the question. */
  default?: string
}

/**
 * Write `question`, with the default in brackets when there is one, and read
 * one line. White space around the answer is trimmed. An empty answer, or end
 * of input, gives `default`, or the empty string when there is none.
 *
 * The default is printed with terminal controls removed, since it is often
 * data from outside the tool (a branch name, a path). The question is printed
 * as given.
 *
 * @throws {@link NotInteractiveError} when `required` is set and nobody can answer.
 * @experimental
 */
export function askText(question: string, opts: AskTextOptions = {}): string {
  const fallback = opts.default ?? ''
  const asking = startAsking(opts)
  asking.write(fallback === '' ? `${question} ` : `${question} [${safe(fallback)}] `)
  const answer = readAnswer(asking)
  return answer === null || answer === '' ? fallback : answer
}

/**
 * Options for {@link askChoice}.
 * @experimental
 */
export interface AskChoiceOptions<T extends string> extends PromptOptions {
  /** The choice an empty line gives. Must be one of the choices. */
  default?: NoInfer<T>
}

/**
 * The choice `answer` names: the one at that number in the list, the one
 * with that text, or the only one with that text in another case.
 */
function choiceFor<T extends string>(answer: string, choices: readonly T[]): T | undefined {
  if (/^\d+$/.test(answer)) {
    const index = Number(answer)
    if (index >= 1 && index <= choices.length) return choices[index - 1]
  }
  const exact = choices.find((c) => c === answer)
  if (exact !== undefined) return exact
  const folded = choices.filter((c) => c.toLowerCase() === answer.toLowerCase())
  return folded.length === 1 ? folded[0] : undefined
}

/**
 * Write `question` and the choices as a numbered list, then read one line
 * and return the choice it names: its number, or its text (in any case, when
 * only one choice matches). An empty answer gives `default`. Any other
 * answer, or an empty one with no default, says what to type and asks again.
 *
 * End of input gives `default`. With no default there is nothing to give,
 * so it throws.
 *
 * The choices and the default are printed with terminal controls removed,
 * since they are often data from outside the tool (branch names, remotes).
 * The question is printed as given.
 *
 * @throws Error when `choices` is empty or lists a choice twice, or `default`
 *   is not one of them.
 * @throws {@link NotInteractiveError} when `required` is set and nobody can
 *   answer, or when input ends with no default to give.
 * @experimental
 */
export function askChoice<const T extends string>(
  question: string,
  choices: readonly T[],
  opts: AskChoiceOptions<T> = {},
): T {
  if (choices.length === 0) throw new Error('askChoice needs at least one choice')
  const twice = choices.find((c, i) => choices.indexOf(c) !== i)
  if (twice !== undefined) throw new Error(`askChoice lists '${twice}' twice`)
  const fallback = opts.default
  if (fallback !== undefined && !choices.includes(fallback)) {
    throw new Error(`askChoice's default '${fallback}' is not one of the choices`)
  }
  const asking = startAsking(opts)
  const range = choices.length === 1 ? '1' : `1-${choices.length}`
  const hint = fallback === undefined ? '' : ` [${choices.indexOf(fallback) + 1}]`
  const line = `Choose ${range}${hint}: `
  const list = choices.map((c, i) => `  ${i + 1}) ${safe(c)}\n`).join('')
  asking.write(`${question}\n${list}${line}`)
  const help = choices.length === 1 ? 'Type 1.' : `Type a number from 1 to ${choices.length}.`
  for (;;) {
    const answer = readAnswer(asking)
    if (answer === null) {
      if (fallback !== undefined) return fallback
      throw new NotInteractiveError('end-of-input', { flag: asking.flag })
    }
    if (answer === '' && fallback !== undefined) return fallback
    const chosen = answer === '' ? undefined : choiceFor(answer, choices)
    if (chosen !== undefined) return chosen
    const shown = safe(answer)
    const said = shown === '' ? '' : `'${shown}' is not one of the choices. `
    asking.write(`${said}${help}\n${line}`)
  }
}
