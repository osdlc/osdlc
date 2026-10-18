import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { customAdapter } from '../src/adapters/custom.js'
import { adapterFor, BUILTIN_AGENTS, detectAgents, probeVersion } from '../src/registry.js'

describe('adapterFor', () => {
  test('returns the adapter named, with its default binary', () => {
    const binaries = { claude: 'claude', codex: 'codex', antigravity: 'agy', opencode: 'opencode' }
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

describe('BUILTIN_AGENTS', () => {
  test('lists the four built-in agents in a fixed order', () => {
    expect([...BUILTIN_AGENTS]).toEqual(['claude', 'codex', 'antigravity', 'opencode'])
  })

  test('is frozen at run time', () => {
    expect(Object.isFrozen(BUILTIN_AGENTS)).toBe(true)
    expect(() => (BUILTIN_AGENTS as unknown as string[]).push('x')).toThrow(TypeError)
    expect(() => {
      ;(BUILTIN_AGENTS as unknown as string[])[0] = 'x'
    }).toThrow(TypeError)
    expect(BUILTIN_AGENTS).toHaveLength(4)
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
    expect(result).toEqual({ name: 'good', available: true, version: 'fake 1.2.3' })
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
    expect(await probeVersion(binary, 300)).toBeUndefined()
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
    // Fake CLIs on a private PATH: `claude` and `agy` exist, `codex` and `opencode` do not.
    const bin = mkdtempSync(join(dir, 'bin-'))
    for (const name of ['claude', 'agy']) {
      const path = join(bin, name)
      writeFileSync(path, `#!/bin/sh\necho "${name} 9.9"\n`)
      chmodSync(path, 0o755)
    }
    const original = process.env['PATH']
    process.env['PATH'] = bin
    try {
      const results = await detectAgents()
      expect(results).toEqual([
        { name: 'claude', available: true, version: 'claude 9.9' },
        { name: 'codex', available: false, version: undefined },
        { name: 'antigravity', available: true, version: 'agy 9.9' },
        { name: 'opencode', available: false, version: undefined },
      ])
    } finally {
      process.env['PATH'] = original
    }
  })
})
