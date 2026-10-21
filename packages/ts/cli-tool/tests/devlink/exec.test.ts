import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { execSelection } from '../../src/devlink/exec.ts'
import type { Selected } from '../../src/devlink/resolve.ts'
import { SPEC, sandbox, type Sandbox } from './support.ts'

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

const selection: Selected = {
  source: 'env',
  checkout: '/x',
  entry: '/x/src/cli.ts',
  reason: 'test',
}

function fakeBun(body: string): string {
  const path = join(sb.root, 'bun')
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

describe('execSelection exit codes', () => {
  test('a signalled child returns 128 plus the signal number', () => {
    const bun = fakeBun('kill -TERM $$')
    expect(execSelection(SPEC, selection, [], { env: { TOOLY_QUIET: '1' }, bun })).toBe(143)
  })

  test('a normal exit code passes through', () => {
    const bun = fakeBun('exit 7')
    expect(execSelection(SPEC, selection, [], { env: { TOOLY_QUIET: '1' }, bun })).toBe(7)
  })
})
