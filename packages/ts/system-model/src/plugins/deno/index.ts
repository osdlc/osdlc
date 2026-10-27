/** `@osdlc/system-model/deno`: the deno ecosystem and `deno task`. */

import type { ToolDef } from '../../tool.ts'
import { denoTasksRunner } from './deno-tasks.ts'
import { denoEcosystem } from './ecosystem.ts'

/** `deno task`: the tasks a deno config declares. */
export const denoTasks: ToolDef = {
  id: 'deno-tasks',
  homepage: 'https://docs.deno.com/runtime/reference/cli/task/',
  description: 'The tasks a deno.json declares, run with `deno task`.',
  binary: 'deno',
  ecosystem: denoEcosystem,
  roles: { runner: denoTasksRunner },
}

/** Every tool this plugin defines. */
export const denoTools: readonly ToolDef[] = [denoTasks]

export { denoEcosystem }
