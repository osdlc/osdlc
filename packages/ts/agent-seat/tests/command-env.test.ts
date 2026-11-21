/** `CommandRequest.env` reaches the command that the argv-building hosts run. */
import { describe, expect, test } from 'vitest'

import { cmuxCreateArgv } from '../src/hosts/cmux.ts'
import { orcaCreateArgv } from '../src/hosts/orca.ts'
import { ottyCreateArgv } from '../src/hosts/otty.ts'
import { makeTerminalHost } from '../src/hosts/terminal.ts'
import { tmuxCreateArgv } from '../src/hosts/tmux.ts'
import { weztermSpawnArgv } from '../src/hosts/wezterm.ts'
import type { CommandRequest } from '../src/index.ts'

const req: CommandRequest = { cwd: '/w', argv: ['zsh'], title: 'T', env: { SDLC_SESSION: 's1' } }
const bare: CommandRequest = { cwd: '/w', argv: ['zsh'], title: 'T' }

describe('CommandRequest.env', () => {
  test('orca, cmux and otty put `env K=V` in the typed command', () => {
    expect(orcaCreateArgv(req)).toContain('env SDLC_SESSION=s1 zsh')
    expect(cmuxCreateArgv(req)).toContain('env SDLC_SESSION=s1 zsh')
    expect(ottyCreateArgv(req)).toContain('env SDLC_SESSION=s1 zsh')
  })
  test('wezterm and tmux put it before the program', () => {
    expect(weztermSpawnArgv(req).join(' ')).toContain('env SDLC_SESSION=s1 zsh')
    expect(tmuxCreateArgv(req).join(' ')).toContain('env SDLC_SESSION=s1 zsh')
  })
  test.skipIf(process.platform === 'win32')('the terminal host runs `env` with the vars', () => {
    const runs: Array<{ bin: string; args: string[] }> = []
    const host = makeTerminalHost({
      streamRunner: (bin) => ({
        run: (args: string[]) => {
          runs.push({ bin, args })
          return { exitCode: 0 }
        },
      }),
    })
    host.terminal!(req)
    expect(runs).toEqual([{ bin: 'env', args: ['SDLC_SESSION=s1', 'zsh'] }])
  })
  test('without env the command is unchanged', () => {
    expect(orcaCreateArgv(bare)).toContain('zsh')
    expect(orcaCreateArgv(bare).join(' ')).not.toContain('env ')
  })
})
