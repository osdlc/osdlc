import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { customAdapter } from '../src/adapters/custom.js'
import { adapterFor, BUILTIN_AGENTS, detectAgents, probeVersion } from '../src/registry.js'

describe('adapterFor', () => {
  test('returns the adapter named, with its default binary', () => {
    const binaries = {
      claude: 'claude',
      codex: 'codex',
      antigravity: 'agy',
      opencode: 'opencode',
      copilot: 'copilot',
      pi: 'pi',
      qwen: 'qwen',
      droid: 'droid',
      cursor: 'agent',
      deepseek: 'dsh',
    }
    for (const name of BUILTIN_AGENTS) {
      const adapter = adapterFor(name)
      expect(adapter.name).toBe(name)
      expect(adapter.binary).toBe(binaries[name])
    }
  })

  test('a binary option replaces the default for every built-in', () => {
    for (const name of BUILTIN_AGENTS) {
      const adapter = adapterFor(name, { binary: '/opt/x/agent' })
      expect(adapter.binary).toBe('/opt/x/agent')
      expect(adapter.plan({ prompt: 'hi' }).argv[0]).toBe('/opt/x/agent')
    }
  })
})

describe('command option', () => {
  test('a command prefix starts the argv for every built-in, and binary is its first element', () => {
    for (const name of BUILTIN_AGENTS) {
      const adapter = adapterFor(name, { command: ['npx', '-y', 'some-cli'] })
      expect(adapter.binary).toBe('npx')
      expect(adapter.command).toEqual(['npx', '-y', 'some-cli'])
      const argv = adapter.plan({ prompt: 'hi' }).argv
      expect(argv.slice(0, 3)).toEqual(['npx', '-y', 'some-cli'])
      // The adapter's own argv follows the prefix unchanged.
      expect(argv.slice(3)).toEqual(adapterFor(name).plan({ prompt: 'hi' }).argv.slice(1))
    }
  })

  test('command wins over binary; an empty command is ignored', () => {
    for (const name of BUILTIN_AGENTS) {
      expect(adapterFor(name, { binary: '/x', command: ['/y', '--flag'] }).binary).toBe('/y')
      const empty = adapterFor(name, { binary: '/x', command: [] })
      expect(empty.binary).toBe('/x')
      expect(empty.command).toEqual(['/x'])
    }
  })

  test('the stored command is a frozen copy', () => {
    const command = ['codex', '--profile', 'work']
    const adapter = adapterFor('codex', { command })
    command[1] = '--changed'
    expect(adapter.command).toEqual(['codex', '--profile', 'work'])
    expect(Object.isFrozen(adapter.command)).toBe(true)
  })
})

describe('BUILTIN_AGENTS', () => {
  test('lists the built-in agents in a fixed order', () => {
    expect([...BUILTIN_AGENTS]).toEqual([
      'claude',
      'codex',
      'antigravity',
      'opencode',
      'copilot',
      'pi',
      'qwen',
      'droid',
      'cursor',
      'deepseek',
    ])
  })

  test('is frozen at run time', () => {
    expect(Object.isFrozen(BUILTIN_AGENTS)).toBe(true)
    expect(() => (BUILTIN_AGENTS as unknown as string[]).push('x')).toThrow(TypeError)
    expect(() => {
      ;(BUILTIN_AGENTS as unknown as string[])[0] = 'x'
    }).toThrow(TypeError)
    expect(BUILTIN_AGENTS).toHaveLength(10)
  })

  test('every name has an adapter', () => {
    for (const name of BUILTIN_AGENTS) expect(adapterFor(name).name).toBe(name)
  })
})

describe('detectAgents', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-call-detect-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  /** A fake agent CLI: a shell script that prints a version, or fails. */
  function fakeCli(name: string, body: string): string {
    const path = join(dir, name)
    writeFileSync(path, `#!/bin/sh\n${body}\n`)
    chmodSync(path, 0o755)
    return path
  }

  test('reports the first line of --version for an installed CLI', async () => {
    const binary = fakeCli('good', 'echo "fake 1.2.3"; echo "second line"')
    const [result] = await detectAgents([customAdapter({ name: 'good', binary, args: () => [] })])
    expect(result).toEqual({
      name: 'good',
      available: true,
      version: 'fake 1.2.3',
      command: [binary],
    })
  })

  test('a binary that is not installed is unavailable', async () => {
    const [result] = await detectAgents([
      customAdapter({ name: 'ghost', binary: join(dir, 'missing'), args: () => [] }),
    ])
    expect(result).toEqual({ name: 'ghost', available: false, version: undefined })
  })

  test('a nonzero exit from --version is unavailable', async () => {
    const binary = fakeCli('bad', 'echo "broken"; exit 3')
    const [result] = await detectAgents([customAdapter({ name: 'bad', binary, args: () => [] })])
    expect(result?.available).toBe(false)
    expect(result?.version).toBeUndefined()
  })

  test('a probe still running at the timeout is unavailable', async () => {
    const binary = fakeCli('forking', '(sleep 5) &\necho "fork 1.0"')
    expect(await probeVersion([binary], 300)).toBeUndefined()
  })

  test('a command prefix is probed whole, with --version appended', async () => {
    const binary = fakeCli('wrapped', 'echo "args: $*"')
    const [result] = await detectAgents([
      adapterFor('codex', { command: [binary, '--profile', 'work'] }),
    ])
    expect(result).toEqual({
      name: 'codex',
      available: true,
      version: 'args: --profile work --version',
      command: [binary, '--profile', 'work'],
    })
  })

  test('probes every adapter given, in order', async () => {
    const one = fakeCli('one', 'echo one')
    const results = await detectAgents([
      customAdapter({ name: 'a', binary: one, args: () => [] }),
      customAdapter({ name: 'b', binary: join(dir, 'nope'), args: () => [] }),
    ])
    expect(results.map((r) => [r.name, r.available])).toEqual([
      ['a', true],
      ['b', false],
    ])
  })

  test('with no argument it probes the built-in binaries on PATH', async () => {
    // Fake CLIs on a private PATH: `claude`, `agy` and `dsh` exist, the others do not.
    const bin = mkdtempSync(join(dir, 'bin-'))
    for (const name of ['claude', 'agy', 'dsh']) {
      const path = join(bin, name)
      writeFileSync(path, `#!/bin/sh\necho "${name} 9.9"\n`)
      chmodSync(path, 0o755)
    }
    const original = process.env['PATH']
    process.env['PATH'] = bin
    try {
      const results = await detectAgents()
      expect(results).toEqual([
        { name: 'claude', available: true, version: 'claude 9.9', command: ['claude'] },
        { name: 'codex', available: false, version: undefined },
        { name: 'antigravity', available: true, version: 'agy 9.9', command: ['agy'] },
        { name: 'opencode', available: false, version: undefined },
        { name: 'copilot', available: false, version: undefined },
        { name: 'pi', available: false, version: undefined },
        { name: 'qwen', available: false, version: undefined },
        { name: 'droid', available: false, version: undefined },
        { name: 'cursor', available: false, version: undefined },
        { name: 'deepseek', available: true, version: 'dsh 9.9', command: ['dsh'] },
      ])
    } finally {
      process.env['PATH'] = original
    }
  })

  describe('cursor, whose default binary agent is a generic name', () => {
    /** Runs `detectAgents` with only the given fake CLIs, each printing its version, on PATH. */
    async function detectWith(clis: Record<string, string>, adapters = [adapterFor('cursor')]) {
      const bin = mkdtempSync(join(dir, 'cursor-bin-'))
      for (const [name, version] of Object.entries(clis)) {
        const path = join(bin, name)
        writeFileSync(path, `#!/bin/sh\necho "${version}"\n`)
        chmodSync(path, 0o755)
      }
      const original = process.env['PATH']
      process.env['PATH'] = bin
      try {
        return await detectAgents(adapters)
      } finally {
        process.env['PATH'] = original
      }
    }

    test('agent with a date-stamped version is the Cursor CLI', async () => {
      const [result] = await detectWith({
        agent: '2026.10.14-0f9edde',
        'cursor-agent': '2026.10.14-0f9edde',
      })
      expect(result).toEqual({
        name: 'cursor',
        available: true,
        version: '2026.10.14-0f9edde',
        command: ['agent'],
      })
    })

    test('agent with any other version is some other program; cursor-agent stands in', async () => {
      const [result] = await detectWith({ agent: 'agent 1.2.3', 'cursor-agent': '2026.10.01-abc' })
      expect(result).toEqual({
        name: 'cursor',
        available: true,
        version: '2026.10.01-abc',
        command: ['cursor-agent'],
      })
      expect(Object.isFrozen(result?.command)).toBe(true)
    })

    test('cursor-agent stands in when agent is missing', async () => {
      const [result] = await detectWith({ 'cursor-agent': '2026.10.01-abc' })
      expect(result?.command).toEqual(['cursor-agent'])
    })

    test('an agent that is not Cursor, and no cursor-agent, is unavailable', async () => {
      const [result] = await detectWith({ agent: 'agent 1.2.3' })
      expect(result).toEqual({ name: 'cursor', available: false, version: undefined })
    })

    test('a cursor adapter given its own binary or command is probed as given', async () => {
      const results = await detectWith({ agent: 'agent 1.2.3', 'cursor-agent': '2026.10.01-abc' }, [
        adapterFor('cursor', { binary: 'agent', command: ['agent', '--flag'] }),
        adapterFor('cursor', { binary: join(dir, 'missing-agent') }),
      ])
      expect(results.map((r) => [r.available, r.version])).toEqual([
        [true, 'agent 1.2.3'],
        [false, undefined],
      ])
    })

    test('only an adapter named cursor gets the check', async () => {
      const [result] = await detectWith({ agent: 'agent 1.2.3' }, [
        customAdapter({ name: 'other', binary: 'agent', args: () => [] }),
      ])
      expect(result).toMatchObject({ available: true, version: 'agent 1.2.3' })
    })
  })
})

describe('customAdapter command option', () => {
  test('a command prefix starts the argv, and binary is its first element', () => {
    const adapter = customAdapter({
      name: 'tool',
      command: ['npx', '-y', 'tool-cli'],
      args: (_spec, prompt) => ['--message', prompt],
    })
    expect(adapter.binary).toBe('npx')
    expect(adapter.command).toEqual(['npx', '-y', 'tool-cli'])
    expect(adapter.plan({ prompt: 'hi', extraArgs: ['--x'] }).argv).toEqual([
      'npx',
      '-y',
      'tool-cli',
      '--message',
      'hi',
      '--x',
    ])
  })

  test('command wins over binary; an empty command is ignored', () => {
    const args = () => ['a']
    expect(customAdapter({ name: 't', binary: '/x', command: ['/y'], args }).binary).toBe('/y')
    const empty = customAdapter({ name: 't', binary: '/x', command: [], args })
    expect(empty.command).toEqual(['/x'])
    expect(empty.plan({ prompt: 'p' }).argv).toEqual(['/x', 'a'])
  })

  test('the stored command is a frozen copy', () => {
    const command = ['tool', '--profile', 'work']
    const adapter = customAdapter({ name: 'tool', command, args: () => [] })
    command[1] = '--changed'
    expect(adapter.command).toEqual(['tool', '--profile', 'work'])
    expect(Object.isFrozen(adapter.command)).toBe(true)
  })

  test('with neither, the binary is the name', () => {
    const adapter = customAdapter({ name: 'goose', args: () => [] })
    expect(adapter.binary).toBe('goose')
    expect(adapter.command).toEqual(['goose'])
  })

  test('detectAgents probes the whole command', async () => {
    const command = ['/bin/sh', '-c', 'echo "probe $1"', 'sh']
    const [result] = await detectAgents([customAdapter({ name: 'sh', command, args: () => [] })])
    expect(result).toEqual({ name: 'sh', available: true, version: 'probe --version', command })
  })
})
