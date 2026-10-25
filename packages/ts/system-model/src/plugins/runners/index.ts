/**
 * `@osdlc/system-model/runners`: task runners that belong to no one ecosystem.
 */

import { evidence } from '../../model.ts'
import type { Marker, ToolDef } from '../../tool.ts'
import {
  CMAKE_BRAND,
  cmakePresetsRunner,
  PRESETS_FILE,
  USER_PRESETS_FILE,
} from './cmake-presets.ts'
import { DEVBOX_BRAND, DEVBOX_JSON, devboxRunner } from './devbox.ts'
import { CONFIG_NAMES as COMPOSE_FILES, dockerComposeRunner } from './docker-compose.ts'
import { githubActionsRunner, WORKFLOW_FILES } from './github-actions.ts'
import { CONFIG_NAMES as TASKFILE_NAMES, goTaskRunner, GO_TASK_BRAND } from './go-task.ts'
import { JUSTFILE_NAMES, justRunner, JUST_BRAND } from './just.ts'
import { MAKEFILE_NAMES, makeRunner, MAKE_BRAND } from './make.ts'
import { moonDescribe, moonRunner, MOON_BRAND } from './moon.ts'
import { NX_BRAND, NX_JSON, nxRunner } from './nx.ts'
import { PROCFILE_BRAND, PROCFILE_NAMES, procfileRunner } from './procfile.ts'
import { TURBO_JSON, TURBO_JSONC, turboRunner, TURBO_BRAND } from './turbo.ts'
import { tasksFiles, VSCODE_TASKS_BRAND, vscodeTasksRunner } from './vscode-tasks.ts'

export type { MoonProjectFact } from './moon.ts'

const files = (names: readonly string[]): Marker[] =>
  names.map((name) => ({ files: name, tier: 'files' }))

/** moon: tasks from `moon query tasks`, and each project's role at detect time. */
export const moon: ToolDef = {
  id: 'moon',
  homepage: 'https://moonrepo.dev',
  description: 'A build system and monorepo tool that runs project tasks.',
  brand: MOON_BRAND,
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
  homepage: 'https://just.systems',
  description: 'A command runner for the recipes a justfile declares.',
  brand: JUST_BRAND,
  binary: 'just',
  markers: files(JUSTFILE_NAMES),
  roles: { runner: justRunner },
}

/** make: targets scanned from every Makefile. */
export const make: ToolDef = {
  id: 'make',
  homepage: 'https://www.gnu.org/software/make/',
  description: 'A build tool that runs the targets a Makefile declares.',
  brand: MAKE_BRAND,
  binary: 'make',
  markers: files(MAKEFILE_NAMES),
  roles: { runner: makeRunner },
}

/** turbo: the tasks a `turbo.json` declares. */
export const turbo: ToolDef = {
  id: 'turbo',
  homepage: 'https://turborepo.dev',
  description: 'A build system for JavaScript and TypeScript monorepos.',
  brand: TURBO_BRAND,
  binary: 'turbo',
  markers: files([TURBO_JSON, TURBO_JSONC]),
  roles: { runner: turboRunner },
}

/** go-task: tasks from a Taskfile. */
export const goTask: ToolDef = {
  id: 'go-task',
  homepage: 'https://taskfile.dev',
  description: 'A task runner for the tasks a Taskfile declares.',
  brand: GO_TASK_BRAND,
  binary: 'task',
  markers: files(TASKFILE_NAMES),
  roles: { runner: goTaskRunner },
}

/** docker compose: one task per service. */
export const dockerCompose: ToolDef = {
  id: 'docker-compose',
  homepage: 'https://docs.docker.com/compose/',
  description: 'Defines and runs multi-container applications from a compose file.',
  binary: 'docker',
  markers: files(COMPOSE_FILES),
  roles: { runner: dockerComposeRunner },
}

/** GitHub Actions: `gh workflow run` for each dispatchable workflow. */
export const githubActions: ToolDef = {
  id: 'github-actions',
  homepage: 'https://docs.github.com/en/actions',
  description: 'GitHub CI workflows, dispatched with the gh CLI.',
  binary: 'gh',
  markers: files(WORKFLOW_FILES),
  roles: { runner: githubActionsRunner },
}

/** Nx: the targets `project.json` and `package.json` declare, without running nx. */
export const nx: ToolDef = {
  id: 'nx',
  homepage: 'https://nx.dev',
  description: 'A build system for monorepos that runs the targets its projects declare.',
  brand: NX_BRAND,
  binary: 'nx',
  markers: [{ files: `/${NX_JSON}`, tier: 'files', workspaceRoot: true }],
  roles: { runner: nxRunner },
}

/** VS Code tasks: the tasks of each `.vscode/tasks.json`. No `binary`: each task runs its own command. */
export const vscodeTasks: ToolDef = {
  id: 'vscode-tasks',
  homepage: 'https://code.visualstudio.com/docs/debugtest/tasks',
  description: 'The tasks a VS Code workspace declares in .vscode/tasks.json.',
  brand: VSCODE_TASKS_BRAND,
  detect: async (ctx) =>
    (await tasksFiles(ctx)).map((file) => evidence('files', file, '.vscode/tasks.json')),
  roles: { runner: vscodeTasksRunner },
}

/** Devbox: the scripts of each `devbox.json`. */
export const devbox: ToolDef = {
  id: 'devbox',
  homepage: 'https://www.jetify.com/devbox',
  description:
    'Isolated development shells from Nix packages, with the scripts a devbox.json declares.',
  brand: DEVBOX_BRAND,
  binary: 'devbox',
  markers: files([DEVBOX_JSON]),
  roles: { runner: devboxRunner },
}

/**
 * Procfile: one service per process, through overmind, foreman or honcho.
 * No `binary`: the process manager is the first one found on the PATH.
 */
export const procfile: ToolDef = {
  id: 'procfile',
  homepage: 'https://devcenter.heroku.com/articles/procfile',
  description: 'The long-running processes a Procfile declares, run by a process manager.',
  brand: PROCFILE_BRAND,
  markers: files(PROCFILE_NAMES),
  roles: { runner: procfileRunner },
}

/** CMake presets: configure, build and test presets. */
export const cmakePresets: ToolDef = {
  id: 'cmake-presets',
  homepage: 'https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html',
  description: 'The configure, build and test presets a CMakePresets.json declares.',
  brand: CMAKE_BRAND,
  binary: 'cmake',
  markers: files([PRESETS_FILE, USER_PRESETS_FILE]),
  roles: { runner: cmakePresetsRunner },
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
  nx,
  vscodeTasks,
  devbox,
  procfile,
  cmakePresets,
]
