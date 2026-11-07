import { afterEach, beforeEach, describe, expect, expectTypeOf, test } from 'vitest'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isatty } from 'node:tty'

import {
  askChoice,
  askText,
  askYesNo,
  captureContext,
  discardTypeAhead,
  EXIT,
  isYes,
  NotInteractiveError,
  openTty,
  readLine,
  requireInteractive,
  runMain,
} from '../src/index.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cli-tool-prompt-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Run `fn` with a file descriptor reading `input`. */
function withInput<T>(input: string, fn: (fd: number) => T): T {
  const file = join(dir, 'in')
  writeFileSync(file, input)
  const fd = openSync(file, 'r')
  try {
    return fn(fd)
  } finally {
    closeSync(fd)
  }
}

describe('readLine', () => {
  test.each([
    ['yes\nno\n', 'yes'],
    ['y', 'y'],
    ['', ''],
  ])('%p reads %p', (input, line) => {
    expect(withInput(input, readLine)).toBe(line)
  })
})

describe('readLine across calls', () => {
  test('a second read gets the line after the first newline', () => {
    withInput('y\nn\n', (fd) => {
      expect([readLine(fd), readLine(fd)]).toEqual(['y', 'n'])
    })
  })
  test('multi-byte characters decode whole', () => {
    const text = 'é'.repeat(1500)
    expect(withInput(`${text}\nnext\n`, readLine)).toBe(text)
  })
})

describe('isYes', () => {
  test.each(['y', 'yes', 'Y', 'YES', ' yes \r'])('%p is yes', (a) => {
    expect(isYes(a)).toBe(true)
  })
  test.each(['', 'n', 'no', 'yep', 'y y'])('%p is not', (a) => {
    expect(isYes(a)).toBe(false)
  })
})

describe('askYesNo', () => {
  test.each([
    ['\n', false, false],
    ['\n', true, true],
    ['y\n', false, true],
    ['n\n', true, false],
    ['maybe\n', true, false],
  ])('answer %p with defaultYes %p is %p', (input, defaultYes, expected) => {
    const written: string[] = []
    const answer = withInput(input, (fd) =>
      askYesNo('Go?', { defaultYes, fd, write: (t) => written.push(t) }),
    )
    expect(answer).toBe(expected)
    expect(written).toEqual([defaultYes ? 'Go? [Y/n] ' : 'Go? [y/N] '])
  })
})

describe('discardTypeAhead', () => {
  /** A fake `stty` that records its calls and answers `-g` with a saved mode. */
  function fakeStty(fail: string[] = []) {
    const calls: string[][] = []
    const stty = (args: readonly string[]) => {
      calls.push([...args])
      if (fail.includes(args[0]!)) return null
      return args[0] === '-g' ? 'saved-mode' : ''
    }
    return { calls, stty }
  }

  test('reads everything waiting, then puts the saved mode back', () => {
    const { calls, stty } = fakeStty()
    const discarded = withInput('y\npartial', (fd) => discardTypeAhead({ fd, stty }))
    expect(discarded).toBe(9)
    expect(calls).toEqual([['-g'], ['-icanon', 'min', '0', 'time', '0'], ['saved-mode']])
  })

  test('without stty nothing is read', () => {
    const { calls, stty } = fakeStty(['-g'])
    withInput('y\n', (fd) => {
      expect(discardTypeAhead({ fd, stty })).toBe(0)
      expect(readLine(fd)).toBe('y')
    })
    expect(calls).toEqual([['-g']])
  })

  test('a mode change that fails reads nothing and restores the saved mode', () => {
    const { calls, stty } = fakeStty(['-icanon'])
    withInput('y\n', (fd) => {
      expect(discardTypeAhead({ fd, stty })).toBe(0)
      expect(readLine(fd)).toBe('y')
    })
    expect(calls.at(-1)).toEqual(['saved-mode'])
  })

  test('a mode that cannot be put back is an error, not a default answer', () => {
    const { stty } = fakeStty(['saved-mode'])
    expect(() => withInput('y\n', (fd) => discardTypeAhead({ fd, stty }))).toThrow(
      /cannot restore the terminal mode/,
    )
  })

  test('askYesNo on a terminal throws early input away and says so', () => {
    const { stty } = fakeStty()
    const written: string[] = []
    const answer = withInput('y\n', (fd) =>
      askYesNo('Go?', { fd, stty, isTerminal: true, write: (t) => written.push(t) }),
    )
    // The early `y` is gone; the read then meets end of input, the default.
    expect(answer).toBe(false)
    expect(written).toEqual(['(ignored what was typed before this question)\n', 'Go? [y/N] '])
  })

  test('askYesNo on a terminal with nothing typed early asks plainly', () => {
    const { stty } = fakeStty()
    const written: string[] = []
    withInput('', (fd) =>
      askYesNo('Go?', { fd, stty, isTerminal: true, write: (t) => written.push(t) }),
    )
    expect(written).toEqual(['Go? [y/N] '])
  })

  test('askYesNo leaves input that is not a terminal alone', () => {
    const { calls, stty } = fakeStty()
    const answer = withInput('y\n', (fd) => askYesNo('Go?', { fd, stty, write: () => {} }))
    expect(answer).toBe(true)
    expect(calls).toEqual([])
  })
})

/** What `fn` threw. Fails the test when it returned. */
function thrown(fn: () => unknown): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('expected a throw')
}

/**
 * Options for a prompt reading `fd` as if it were a terminal, with nothing
 * typed early, collecting what is written.
 */
function onTerminal(fd: number, written: string[]) {
  return {
    fd,
    isTerminal: true,
    discardTypeAhead: false,
    write: (t: string) => void written.push(t),
  }
}

describe('NotInteractiveError', () => {
  test('no terminal is a usage error (exit 2) that names the flag', () => {
    const e = new NotInteractiveError('no-terminal', { flag: '--yes' })
    expect(e).toBeInstanceOf(Error)
    expect(e).toMatchObject({ name: 'NotInteractiveError', reason: 'no-terminal', flag: '--yes' })
    expect(e.exit).toBe(EXIT.usage)
    expect(e.message).toBe('cannot ask: there is no terminal to answer on. Pass --yes instead.')
  })

  test('ended input is a failed run (exit 1)', () => {
    const e = new NotInteractiveError('end-of-input')
    expect(e).toMatchObject({ reason: 'end-of-input', flag: undefined, exit: EXIT.error })
    expect(e.message).toBe('no answer: input ended before one was typed')
  })

  test('runMain prints the message and exits with its code', async () => {
    const before = process.exitCode
    try {
      const context = captureContext()
      await runMain(
        () => {
          throw new NotInteractiveError('no-terminal', { flag: '--yes' })
        },
        { name: 'tooly', context, argv: [] },
      )
      expect(context.io.err).toBe(
        'tooly: cannot ask: there is no terminal to answer on. Pass --yes instead.\n',
      )
      expect(process.exitCode).toBe(2)
    } finally {
      process.exitCode = before ?? 0
    }
  })
})

describe('required prompts', () => {
  test('input that is not a terminal throws before asking and reads nothing', () => {
    const written: string[] = []
    withInput('y\n', (fd) => {
      const e = thrown(() =>
        askYesNo('Go?', { fd, required: true, flag: '--yes', write: (t) => written.push(t) }),
      )
      expect(e).toBeInstanceOf(NotInteractiveError)
      expect(e).toMatchObject({ reason: 'no-terminal', flag: '--yes', exit: 2 })
      expect(readLine(fd)).toBe('y')
    })
    expect(written).toEqual([])
  })

  test('an answer on a terminal is read as usual, and an empty line still gives the default', () => {
    const written: string[] = []
    expect(
      withInput('y\n', (fd) => askYesNo('Go?', { ...onTerminal(fd, written), required: true })),
    ).toBe(true)
    expect(
      withInput('\n', (fd) =>
        askYesNo('Go?', { ...onTerminal(fd, written), required: true, defaultYes: true }),
      ),
    ).toBe(true)
  })

  test('end of input throws instead of giving the default', () => {
    const e = withInput('', (fd) =>
      thrown(() => askYesNo('Go?', { ...onTerminal(fd, []), required: true, defaultYes: true })),
    )
    expect(e).toMatchObject({ reason: 'end-of-input', exit: 1 })
  })

  test.each([
    ['askText', (fd: number) => askText('Name?', { ...onTerminal(fd, []), required: true })],
    [
      'askChoice',
      (fd: number) =>
        askChoice('Pick', ['a', 'b'], { ...onTerminal(fd, []), required: true, default: 'a' }),
    ],
  ])('%s throws at end of input too', (_name, ask) => {
    expect(withInput('', (fd) => thrown(() => ask(fd)))).toMatchObject({ reason: 'end-of-input' })
  })

  test.each([
    ['askText', (fd: number) => askText('Name?', { fd, required: true, write: () => {} })],
    [
      'askChoice',
      (fd: number) => askChoice('Pick', ['a'], { fd, required: true, write: () => {} }),
    ],
  ])('%s throws when the input is not a terminal', (_name, ask) => {
    expect(withInput('a\n', (fd) => thrown(() => ask(fd)))).toMatchObject({ reason: 'no-terminal' })
  })

  test.skipIf(isatty(2))('with the default write, stderr that is not a terminal throws', () => {
    const e = withInput('y\n', (fd) =>
      thrown(() =>
        askYesNo('Go?', { fd, isTerminal: true, discardTypeAhead: false, required: true }),
      ),
    )
    expect(e).toMatchObject({ reason: 'no-terminal' })
  })

  test('without required, input that is not a terminal still answers', () => {
    expect(withInput('y\n', (fd) => askYesNo('Go?', { fd, write: () => {} }))).toBe(true)
  })
})

describe('askText', () => {
  test.each([
    ['  main \n', undefined, 'main'],
    ['\n', 'main', 'main'],
    ['', 'main', 'main'],
    ['\n', undefined, ''],
    ['', undefined, ''],
    ['dev\n', 'main', 'dev'],
    ['é ü\r\n', undefined, 'é ü'],
  ])('answer %p with default %p is %p', (input, fallback, expected) => {
    const answer = withInput(input, (fd) =>
      askText('Branch?', {
        fd,
        write: () => {},
        ...(fallback === undefined ? {} : { default: fallback }),
      }),
    )
    expect(answer).toBe(expected)
  })

  test('the question shows the default in brackets, with terminal controls removed', () => {
    const written: string[] = []
    withInput('\n', (fd) =>
      askText('Branch?', { fd, write: (t) => written.push(t), default: 'ma\x1b[2Jin' }),
    )
    withInput('\n', (fd) => askText('Branch?', { fd, write: (t) => written.push(t) }))
    expect(written).toEqual(['Branch? [main] ', 'Branch? '])
  })

  test('reads one line and leaves the next', () => {
    withInput('first\nsecond\n', (fd) => {
      expect(askText('A?', { fd, write: () => {} })).toBe('first')
      expect(readLine(fd)).toBe('second')
    })
  })

  test('on a terminal, keys typed early are thrown away first', () => {
    const written: string[] = []
    const stty = (args: readonly string[]) => (args[0] === '-g' ? 'saved' : '')
    const answer = withInput('early\n', (fd) =>
      askText('Name?', { fd, stty, isTerminal: true, default: 'x', write: (t) => written.push(t) }),
    )
    expect(answer).toBe('x')
    expect(written).toEqual(['(ignored what was typed before this question)\n', 'Name? [x] '])
  })
})

describe('askChoice', () => {
  const REMOTES = ['origin', 'upstream', 'fork'] as const

  /** Ask for one of `choices` with `input` typed, and collect what was written. */
  function choose<T extends string>(
    input: string,
    choices: readonly T[],
    opts: { default?: T } = {},
  ): { chosen: T; written: string } {
    const written: string[] = []
    const chosen = withInput(input, (fd) =>
      askChoice('Which remote?', choices, { ...onTerminal(fd, written), ...opts }),
    )
    return { chosen, written: written.join('') }
  }

  test('writes the question, a numbered list and the range', () => {
    expect(choose('1\n', REMOTES).written).toBe(
      'Which remote?\n  1) origin\n  2) upstream\n  3) fork\nChoose 1-3: ',
    )
    expect(choose('\n', REMOTES, { default: 'fork' }).written).toContain('Choose 1-3 [3]: ')
    expect(choose('1\n', ['only']).written).toBe('Which remote?\n  1) only\nChoose 1: ')
  })

  test.each([
    ['2\n', 'upstream'],
    [' 3 \n', 'fork'],
    ['03\n', 'fork'],
    ['origin\n', 'origin'],
    ['UPSTREAM\n', 'upstream'],
  ])('%p picks %p', (input, expected) => {
    expect(choose(input, REMOTES).chosen).toBe(expected)
  })

  test('an empty line gives the default', () => {
    expect(choose('\n', REMOTES, { default: 'upstream' }).chosen).toBe('upstream')
  })

  test('a bad answer says what to type and asks again', () => {
    const { chosen, written } = choose('4\nnope\n0\n2\n', REMOTES)
    expect(chosen).toBe('upstream')
    expect(written).toBe(
      'Which remote?\n  1) origin\n  2) upstream\n  3) fork\nChoose 1-3: ' +
        "'4' is not one of the choices. Type a number from 1 to 3.\nChoose 1-3: " +
        "'nope' is not one of the choices. Type a number from 1 to 3.\nChoose 1-3: " +
        "'0' is not one of the choices. Type a number from 1 to 3.\nChoose 1-3: ",
    )
  })

  test('an empty line with no default asks again', () => {
    const { chosen, written } = choose('\nfork\n', REMOTES)
    expect(chosen).toBe('fork')
    expect(written.endsWith('Choose 1-3: Type a number from 1 to 3.\nChoose 1-3: ')).toBe(true)
  })

  test('text that matches two choices in another case asks again; the exact text picks', () => {
    expect(choose('MAIN\nMain\n', ['main', 'Main']).chosen).toBe('Main')
    expect(choose('MAIN\nMain\n', ['main', 'Main']).written).toContain("'MAIN' is not one")
  })

  test('a number in range picks by position; out of range, a choice with that text still matches', () => {
    expect(choose('1\n', ['10', '20']).chosen).toBe('10')
    expect(choose('20\n', ['10', '20']).chosen).toBe('20')
    // A number in range is a position even when another choice has that text.
    expect(choose('2\n', ['2', '1']).chosen).toBe('1')
  })

  test('end of input gives the default, or throws with no default', () => {
    expect(choose('', REMOTES, { default: 'origin' }).chosen).toBe('origin')
    expect(choose('nope\n', REMOTES, { default: 'origin' }).chosen).toBe('origin')
    const e = thrown(() => choose('nope\n', REMOTES))
    expect(e).toBeInstanceOf(NotInteractiveError)
    expect(e).toMatchObject({ reason: 'end-of-input' })
  })

  test('choices and the answer echoed back are printed with terminal controls removed', () => {
    const { written } = choose('\x1b]0;x\x07\n1\n', ['a\x1b[31mb'])
    expect(written).not.toContain('\x1b')
    expect(written).toContain('  1) ab\n')
    expect(written).toContain('Choose 1: Type 1.\nChoose 1: ')
  })

  test('a line feed or tab in a choice, the default or the answer shows, and the list keeps one line per choice', () => {
    const choices = ['a\n  2) b', 'c\td']
    const { written } = choose('x\ty\n2\n', choices, { default: 'c\td' })
    expect(written).toBe(
      'Which remote?\n  1) a\\n  2) b\n  2) c\\td\nChoose 1-2 [2]: ' +
        "'x\\ty' is not one of the choices. Type a number from 1 to 2.\nChoose 1-2 [2]: ",
    )
    const asked: string[] = []
    withInput('\n', (fd) =>
      askText('Branch?', { fd, write: (t) => asked.push(t), default: 'ma\nin\tx' }),
    )
    expect(asked).toEqual(['Branch? [ma\\nin\\tx] '])
  })

  test('on input that is not a terminal, a bad answer throws instead of asking again', () => {
    withInput('y\ny\ny\nnext\n', (fd) => {
      const written: string[] = []
      const e = thrown(() =>
        askChoice('Format?', ['text', 'json'], { fd, write: (t) => written.push(t) }),
      )
      expect(e).toBeInstanceOf(Error)
      expect(e).not.toBeInstanceOf(NotInteractiveError)
      expect((e as Error).message).toBe("no answer: 'y' is not one of the choices (text, json)")
      expect(written).toEqual(['Format?\n  1) text\n  2) json\nChoose 1-2: '])
      // Only the first line was read; the rest is left for whatever reads next.
      expect(readLine(fd)).toBe('y')
    })
  })

  test('on input that is not a terminal, an empty line with no default throws and names the flag', () => {
    const e = withInput('\n', (fd) =>
      thrown(() =>
        askChoice('Format?', ['text', 'json'], { fd, write: () => {}, flag: '--format' }),
      ),
    )
    expect((e as Error).message).toBe(
      'no answer: an empty line is not one of the choices (text, json). Pass --format instead.',
    )
  })

  test('on input that is not a terminal, a good answer or an empty line with a default still answers', () => {
    const ask = (input: string, opts: { default?: 'text' | 'json' } = {}) =>
      withInput(input, (fd) =>
        askChoice('Format?', ['text', 'json'], { fd, write: () => {}, ...opts }),
      )
    expect(ask('json\n')).toBe('json')
    expect(ask('\n', { default: 'json' })).toBe('json')
  })

  test.each([
    [[], {}, 'askChoice needs at least one choice'],
    [['a', 'b', 'a'], {}, "askChoice lists 'a' twice"],
    [['a', 'b'], { default: 'c' }, "askChoice's default 'c' is not one of the choices"],
  ])('choices %p with %p are a mistake in the caller', (choices, opts, message) => {
    const written: string[] = []
    expect(() =>
      withInput('1\n', (fd) =>
        askChoice('Pick', choices as string[], { ...onTerminal(fd, written), ...opts }),
      ),
    ).toThrow(message)
    expect(written).toEqual([])
  })

  test('returns the type of the choices it was given', () => {
    const chosen = withInput('1\n', (fd) => askChoice('Pick', ['text', 'json'], onTerminal(fd, [])))
    expectTypeOf(chosen).toEqualTypeOf<'text' | 'json'>()
    expect(chosen).toBe('text')
  })
})

describe('openTty', () => {
  /** A regular file standing in for the terminal device, with `content` to read. */
  function device(content = ''): string {
    const path = join(dir, 'tty')
    writeFileSync(path, content)
    return path
  }

  test('stdin and stderr, when both are terminals', () => {
    const tty = openTty({ isTerminal: () => true, path: join(dir, 'missing') })
    expect(tty).toMatchObject({ fd: 0, source: 'stdio' })
    tty!.close()
    tty!.close()
  })

  test.each([
    ['stdin is not a terminal', (fd: number) => fd === 2],
    ['stderr is not a terminal', (fd: number) => fd === 0],
  ])('otherwise the terminal device, read and written: %s', (_case, stdio) => {
    const path = device('yes\n')
    const tty = openTty({ path, isTerminal: (fd) => fd > 2 || stdio(fd) })
    expect(tty).not.toBeNull()
    try {
      expect(tty!.source).toBe('device')
      expect(tty!.fd).toBeGreaterThan(2)
      expect(readLine(tty!.fd)).toBe('yes')
      tty!.write('Go? ')
      expect(readFileSync(path, 'utf8')).toBe('yes\nGo? ')
    } finally {
      tty!.close()
    }
    // Closing twice is safe: the second does nothing.
    tty!.close()
  })

  test('a prompt reads its answer from the device it opened', () => {
    // A regular file has one offset for reading and writing, so the question
    // is collected here; the case above shows `write` reaches the device.
    const tty = openTty({ path: device('2\n'), isTerminal: (fd) => fd > 2 })!
    const written: string[] = []
    try {
      const chosen = askChoice('Pick', ['a', 'b'], {
        ...onTerminal(tty.fd, written),
        required: true,
      })
      expect(chosen).toBe('b')
    } finally {
      tty.close()
    }
    expect(written).toEqual(['Pick\n  1) a\n  2) b\nChoose 1-2: '])
  })

  test('null when there is no device', () => {
    expect(openTty({ path: join(dir, 'missing'), isTerminal: () => false })).toBeNull()
  })

  test('null when what opened is not a terminal', () => {
    expect(openTty({ path: device(), isTerminal: () => false })).toBeNull()
  })
})

describe('requireInteractive', () => {
  test('returns the terminal openTty finds', () => {
    const tty = requireInteractive({ isTerminal: () => true })
    expect(tty.source).toBe('stdio')
  })

  test('throws a no-terminal error naming the flag when there is none', () => {
    const e = thrown(() =>
      requireInteractive({ path: join(dir, 'missing'), isTerminal: () => false, flag: '--yes' }),
    )
    expect(e).toBeInstanceOf(NotInteractiveError)
    expect(e).toMatchObject({ reason: 'no-terminal', flag: '--yes', exit: 2 })
  })
})
