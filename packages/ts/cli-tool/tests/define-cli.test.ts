/**
 * The substrate's own behaviour, which is mostly about what commander is NOT
 * allowed to do: exit the process, write to a real stream, or print an error
 * the caller has not decided how to present.
 */

import { describe, expect, test } from 'vitest'

import { captureIo, defineCli, isDomainExit, DOMAIN_EXIT_MAX, DOMAIN_EXIT_MIN } from '../index.ts'

const cli = defineCli({
  name: 'sweep',
  summary: 'A fixture command.',
  flags: {
    all: { kind: 'boolean', help: 'everything' },
    gh: { kind: 'boolean', negatable: true, help: 'use GitHub evidence' },
    config: { kind: 'string', valueName: 'path', help: 'config file' },
    remote: { kind: 'string', default: 'origin', help: 'remote name' },
    output: { kind: 'enum', choices: ['text', 'json'], default: 'text', help: 'format' },
    scope: { kind: 'list', valueName: 'list', default: [], help: 'what to sweep' },
    verbose: { kind: 'count', short: 'v', help: 'say more' },
  },
  positionals: [{ name: 'path', variadic: true, help: 'a checkout' }],
})

const parse = (...argv: string[]) => cli.parse(argv, captureIo())

describe('defineCli', () => {
  test('defaults come back without the flag being given', () => {
    const result = parse()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.values).toMatchObject({
      all: false,
      gh: true,
      remote: 'origin',
      output: 'text',
      scope: [],
      verbose: 0,
    })
    expect(result.values.config).toBeUndefined()
    expect(result.positionals).toEqual([])
  })

  test('--flag value and --flag=value are the same thing', () => {
    const spaced = parse('--config', '/tmp/a.yaml')
    const equals = parse('--config=/tmp/a.yaml')
    expect(spaced.status === 'ok' && spaced.values.config).toBe('/tmp/a.yaml')
    expect(equals.status === 'ok' && equals.values.config).toBe('/tmp/a.yaml')
  })

  test('a negatable boolean starts true and --no- turns it off', () => {
    const on = parse()
    expect(on.status === 'ok' && on.values.gh).toBe(true)
    const off = parse('--no-gh')
    expect(off.status === 'ok' && off.values.gh).toBe(false)
  })

  test('a list splits on commas and accumulates across occurrences', () => {
    const result = parse('--scope', 'worktrees,local-branches', '--scope', 'remote-branches')
    expect(result.status === 'ok' && result.values.scope).toEqual([
      'worktrees',
      'local-branches',
      'remote-branches',
    ])
  })

  test('a list with no default is absent rather than empty', () => {
    const loose = defineCli({
      name: 'loose',
      summary: 'x',
      flags: { only: { kind: 'list', help: 'restrict' } },
    })
    const none = loose.parse([], captureIo())
    expect(none.status === 'ok' && none.values.only).toBeUndefined()
    const some = loose.parse(['--only', 'a,b'], captureIo())
    expect(some.status === 'ok' && some.values.only).toEqual(['a', 'b'])
  })

  test('a count flag counts', () => {
    const result = parse('-v', '-v', '-v')
    expect(result.status === 'ok' && result.values.verbose).toBe(3)
  })

  test('positionals come back separately from flags', () => {
    const result = parse('--all', '/one', '/two')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.values.all).toBe(true)
    expect(result.positionals).toEqual(['/one', '/two'])
  })
})

describe('errors are values, not exits', () => {
  test('an unknown flag comes back as an error and prints nothing itself', () => {
    const io = captureIo()
    const result = cli.parse(['--nonsense'], io)
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toContain('--nonsense')
    // Commander's own error output is suppressed: the caller decides the wording.
    expect(io.err).toBe('')
    expect(io.out).toBe('')
  })

  test('a value the enum does not allow is an error', () => {
    const result = parse('--output', 'yaml')
    expect(result.status).toBe('error')
    if (result.status !== 'error') return
    expect(result.message).toContain('yaml')
  })

  test('a flag missing its value is an error', () => {
    const result = parse('--config')
    expect(result.status).toBe('error')
  })

  test('a mandatory flag left out is an error', () => {
    const strict = defineCli({
      name: 'strict',
      summary: 'needs one',
      flags: { token: { kind: 'string', required: true, help: 'the token' } },
    })
    expect(strict.parse([], captureIo()).status).toBe('error')
    const given = strict.parse(['--token', 'abc'], captureIo())
    expect(given.status === 'ok' && given.values.token).toBe('abc')
    // `required` narrows the type too: no `?? fallback` at the call site.
    if (given.status === 'ok') {
      const token: string = given.values.token
      expect(token).toBe('abc')
    }
  })

  test('a mandatory enum left out is an error, and a bad choice too', () => {
    const strict = defineCli({
      name: 'strict',
      summary: 'needs a verdict',
      flags: {
        mode: { kind: 'enum', choices: ['pass', 'fail'] as const, required: true, help: 'verdict' },
      },
    })
    expect(strict.parse([], captureIo()).status).toBe('error')
    expect(strict.parse(['--mode', 'maybe'], captureIo()).status).toBe('error')
    const given = strict.parse(['--mode', 'fail'], captureIo())
    expect(given.status === 'ok' && given.values.mode).toBe('fail')
    if (given.status === 'ok') {
      const mode: 'pass' | 'fail' = given.values.mode
      expect(mode).toBe('fail')
    }
  })

  test('a list default is a fallback, not a seed the command line appends to', () => {
    const listy = defineCli({
      name: 'listy',
      summary: 'takes a list',
      flags: { only: { kind: 'list', default: ['a', 'b'], help: 'restrict to these' } },
    })
    const unmentioned = listy.parse([], captureIo())
    expect(unmentioned.status === 'ok' && unmentioned.values.only).toEqual(['a', 'b'])
    // Commander hands a custom argParser the option's CURRENT value as
    // `previous`, so a default declared on the Option arrives on the first
    // occurrence and used to be concatenated onto.
    const given = listy.parse(['--only', 'z'], captureIo())
    expect(given.status === 'ok' && given.values.only).toEqual(['z'])
    const twice = listy.parse(['--only', 'z', '--only', 'y'], captureIo())
    expect(twice.status === 'ok' && twice.values.only).toEqual(['z', 'y'])
  })

  test('a flag name whose long form reads as a negation is refused', () => {
    const bad = defineCli({
      name: 'bad',
      summary: 'declares --no-cache the wrong way',
      flags: { noCache: { kind: 'boolean', help: 'skip the cache' } },
    })
    // Commander would file the value under `cache` and leave `noCache` at its
    // default forever, so the declaration is rejected rather than silently
    // parsed under a different key.
    expect(() => bad.parse([], captureIo())).toThrow(/reads as a negation/)
  })

  test('an undefaulted list is absent, not empty, when unmentioned', () => {
    const listy = defineCli({
      name: 'listy',
      summary: 'takes a list',
      flags: {
        only: { kind: 'list', help: 'restrict to these' },
        skip: { kind: 'list', default: [], help: 'skip these' },
      },
    })
    const result = listy.parse([], captureIo())
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    // The distinction a config layer underneath needs: "not mentioned" is not
    // "mentioned as empty".
    expect(result.values.only).toBeUndefined()
    expect(result.values.skip).toEqual([])
  })
})

describe('help', () => {
  test('--help writes to the injected io, not to process.stdout', () => {
    const io = captureIo()
    const result = cli.parse(['--help'], io)
    expect(result.status).toBe('help')
    expect(io.out).toContain('--no-gh')
    expect(io.out).toContain('A fixture command.')
    expect(io.err).toBe('')
  })

  test('the short tier drops an epilogue the declaration did not shorten', () => {
    const tiered = defineCli({
      name: 'tiered',
      summary: 'two tiers',
      flags: {},
      epilogue: 'THE LONG EPILOGUE',
    })
    expect(tiered.help({ all: true })).toContain('THE LONG EPILOGUE')
    expect(tiered.help({ all: false })).not.toContain('THE LONG EPILOGUE')

    const shortened = defineCli({
      name: 'shortened',
      summary: 'two tiers',
      flags: {},
      epilogue: 'THE LONG EPILOGUE',
      shortEpilogue: 'THE SHORT ONE',
    })
    expect(shortened.help({ all: false })).toContain('THE SHORT ONE')
    expect(shortened.help({ all: false })).not.toContain('THE LONG EPILOGUE')
  })

  test('help() renders the same declaration without emitting anything', () => {
    const text = cli.help()
    for (const flag of ['--all', '--no-gh', '--config', '--output', '--scope', '-v']) {
      expect(text).toContain(flag)
    }
  })

  test('the epilogue is appended', () => {
    const withNote = defineCli({
      name: 'noted',
      summary: 'x',
      flags: {},
      epilogue: 'config: /etc/noted.yaml',
    })
    expect(withNote.help()).toContain('config: /etc/noted.yaml')
  })

  test('parsing twice does not leak the first run into the second', () => {
    const first = parse('--all', '/one')
    const second = parse('/two')
    expect(first.status === 'ok' && first.values.all).toBe(true)
    expect(second.status === 'ok' && second.values.all).toBe(false)
    expect(second.status === 'ok' && second.positionals).toEqual(['/two'])
  })
})

describe('exit codes', () => {
  test('the domain band is 10 to 63', () => {
    expect(isDomainExit(DOMAIN_EXIT_MIN)).toBe(true)
    expect(isDomainExit(DOMAIN_EXIT_MAX)).toBe(true)
    for (const outside of [0, 1, 9, 64, 126, 130, 1.5]) {
      expect(isDomainExit(outside)).toBe(false)
    }
  })
})

describe('tristate', () => {
  const tri = defineCli({
    name: 'probe',
    summary: 'a fixture',
    flags: {
      exec: { kind: 'tristate', help: 'allow subprocesses', offHelp: 'forbid them' },
    },
  })
  const run = (...argv: string[]) => tri.parse(argv, captureIo())

  test('absent is undefined, so a config layer underneath can still answer', () => {
    const result = run()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.values.exec).toBeUndefined()
  })

  test('the affirmative and the negative are both reachable', () => {
    const on = run('--exec')
    const off = run('--no-exec')
    expect(on.status === 'ok' && on.values.exec).toBe(true)
    expect(off.status === 'ok' && off.values.exec).toBe(false)
  })

  test('both forms are documented, each with its own wording', () => {
    const text = tri.help()
    expect(text).toContain('--exec')
    expect(text).toContain('--no-exec')
    expect(text).toContain('allow subprocesses')
    expect(text).toContain('forbid them')
  })
})

describe('excess arguments', () => {
  test('an argument the tool never declared is a usage error', () => {
    const one = defineCli({
      name: 'one',
      summary: 'takes a single path',
      flags: {},
      positionals: [{ name: 'path' }],
    })
    expect(one.parse(['/a'], captureIo()).status).toBe('ok')
    const excess = one.parse(['/a', '/b'], captureIo())
    expect(excess.status).toBe('error')
    if (excess.status !== 'error') return
    expect(excess.message).toContain('too many')
  })

  test("commander's own `error: ` prefix is stripped, so a caller adds one prefix", () => {
    const bare = defineCli({ name: 'bare', summary: 'x', flags: {} })
    const result = bare.parse(['--nope'], captureIo())
    expect(result.status === 'error' && result.message).toBe("unknown option '--nope'")
  })
})

describe('two help tiers from one declaration', () => {
  const tiered = defineCli({
    name: 'tiered',
    summary: 'x',
    flags: {
      common: { kind: 'boolean', help: 'everyday' },
      obscure: { kind: 'boolean', hidden: true, help: 'rarely wanted' },
    },
    epilogue: 'the long notes',
    shortEpilogue: 'pass --help --all for everything',
  })

  test('the short tier omits hidden flags and uses the short epilogue', () => {
    const short = tiered.help({ all: false })
    expect(short).toContain('--common')
    expect(short).not.toContain('--obscure')
    expect(short).toContain('pass --help --all for everything')
    expect(short).not.toContain('the long notes')
  })

  test('the complete tier shows everything', () => {
    const full = tiered.help()
    expect(full).toContain('--common')
    expect(full).toContain('--obscure')
    expect(full).toContain('the long notes')
  })

  test('a hidden flag is still parsed — hidden is about help, not acceptance', () => {
    const result = tiered.parse(['--obscure'], captureIo())
    expect(result.status === 'ok' && result.values.obscure).toBe(true)
  })
})

describe('help text stays readable', () => {
  test('a boolean does not carry a "(default: false)" annotation', () => {
    // Commander prints the default after the help when one is declared, which
    // on a present-or-absent flag is noise on every line.
    const text = cli.help()
    expect(text).not.toContain('(default: false)')
    expect(text).not.toContain('(default: 0)')
    // A value flag's default is genuinely useful and stays.
    expect(text).toContain('(default: "origin")')
  })
})
