/** `redactArgs`: which MCP command arguments read as secrets. */

import { describe, expect, test } from 'vitest'

import { REDACTED, redactArgs } from '../read/redact.ts'

describe('redactArgs', () => {
  test('a flag whose name contains token, secret, key, password or auth', () => {
    expect(
      redactArgs(['--auth-token', 'a', '--client-secret=b', '--apikey', 'c', '--auth', 'd']),
    ).toEqual([
      '--auth-token',
      REDACTED,
      `--client-secret=${REDACTED}`,
      '--apikey',
      REDACTED,
      '--auth',
      REDACTED,
    ])
  })

  test('a next arg that starts with -- is another flag and is kept', () => {
    expect(redactArgs(['--token', '--verbose', '--key'])).toEqual(['--token', '--verbose', '--key'])
  })

  test('an Authorization header arg and a Bearer arg', () => {
    expect(
      redactArgs([
        '-H',
        'Authorization: Bearer abc',
        'Bearer xyz',
        '--header=authorization:Basic q',
      ]),
    ).toEqual([
      '-H',
      `Authorization: ${REDACTED}`,
      `Bearer ${REDACTED}`,
      `--header=authorization:${REDACTED}`,
    ])
  })

  test('other args are kept', () => {
    expect(redactArgs(['-y', 'pkg', '--port', '80', 'MODE=prod'])).toEqual([
      '-y',
      'pkg',
      '--port',
      '80',
      'MODE=prod',
    ])
  })
})
