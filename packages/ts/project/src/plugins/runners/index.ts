/**
 * `@osdlc/project/runners`: task runners that belong to no one ecosystem.
 */

import type { Marker, ToolDef } from '../../tool.ts'
import { CONFIG_NAMES as COMPOSE_FILES, dockerComposeRunner } from './docker-compose.ts'
import { githubActionsRunner, WORKFLOW_FILES } from './github-actions.ts'
import { CONFIG_NAMES as TASKFILE_NAMES, goTaskRunner } from './go-task.ts'
import { JUSTFILE_NAMES, justRunner } from './just.ts'
import { MAKEFILE_NAMES, makeRunner } from './make.ts'
import { moonDescribe, moonRunner } from './moon.ts'
import { TURBO_JSON, TURBO_JSONC, turboRunner } from './turbo.ts'

export type { MoonProjectFact } from './moon.ts'

const files = (names: readonly string[]): Marker[] =>
  names.map((name) => ({ files: name, tier: 'files' }))

/** moon: tasks from `moon query tasks`, and each project's role at detect time. */
export const moon: ToolDef = {
  id: 'moon',
  binary: 'moon',
  markers: ['/.moon/workspace.yml', '/.moon/workspace.yaml'].map((name) => ({
    files: name,
    tier: 'files',
    workspaceRoot: true,
  })),
  describe: moonDescribe,
  roles: { runner: moonRunner },
}

/** just: recipes from every justfile. */
export const just: ToolDef = {
  id: 'just',
  binary: 'just',
  markers: files(JUSTFILE_NAMES),
  roles: { runner: justRunner },
}

/** make: targets scanned from every Makefile. */
export const make: ToolDef = {
  id: 'make',
  binary: 'make',
  markers: files(MAKEFILE_NAMES),
  roles: { runner: makeRunner },
}

/** turbo: the tasks a `turbo.json` declares. */
export const turbo: ToolDef = {
  id: 'turbo',
  binary: 'turbo',
  markers: files([TURBO_JSON, TURBO_JSONC]),
  roles: { runner: turboRunner },
}

/** go-task: tasks from a Taskfile. */
export const goTask: ToolDef = {
  id: 'go-task',
  binary: 'task',
  markers: files(TASKFILE_NAMES),
  roles: { runner: goTaskRunner },
}

/** docker compose: one task per service. */
export const dockerCompose: ToolDef = {
  id: 'docker-compose',
  binary: 'docker',
  markers: files(COMPOSE_FILES),
  roles: { runner: dockerComposeRunner },
}

/** GitHub Actions: `gh workflow run` for each dispatchable workflow. */
export const githubActions: ToolDef = {
  id: 'github-actions',
  binary: 'gh',
  markers: files(WORKFLOW_FILES),
  roles: { runner: githubActionsRunner },
}

/** Every tool this plugin defines. */
export const runnerTools: readonly ToolDef[] = [
  moon,
  just,
  make,
  turbo,
  goTask,
  dockerCompose,
  githubActions,
]
