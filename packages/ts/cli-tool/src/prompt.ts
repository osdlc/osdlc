/** Synchronous yes/no prompt, so a caller inside a synchronous loop can ask between two steps. */

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
}

/**
 * Write `question` with a `[y/N]` or `[Y/n]` hint and read one line. An empty
 * answer takes `defaultYes`. Otherwise only `y`/`yes` is yes.
 */
export function askYesNo(question: string, opts: AskYesNoOptions = {}): boolean {
  const defaultYes = opts.defaultYes ?? false
  const write = opts.write ?? ((text: string) => process.stderr.write(text))
  write(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `)
  const answer = readLine(opts.fd ?? 0).trim()
  return answer === '' ? defaultYes : isYes(answer)
}
