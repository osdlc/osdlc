/** Synchronous yes/no prompt, so a caller inside a synchronous loop can ask between two steps. */

import { spawnSync } from 'node:child_process'
import { readSync } from 'node:fs'
import { isatty } from 'node:tty'

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
    stty([saved])
  }
  return discarded
}

/** True when stdin and stderr are both terminals, so someone can see a question and answer it. */
export function canPrompt(): boolean {
  // `isatty`, not `process.stdin.isTTY`: touching `process.stdin` makes fd 0 non-blocking.
  return isatty(0) && isatty(2)
}

/**
 * Options for asking a yes/no question on the terminal: the default answer,
 * where to write the question and where to read the answer.
 */
export interface AskYesNoOptions {
  /** The answer an empty line gives. */
  defaultYes?: boolean
  /** Receives the question text. */
  write?: (text: string) => void
  /** File descriptor the answer is read from. */
  fd?: number
  /**
   * Throw away input typed before the question, when `fd` is a terminal, so
   * a key pressed early cannot answer it. Default true. The question says so
   * when something was thrown away.
   */
  discardTypeAhead?: boolean
  /** Runs `stty` for {@link discardTypeAhead}. Defaults to the real `stty`. */
  stty?: Stty
}

/**
 * Write `question` with a `[y/N]` or `[Y/n]` hint and read one line. An empty
 * answer takes `defaultYes`. Otherwise only `y`/`yes` is yes.
 */
export function askYesNo(question: string, opts: AskYesNoOptions = {}): boolean {
  const defaultYes = opts.defaultYes ?? false
  const write = opts.write ?? ((text: string) => process.stderr.write(text))
  const fd = opts.fd ?? 0
  if ((opts.discardTypeAhead ?? true) && isatty(fd)) {
    const discarded = discardTypeAhead({
      fd,
      ...(opts.stty === undefined ? {} : { stty: opts.stty }),
    })
    if (discarded > 0) write('(ignored what was typed before this question)\n')
  }
  write(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `)
  const answer = readLine(fd).trim()
  return answer === '' ? defaultYes : isYes(answer)
}
