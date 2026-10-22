import { describe, expect, test } from 'vitest'

import { ContractError } from '../../src/core/finding.js'
import type { Finding } from '../../src/core/types.js'

const findings: Finding[] = [
  { id: 'frontmatter/enum', level: 'error', path: 'x.md', message: 'bad status' },
]

describe('ContractError — the failure read() throws', () => {
  test('is an Error named ContractError that carries the findings as data', () => {
    const err = new ContractError(findings)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ContractError')
    expect(err.findings).toBe(findings)
  })

  test('its default message counts the findings', () => {
    expect(new ContractError(findings).message).toBe('contract validation failed with 1 finding(s)')
  })

  test('a custom message is used verbatim', () => {
    expect(new ContractError([], 'boom').message).toBe('boom')
  })
})
