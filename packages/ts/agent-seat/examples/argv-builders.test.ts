/**
 * Usage examples for the pure per-host argv builders. Each returns the argv of one
 * host CLI call and runs nothing, so a caller can add a flag and run it itself.
 */
import { describe, expect, test } from 'vitest'

import {
  cmuxCloseArgv,
  cmuxCreateArgv,
  cmuxFocusArgv,
  cmuxReadScreenArgv,
  cmuxSendArgv,
  cmuxSendEnterArgv,
  cmuxSessionsArgv,
  cmuxWorkspaceListArgv,
  herdrAgentPromptArgv,
  herdrPaneCloseArgv,
  herdrPaneListArgv,
  herdrPaneReadArgv,
  herdrPaneRunArgv,
  herdrTabFocusArgv,
  herdrWorkspaceCreateArgv,
  herdrWorkspaceFocusArgv,
  orcaCloseArgv,
  orcaCreateArgv,
  orcaFindArgv,
  orcaSendArgv,
  orcaSwitchArgv,
  ottyCaptureArgv,
  ottyCloseArgv,
  ottyCreateArgv,
  ottyFocusArgv,
  ottyListArgv,
  ottySendArgv,
  tmuxCapturePaneArgv,
  tmuxCreateArgv,
  tmuxHasSessionArgv,
  tmuxKillSessionArgv,
  tmuxListSessionsArgv,
  tmuxLoadBufferArgv,
  tmuxPaneStatusArgv,
  tmuxPasteBufferArgv,
  tmuxSendEnterArgv,
  weztermActivateArgv,
  weztermGetTextArgv,
  weztermKillPaneArgv,
  weztermListArgv,
  weztermSendTextArgv,
  weztermSpawnArgv,
  type CommandRequest,
} from '../src/index.ts'

const req: CommandRequest = { cwd: '/w', title: 'T', argv: ['echo', 'hi'] }

describe('host argv builders', () => {
  test('a create builder returns the host CLI argv, ready for one extra flag', () => {
    const argv = [...orcaCreateArgv(req), '--extra']
    expect(argv.slice(0, 2)).toEqual(['terminal', 'create'])
    expect(argv.at(-1)).toBe('--extra')
    expect(cmuxCreateArgv(req).slice(0, 2)).toEqual(['workspace', 'create'])
  })

  test('every builder returns a non-empty string array', () => {
    const all = [
      cmuxCloseArgv('h'),
      cmuxFocusArgv('h'),
      cmuxReadScreenArgv('h'),
      cmuxSendArgv('h', 't'),
      cmuxSendEnterArgv('h'),
      cmuxSessionsArgv('/w'),
      cmuxWorkspaceListArgv(),
      herdrAgentPromptArgv('p', 't'),
      herdrPaneCloseArgv('p'),
      herdrPaneListArgv(),
      herdrPaneReadArgv('p'),
      herdrPaneRunArgv('p', ['ls']),
      herdrTabFocusArgv('t'),
      herdrWorkspaceCreateArgv(req),
      herdrWorkspaceFocusArgv('w'),
      orcaCloseArgv('h'),
      orcaFindArgv({ cwd: '/w' }),
      orcaSendArgv('h', 't'),
      orcaSwitchArgv('h'),
      ottyCaptureArgv('p'),
      ottyCloseArgv('p'),
      ottyCreateArgv(req),
      ottyFocusArgv('p'),
      ottyListArgv(),
      ottySendArgv('p', 't'),
      tmuxCapturePaneArgv('n'),
      tmuxCreateArgv(req),
      tmuxHasSessionArgv('n'),
      tmuxKillSessionArgv('n'),
      tmuxListSessionsArgv(),
      tmuxLoadBufferArgv('n'),
      tmuxPaneStatusArgv('n'),
      tmuxPasteBufferArgv('n'),
      tmuxSendEnterArgv('n'),
      weztermActivateArgv(1),
      weztermGetTextArgv(1),
      weztermKillPaneArgv(1),
      weztermListArgv(),
      weztermSendTextArgv(1, false, 't'),
      weztermSpawnArgv(req),
    ]
    for (const argv of all) {
      expect(argv.length).toBeGreaterThan(0)
      expect(argv.every((a) => typeof a === 'string')).toBe(true)
    }
  })
})
