/**
 * The `node` adapter: `node_modules` in linked worktrees nobody is working in.
 *
 * Detected when a swept checkout has a `package.json`. A linked worktree's
 * `node_modules` is a candidate when no process works in the worktree and its
 * newest file outside `node_modules`, `.git` and `target` is older than the
 * threshold. The primary checkout's `node_modules` is never a row.
 * Settings: `config.adapters.node.idleHours` (default 24).
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { busyHolders } from '@osdlc/repo-cleaner'

import type { HostAdapter, HostContext, HostRow } from './adapter.ts'
import {
  artifactRow,
  checkoutsOf,
  holdersIn,
  idleHoursSetting,
  idleHoursSince,
  inside,
  newestMtime,
  present,
  refusedRow,
  removeArtifact,
  type Checkout,
} from './artifacts.ts'

export const NODE_ADAPTER = 'node'

const PNPM_NOTE =
  'node_modules/.pnpm is mostly hard links into the pnpm store; deleting it frees less than the size shown'

const SKIPPED = new Set(['node_modules', '.git', 'target'])

function rowFor(ctx: HostContext, checkout: Checkout, threshold: number): HostRow[] {
  if (checkout.primary || !existsSync(join(checkout.path, 'package.json'))) return []
  const modules = join(checkout.path, 'node_modules')
  if (!present(modules)) return []
  const safe = inside(checkout.path, 'node_modules')
  if (safe === null) return [refusedRow(NODE_ADAPTER, 'node-modules', modules, checkout.path)]

  const newest = newestMtime(checkout.path, (name) => SKIPPED.has(name))
  const now = ctx.now()
  if (newest === null || idleHoursSince(newest, now) < threshold) return []

  const held = holdersIn(ctx, checkout.path, busyHolders)
  return [
    artifactRow(
      NODE_ADAPTER,
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

export const nodeAdapter: HostAdapter = {
  name: NODE_ADAPTER,
  detect: (ctx) => checkoutsOf(ctx).some((c) => existsSync(join(c.path, 'package.json'))),
  gather: (ctx) => {
    const threshold = idleHoursSetting(ctx, NODE_ADAPTER)
    return checkoutsOf(ctx).flatMap((c) => rowFor(ctx, c, threshold))
  },
  execute: (step, ctx) => removeArtifact(nodeAdapter, step, ctx),
}
