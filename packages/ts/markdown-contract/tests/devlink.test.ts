/**
 * The devlink spec recognises this package as a checkout of markdown-contract, so
 * `markdown-contract dev link` accepts it and the bin knows the code it runs from.
 */
import { fileURLToPath } from 'node:url'

import { isCheckout } from '@osdlc/cli-tool/devlink'
import { describe, expect, test } from 'vitest'

import { DEVLINK_SPEC } from '../src/cli/devlink.js'

describe('DEVLINK_SPEC', () => {
  test('this package is a markdown-contract checkout and its parent is not', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    expect(isCheckout(DEVLINK_SPEC, root)).toBe(true)
    expect(isCheckout(DEVLINK_SPEC, fileURLToPath(new URL('../..', import.meta.url)))).toBe(false)
  })
})
