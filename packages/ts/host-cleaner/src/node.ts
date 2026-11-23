/**
 * The `node` plugin: `node_modules` in linked worktrees nobody is working in.
 *
 * Detected when a swept checkout has a `package.json`. A linked worktree's
 * `node_modules` is a candidate when no process works in the worktree and its
 * newest file outside `node_modules`, `.git` and `target` is older than the
 * threshold. The primary checkout's `node_modules` is never a row.
 * Settings: `plugins.node.idleHours` (default {@link DEFAULT_IDLE_HOURS}).
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import {
  artifactPlugin,
  artifactRow,
  checkoutsOf,
  inside,
  present,
  refusedRow,
  type ArtifactOptions,
  type Checkout,
  type Env,
  type Row,
} from './artifacts.ts'
import { idleHoursSetting, type Kit } from './kit.ts'
import { PLUGIN_API, definePlugin, type Plugin } from './types.ts'

export const NODE_PLUGIN = 'node'

const PNPM_NOTE =
  'node_modules/.pnpm is mostly hard links into the pnpm store; deleting it frees less than the size shown'

const SKIPPED = new Set(['node_modules', '.git', 'target'])

async function rowFor(env: Env, checkout: Checkout): Promise<Row[]> {
  try {
    return rowOrThrow(env, checkout)
  } catch {
    // A directory that cannot be read may hide recent changes: no row.
    return []
  }
}

function rowOrThrow(env: Env, checkout: Checkout): Row[] {
  const { kit, idleHours: threshold } = env
  if (checkout.primary || !existsSync(join(checkout.path, 'package.json'))) return []
  const modules = join(checkout.path, 'node_modules')
  if (!present(modules)) return []
  const safe = inside(checkout.path, 'node_modules')
  if (safe === null) return [refusedRow(kit, 'node-modules', modules, checkout.path)]

  const since = kit.idle(checkout.path, { skip: (name) => SKIPPED.has(name) })
  if (!since.unmeasured && (since.hours === null || since.hours < threshold)) return []

  return [
    artifactRow(kit, {
      kind: 'node-modules',
      path: safe,
      checkout: checkout.path,
      held: kit.running({ in: checkout.path }, env.ctx),
      idle: !since.unmeasured,
      ...(since.unmeasured ? { unmeasured: true } : {}),
      why: since.unmeasured
        ? 'when the worktree last changed could not be measured in the time budget'
        : `nothing changed in the worktree for ${since.hours} hours (threshold ${threshold})`,
      notes: present(join(safe, '.pnpm')) ? [PNPM_NOTE] : [],
    }),
  ]
}

/** The `node` plugin on `kit`, or on a kit built from `opts`: `node_modules` of idle linked worktrees. Settings: `idleHours`. */
export function nodePlugin(opts: ArtifactOptions = {}, kit?: Kit): Plugin {
  return artifactPlugin(
    NODE_PLUGIN,
    opts,
    (env) => checkoutsOf(env).some((c) => existsSync(join(c.path, 'package.json'))),
    rowFor,
    kit,
  )
}

/** The `node` plugin as the command line builds it. */
export const nodeDefinition = definePlugin({
  name: NODE_PLUGIN,
  api: PLUGIN_API,
  settings: z.strictObject({ idleHours: idleHoursSetting }),
  create: ({ settings, kit }) => nodePlugin({ idleHours: settings.idleHours }, kit),
})
