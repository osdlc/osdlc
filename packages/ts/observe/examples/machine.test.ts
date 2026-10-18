/**
 * The machine a line or record came from, and who started the work there.
 */

import { describe, expect, test } from 'vitest'

import {
  deriveMachineId,
  isThisMachine,
  MACHINE_ENV_VAR,
  machineId,
  resolveOriginator,
  type MachineProbe,
  type Originator,
  type OriginatorProbe,
} from '@osdlc/observe'

describe('the machine id', () => {
  test('is derived from the platform machine UUID, never the hostname', () => {
    const linux: MachineProbe = {
      platform: 'linux',
      readFile: (path) =>
        path === '/etc/machine-id' ? '4c4c4544004b4e10804eb7c04f304b32\n' : null,
      run: () => null,
      hostname: () => 'laptop.local',
    }

    const id = deriveMachineId(linux)

    expect(id).toMatch(/^m-[0-9a-f]{16}$/)
    expect(deriveMachineId({ ...linux, hostname: () => 'renamed.local' })).toBe(id)
  })

  test("this machine's id, and whether a record is this machine's", () => {
    const here = machineId()

    expect(isThisMachine({ machine: here })).toBe(true)
    expect(isThisMachine({ machine: 'm-0000000000000000' }, here)).toBe(false)
  })

  test('a child process inherits the id instead of probing again', () => {
    const childEnv = { [MACHINE_ENV_VAR]: machineId() }

    expect(Object.keys(childEnv)).toEqual(['OBSERVE_MACHINE_ID'])
  })
})

describe('the originator', () => {
  const probe: OriginatorProbe = {
    gitUserName: () => 'Ada Lovelace',
    osUser: () => 'ada',
    hostname: () => 'laptop.local',
    tz: () => 'Europe/London',
  }

  test('who started the work, from git, else the OS login', () => {
    const who: Originator = resolveOriginator('/work/repo', probe)

    expect(who).toEqual({
      startedBy: 'Ada Lovelace',
      hostname: 'laptop.local',
      tz: 'Europe/London',
    })
  })

  test('with identity capture off, only the time zone', () => {
    expect(resolveOriginator('/work/repo', probe, false)).toEqual({
      startedBy: null,
      tz: 'Europe/London',
    })
  })
})
