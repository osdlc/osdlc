/**
 * The devlink spec recognises this package as a checkout of rule-review, so
 * `rule-review dev link` accepts it and `runMain` knows the code it runs from.
 */

import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { isCheckout } from '@osdlc/cli-tool/devlink'
import { describe, expect, test } from 'vitest'

import { DEVLINK_SPEC } from '../src/devlink.ts'

describe('DEVLINK_SPEC', () => {
  test('this package is a rule-review checkout and its parent is not', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    expect(isCheckout(DEVLINK_SPEC, root)).toBe(true)
    expect(isCheckout(DEVLINK_SPEC, fileURLToPath(new URL('../..', import.meta.url)))).toBe(false)
  })

  test('the launcher is executable, as the `dev install` shim runs it directly', () => {
    const launcher = fileURLToPath(new URL(`../${DEVLINK_SPEC.launcher}`, import.meta.url))
    expect(statSync(launcher).mode & 0o111).not.toBe(0)
  })
})
