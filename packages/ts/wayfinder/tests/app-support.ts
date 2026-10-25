/**
 * The shared commands (`config`, `trust`, `guide`, `clean`) mounted on a
 * cli-tool app, as wayfinder mounts them, for tests that drive them in
 * process. HOME is always a throwaway directory.
 */

import { defineApp, type App } from '@osdlc/cli-tool/command'
import { runApp, type AppRun } from '@osdlc/cli-tool/testing'

import { cleanCommand } from '../src/clean-command.ts'
import { configCommand } from '../src/config-command.ts'
import { guideCommand } from '../src/guide.ts'
import { trustCommand } from '../src/trust-command.ts'

export const GLOBALS = {
  dir: { kind: 'string', short: 'C', valueName: 'PATH', help: 'the directory to inspect' },
} as const

/** An app with the four shared commands. `platform` is for `clean`'s paths. */
export function wayApp(opts: { platform?: string } = {}): App {
  return defineApp({
    name: 'way',
    version: '0.8.0',
    summary: 'test app',
    globals: GLOBALS,
    checkOutput: true,
    commands: {
      config: configCommand({ globals: GLOBALS }),
      trust: trustCommand({ globals: GLOBALS }),
      guide: guideCommand({ globals: GLOBALS }),
      clean: cleanCommand({
        globals: GLOBALS,
        ...(opts.platform !== undefined ? { platform: opts.platform } : {}),
      }),
    },
  })
}

/** Run `argv` with `HOME` at `home`, in `cwd`, with `env` on top. PATH is kept for git. */
export async function runWay(
  argv: readonly string[],
  at: { cwd: string; home: string; env?: Record<string, string | undefined>; app?: App },
): Promise<AppRun> {
  return runApp(at.app ?? wayApp(), argv, {
    cwd: at.cwd,
    env: { PATH: process.env['PATH'], HOME: at.home, ...at.env },
  })
}
