/**
 * `@osdlc/project/builtins`: every built-in tool, in report order.
 *
 * Runners come first in the order their reports appear; tools with no runner
 * follow. proto sits before mise so a pinned install tries proto first.
 */

import { denoTasks } from './plugins/deno/index.ts'
import { go } from './plugins/go/index.ts'
import { gradle, maven, sbt } from './plugins/jvm/index.ts'
import { bun, nodeScripts, npm, pnpm, yarn } from './plugins/node/index.ts'
import { composer } from './plugins/php/index.ts'
import { pip, poetry, python, uv } from './plugins/python/index.ts'
import { bundler, rake } from './plugins/ruby/index.ts'
import {
  dockerCompose,
  githubActions,
  goTask,
  just,
  make,
  moon,
  turbo,
} from './plugins/runners/index.ts'
import { cargo } from './plugins/rust/index.ts'
import { swiftpm } from './plugins/swift/index.ts'
import { direnv, husky, lefthook, mise, preCommit, proto } from './plugins/tools/index.ts'
import type { ToolDef } from './tool.ts'

/** Every built-in tool. Pass to `createProject({ tools: builtins })`. */
export const builtins: readonly ToolDef[] = [
  moon,
  proto,
  mise,
  just,
  nodeScripts,
  make,
  cargo,
  sbt,
  python,
  composer,
  denoTasks,
  turbo,
  maven,
  swiftpm,
  gradle,
  goTask,
  rake,
  dockerCompose,
  githubActions,
  bun,
  pnpm,
  yarn,
  npm,
  uv,
  poetry,
  pip,
  go,
  bundler,
  direnv,
  lefthook,
  husky,
  preCommit,
]

/** The ids of {@link builtins}, in the same order. */
export const BUILTIN_TOOL_IDS = [
  'moon',
  'proto',
  'mise',
  'just',
  'node-scripts',
  'make',
  'cargo',
  'sbt',
  'python',
  'composer',
  'deno-tasks',
  'turbo',
  'maven',
  'swiftpm',
  'gradle',
  'go-task',
  'rake',
  'docker-compose',
  'github-actions',
  'bun',
  'pnpm',
  'yarn',
  'npm',
  'uv',
  'poetry',
  'pip',
  'go',
  'bundler',
  'direnv',
  'lefthook',
  'husky',
  'pre-commit',
] as const

/** The id of a built-in tool. */
export type BuiltinToolId = (typeof BUILTIN_TOOL_IDS)[number]
