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

import { busyHolders } from '@osdlc/repo-cleaner'

import {
  artifactPlugin,
  artifactRow,
  checkoutsOf,
  holdersIn,
  idleHoursSince,
  inside,
  newestMtime,
  present,
  refusedRow,
  type ArtifactOptions,
  type Checkout,
  type Env,
  type Row,
} from './artifacts.ts'
import type { Plugin } from './types.ts'

export const NODE_PLUGIN = 'node'

const PNPM_NOTE =
  'node_modules/.pnpm is mostly hard links into the pnpm store; deleting it frees less than the size shown'

const SKIPPED = new Set(['node_modules', '.git', 'target'])

function rowFor(env: Env, checkout: Checkout): Row[] {
  try {
    return rowOrThrow(env, checkout)
  } catch {
    // A directory that cannot be read may hide recent changes: no row.
    return []
  }
}

function rowOrThrow(env: Env, checkout: Checkout): Row[] {
  const threshold = env.idleHours
  if (checkout.primary || !existsSync(join(checkout.path, 'package.json'))) return []
  const modules = join(checkout.path, 'node_modules')
  if (!present(modules)) return []
  const safe = inside(checkout.path, 'node_modules')
  if (safe === null) return [refusedRow(NODE_PLUGIN, 'node-modules', modules, checkout.path)]

  const newest = newestMtime(checkout.path, (name) => SKIPPED.has(name))
  const now = env.now()
  if (newest === null || idleHoursSince(newest, now) < threshold) return []

  const held = holdersIn(env, checkout.path, busyHolders)
  return [
    artifactRow(
      NODE_PLUGIN,
      {
        kind: 'node-modules',
        path: safe,
        checkout: checkout.path,
        newestMtimeMs: newest,
        held,
        idle: true,
        why: `nothing changed in the worktree for ${idleHoursSince(newest, now)} hours (threshold ${threshold})`,
        notes: present(join(safe, '.pnpm')) ? [PNPM_NOTE] : [],
      },
      now,
    ),
  ]
}

/** `node_modules` of idle linked worktrees. Settings: `idleHours`. */
export function nodePlugin(opts: ArtifactOptions = {}): Plugin {
  return artifactPlugin(
    NODE_PLUGIN,
    opts,
    (env) => checkoutsOf(env).some((c) => existsSync(join(c.path, 'package.json'))),
    rowFor,
  )
}
