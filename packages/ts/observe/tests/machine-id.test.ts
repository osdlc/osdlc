/**
 * The stable machine id: one derivation per platform branch over a fake probe,
 * the hostname fallback, and the live probe (darwin only).
 */

import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { spawnRunner } from '@osdlc/command-seam'

import { describe, expect, test } from 'vitest'

import {
  deriveMachineId,
  isThisMachine,
  machineId,
  machineIdCachePath,
  resolveMachineId,
  type MachineProbe,
} from '../src/machine.ts'

const derived = (uuid: string) =>
  `m-${createHash('sha256').update(`sdlc-machine:${uuid}`).digest('hex').slice(0, 16)}`

function probe(over: Partial<MachineProbe>): MachineProbe {
  return {
    platform: 'freebsd',
    readFile: () => null,
    run: () => null,
    hostname: () => 'laptop.local',
    ...over,
  }
}

describe('deriveMachineId', () => {
  test('darwin reads IOPlatformUUID from ioreg', () => {
    const calls: string[][] = []
    const id = deriveMachineId(
      probe({
        platform: 'darwin',
        run: (argv) => {
          calls.push(argv)
          return '+-o Root\n    {\n      "IOPlatformUUID" = "AAAA-BBBB"\n    }\n'
        },
      }),
    )
    expect(id).toBe(derived('AAAA-BBBB'))
    expect(calls).toEqual([['ioreg', '-rd1', '-c', 'IOPlatformExpertDevice']])
  })

  test('linux reads /etc/machine-id, else the dbus copy', () => {
    const files: Record<string, string> = { '/etc/machine-id': 'abc123\n' }
    expect(deriveMachineId(probe({ platform: 'linux', readFile: (p) => files[p] ?? null }))).toBe(
      derived('abc123'),
    )
    const dbus: Record<string, string> = { '/var/lib/dbus/machine-id': 'dbus1\n' }
    expect(deriveMachineId(probe({ platform: 'linux', readFile: (p) => dbus[p] ?? null }))).toBe(
      derived('dbus1'),
    )
  })

  test('win32 reads MachineGuid from reg query', () => {
    const out =
      '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    guid-1\r\n'
    expect(deriveMachineId(probe({ platform: 'win32', run: () => out }))).toBe(derived('guid-1'))
  })

  test('falls back to a hash of the hostname when the uuid cannot be read', () => {
    const hashed = `m-${createHash('sha256').update('sdlc-machine-host:laptop.local').digest('hex').slice(0, 16)}`
    expect(deriveMachineId(probe({ platform: 'darwin' }))).toBe(hashed)
    expect(deriveMachineId(probe({ platform: 'linux', readFile: () => '  \n' }))).toBe(hashed)
    expect(deriveMachineId(probe({ platform: 'win32', run: () => 'garbage' }))).toBe(hashed)
    expect(deriveMachineId(probe({ platform: 'freebsd' }))).toBe(hashed)
    expect(hashed).not.toContain('laptop')
  })

  test('the id does not change with the hostname and never carries the uuid', () => {
    const base = { platform: 'linux', readFile: () => 'uuid-x' }
    const a = deriveMachineId(probe({ ...base, hostname: () => 'one' }))
    const b = deriveMachineId(probe({ ...base, hostname: () => 'two' }))
    expect(a).toBe(b)
    expect(a).toMatch(/^m-[0-9a-f]{16}$/)
    expect(a).not.toContain('uuid-x')
  })
})

describe('resolveMachineId', () => {
  test('probes once, then reads the cache file instead', () => {
    const dir = mkdtempSync(join(tmpdir(), 'machine-id-'))
    try {
      const path = join(dir, 'sub', 'machine-id')
      let probes = 0
      const counting = probe({
        platform: 'linux',
        readFile: () => {
          probes++
          return 'uuid-y'
        },
      })
      const first = resolveMachineId(counting, path)
      expect(first).toBe(derived('uuid-y'))
      expect(readFileSync(path, 'utf8').trim().split(' ')[0]).toBe(first)
      expect(resolveMachineId(counting, path)).toBe(first)
      expect(probes).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('ignores a malformed cache file and derives again', () => {
    const dir = mkdtempSync(join(tmpdir(), 'machine-id-'))
    try {
      const path = join(dir, 'machine-id')
      writeFileSync(path, 'my-raw-hostname\n')
      const id = resolveMachineId(probe({ platform: 'linux', readFile: () => 'uuid-z' }), path)
      expect(id).toBe(derived('uuid-z'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("a cache written on another host is not this host's id: it derives again", () => {
    // Two machines sharing one home directory, so one cache file.
    const dir = mkdtempSync(join(tmpdir(), 'machine-id-'))
    try {
      const path = join(dir, 'machine-id')
      const hostA = probe({ platform: 'linux', readFile: () => 'uuid-a', hostname: () => 'a' })
      const hostB = probe({ platform: 'linux', readFile: () => 'uuid-b', hostname: () => 'b' })
      expect(resolveMachineId(hostA, path)).toBe(derived('uuid-a'))
      expect(resolveMachineId(hostB, path)).toBe(derived('uuid-b'))
      expect(resolveMachineId(hostA, path)).toBe(derived('uuid-a'))
      // The file names neither host.
      expect(readFileSync(path, 'utf8')).not.toMatch(/\b[ab]\b/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an id-only cache from before the host key is derived again', () => {
    const dir = mkdtempSync(join(tmpdir(), 'machine-id-'))
    try {
      const path = join(dir, 'machine-id')
      writeFileSync(path, `${derived('someone-else')}\n`)
      const id = resolveMachineId(probe({ platform: 'linux', readFile: () => 'uuid-w' }), path)
      expect(id).toBe(derived('uuid-w'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('works with no cache path', () => {
    expect(resolveMachineId(probe({ platform: 'linux', readFile: () => 'u' }), null)).toBe(
      derived('u'),
    )
  })
})

describe('machineIdCachePath', () => {
  const home = () => '/home/dev'
  const noHome = () => {
    throw new Error('no home')
  }

  test('is sdlc/machine-id under an absolute XDG_CACHE_HOME, else ~/.cache', () => {
    expect(machineIdCachePath({ XDG_CACHE_HOME: '/xdg/cache' }, home)).toBe(
      join('/xdg/cache', 'sdlc', 'machine-id'),
    )
    expect(machineIdCachePath({}, home)).toBe(join('/home/dev', '.cache', 'sdlc', 'machine-id'))
  })

  test('ignores a relative XDG_CACHE_HOME, so the cache never lands under the cwd', () => {
    // Regression: the value was once used verbatim, so `.cache` wrote the id
    // into whatever directory the process ran in, which can be a repository.
    for (const value of ['.cache', 'cache/x', './c', '~/.cache']) {
      expect(machineIdCachePath({ XDG_CACHE_HOME: value }, home)).toBe(
        join('/home/dev', '.cache', 'sdlc', 'machine-id'),
      )
    }
  })

  test('with no home, only an absolute XDG_CACHE_HOME gives a cache', () => {
    expect(machineIdCachePath({ XDG_CACHE_HOME: '/xdg/cache' }, noHome)).toBe(
      join('/xdg/cache', 'sdlc', 'machine-id'),
    )
    expect(machineIdCachePath({}, noHome)).toBeNull()
    expect(machineIdCachePath({ XDG_CACHE_HOME: '.cache' }, noHome)).toBeNull()
  })
})

describe('machineId (live)', () => {
  test.skipIf(process.platform !== 'darwin')('resolves once to a derived id', () => {
    expect(machineId()).toMatch(/^m-[0-9a-f]{16}$/)
    expect(machineId()).toBe(machineId())
  })
})

describe('machineId (inherited)', () => {
  // A fresh process, since machineId() resolves once per process. Node runs the
  // TypeScript source by stripping types.
  const runtimeFlags = ['--experimental-strip-types', '--no-warnings']
  const inherited = (env: Record<string, string>): string =>
    spawnRunner(process.execPath)
      .run(
        [
          ...runtimeFlags,
          '-e',
          "import('./src/machine.ts').then((m) => console.log(m.machineId()))",
        ],
        {
          cwd: join(import.meta.dirname, '..'),
          // Unset whatever this process inherited, so only the given tags reach the child.
          env: { OBSERVE_MACHINE_ID: undefined, SDLC_MACHINE_ID: undefined, ...env },
          timeoutMs: 20000,
        },
      )
      .stdout.trim()

  test('a process launched with OBSERVE_MACHINE_ID reads it without probing the platform', () => {
    expect(inherited({ OBSERVE_MACHINE_ID: 'm-inherited' })).toBe('m-inherited')
  })

  test('the legacy SDLC_MACHINE_ID is read too, and wins when the two differ', () => {
    expect(inherited({ SDLC_MACHINE_ID: 'm-legacy' })).toBe('m-legacy')
    expect(inherited({ OBSERVE_MACHINE_ID: 'm-new', SDLC_MACHINE_ID: 'm-old' })).toBe('m-old')
  })
})

describe('isThisMachine', () => {
  test('compares the record with the given machine id, else this machine', () => {
    expect(isThisMachine({ machine: 'm-a' }, 'm-a')).toBe(true)
    expect(isThisMachine({ machine: 'm-a' }, 'm-b')).toBe(false)
    expect(isThisMachine({ machine: machineId() })).toBe(true)
  })
})
