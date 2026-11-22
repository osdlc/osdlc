import { EXIT, captureContext } from '@osdlc/cli-tool'
import { describe, expect, test } from 'vitest'

import { main } from '../src/cli.ts'

async function run(...argv: string[]) {
  const ctx = captureContext({ cwd: process.cwd() })
  const code = await main(argv, ctx)
  return { code, out: ctx.io.out, err: ctx.io.err }
}

describe('diffkit', () => {
  test('with no command it prints the usage and exits 2', async () => {
    const { code, out } = await run()
    expect(code).toBe(EXIT.usage)
    expect(out).toContain('Usage: diffkit <command>')
    expect(out).toContain('prep')
  })

  test('--help and -h print the usage and exit 0', async () => {
    for (const flag of ['--help', '-h']) {
      const { code, out } = await run(flag)
      expect(code).toBe(EXIT.ok)
      expect(out).toContain('Usage: diffkit <command>')
    }
  })

  test('an unknown command is a usage error that names it', async () => {
    const { code, err } = await run('nope')
    expect(code).toBe(EXIT.usage)
    expect(err).toContain("unknown command 'nope'")
  })

  test('a name from Object.prototype is not a command', async () => {
    for (const name of ['constructor', 'toString', '__proto__']) {
      const { code, err } = await run(name)
      expect(code).toBe(EXIT.usage)
      expect(err).toContain(`unknown command '${name}'`)
    }
  })

  test('prep --help prints its options and exits 0', async () => {
    const { code, out } = await run('prep', '--help')
    expect(code).toBe(EXIT.ok)
    expect(out).toContain('--group-size')
    expect(out).toContain('--worktree')
  })
})
