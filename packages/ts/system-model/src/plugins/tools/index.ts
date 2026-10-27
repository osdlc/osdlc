/**
 * `@osdlc/system-model/tools`: tool managers (mise, proto, direnv) and hook
 * managers (lefthook, husky, pre-commit).
 */

import type { ToolDef } from '../../tool.ts'
import {
  HUSKY_DIR,
  huskyArm,
  huskyHooks,
  LEFTHOOK_CONFIGS,
  lefthookHooks,
  PRE_COMMIT_CONFIGS,
  preCommitHooks,
} from './hooks.ts'
import { MISE_CONFIGS, MISE_TASK_DIRS, miseRunner, MISE_BRAND } from './mise.ts'

export { GIT_HOOKS } from './hooks.ts'

/** mise: pinned tools, a trust grant, and tasks. */
export const mise: ToolDef = {
  id: 'mise',
  homepage: 'https://mise.jdx.dev',
  description: 'A tool version manager, environment manager and task runner.',
  brand: MISE_BRAND,
  binary: 'mise',
  markers: MISE_TASK_DIRS.map((files) => ({ files, tier: 'files' })),
  roles: {
    toolManager: {
      configs: MISE_CONFIGS,
      install: ['mise', 'install'],
      exec: (binary) => ['mise', 'exec', '--', binary],
      trustEnv: (root) => ({ MISE_TRUSTED_CONFIG_PATHS: root }),
      trust: ['mise', 'trust'],
    },
    runner: miseRunner,
  },
}

/** proto: pinned tools from `.prototools`. */
export const proto: ToolDef = {
  id: 'proto',
  homepage: 'https://moonrepo.dev/proto',
  description: 'A version manager for languages and tools.',
  binary: 'proto',
  roles: {
    toolManager: {
      configs: ['/.prototools'],
      install: ['proto', 'install'],
      exec: (binary) => ['proto', 'run', binary, '--'],
    },
  },
}

/** direnv: an `.envrc` that needs a one-time `direnv allow`. */
export const direnv: ToolDef = {
  id: 'direnv',
  homepage: 'https://direnv.net',
  description: 'Loads and unloads environment variables by directory.',
  binary: 'direnv',
  roles: { toolManager: { configs: ['/.envrc'], trust: ['direnv', 'allow'] } },
}

/** lefthook: git hooks from a lefthook config. */
export const lefthook: ToolDef = {
  id: 'lefthook',
  homepage: 'https://lefthook.dev',
  description: 'A git hooks manager.',
  binary: 'lefthook',
  roles: {
    hookManager: {
      configs: LEFTHOOK_CONFIGS,
      arm: () => ['lefthook', 'install'],
      hooks: lefthookHooks,
    },
  },
}

/** husky: hook scripts under `.husky/`. */
export const husky: ToolDef = {
  id: 'husky',
  homepage: 'https://typicode.github.io/husky/',
  description: 'A git hooks manager for Node.js projects.',
  binary: 'husky',
  roles: { hookManager: { configs: [HUSKY_DIR], arm: huskyArm, hooks: huskyHooks } },
}

/** pre-commit: hooks from `.pre-commit-config.yaml`. */
export const preCommit: ToolDef = {
  id: 'pre-commit',
  homepage: 'https://pre-commit.com',
  description: 'A framework for managing git pre-commit hooks.',
  binary: 'pre-commit',
  roles: {
    hookManager: {
      configs: PRE_COMMIT_CONFIGS,
      arm: () => ['pre-commit', 'install'],
      hooks: preCommitHooks,
    },
  },
}

/** Every tool this plugin defines. */
export const toolTools: readonly ToolDef[] = [mise, proto, direnv, lefthook, husky, preCommit]
