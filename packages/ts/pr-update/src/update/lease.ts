/**
 * A per-branch update lease on a git ref, so two `pr-update` runs (two CI jobs, a laptop and a
 * server) do not update the same head branch at once.
 *
 * The lease is the ref `<ref_prefix>lock/<encoded head>` at the remote. Its commit holds
 * `{ holder, pr, startedAt, expiresAt }`. Taking it is a `casCreate` (nobody holds it) or a
 * `casReplace` (the holder's lease has expired, or is this holder's own leftover). A lost swap
 * means another run moved first; the lease is read again and the decision made again. Releasing is
 * a `casDelete` pinned to the sha this run wrote, so a lease that expired and was taken over is
 * never deleted from under its new holder.
 *
 * A holder that crashes leaves the lease until `expiresAt`; nothing renews it. The TTL must
 * therefore outlast one PR's update, repair included.
 */

import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

import {
  buildLeaseCommit,
  casCreate,
  casDelete,
  casReplace,
  CasFailed,
  fetchRef,
  PayloadUnreadable,
  RefNotFound,
} from '@osdlc/ref-lease'

import type { BranchLease, LeaseGrant } from '../ports.ts'
import { withRefHint } from './ref-attempts.ts'
import { DEFAULT_REF_PREFIX, lockRef, MAX_CAS_ATTEMPTS } from './ref-names.ts'

export interface LeasePayload {
  holder: string
  pr: number
  startedAt: string
  expiresAt: string
}

export interface RefBranchLeaseOptions {
  remote: string
  cwd: string
  /** The `ref_prefix` setting. Default `refs/pr-update/`. */
  refPrefix?: string
  ttlMs: number
  /** Default: see {@link defaultHolder}. */
  holder?: string
  now?: () => Date
}

/** `github-run-<id>` in Actions, else `<hostname>:<pid>`, plus a per-invocation suffix so two processes of one run never share a holder. */
export function defaultHolder(env: NodeJS.ProcessEnv = process.env): string {
  const run = env['GITHUB_RUN_ID']
  const base =
    run === undefined || run === '' ? `${hostname()}:${process.pid}` : `github-run-${run}`
  return `${base}:${randomUUID().slice(0, 8)}`
}

/** The lease TTL when none is configured: the repair timeout plus ten minutes, else 30 minutes. */
export function defaultLeaseTtlSeconds(repairTimeoutSeconds: number | null): number {
  return repairTimeoutSeconds === null ? 30 * 60 : repairTimeoutSeconds + 10 * 60
}

function decode(v: unknown): LeasePayload | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o['holder'] !== 'string' || typeof o['expiresAt'] !== 'string') return null
  return {
    holder: o['holder'],
    pr: typeof o['pr'] === 'number' ? o['pr'] : 0,
    startedAt: typeof o['startedAt'] === 'string' ? o['startedAt'] : '',
    expiresAt: o['expiresAt'],
  }
}

export function refBranchLease(opts: RefBranchLeaseOptions): BranchLease {
  const { remote, cwd } = opts
  const refPrefix = opts.refPrefix ?? DEFAULT_REF_PREFIX
  const holder = opts.holder ?? defaultHolder()
  const now = opts.now ?? (() => new Date())
  const gitOpts = { cwd }

  /** The lease's current sha and payload; payload null when it cannot be read. */
  const read = (ref: string): { sha: string; payload: LeasePayload | null } | null => {
    try {
      return fetchRef(remote, ref, { ...gitOpts, decode })
    } catch (e) {
      if (e instanceof RefNotFound) return null
      if (e instanceof PayloadUnreadable) return { sha: e.sha, payload: null }
      throw withRefHint(e, remote)
    }
  }

  return {
    acquire({ head, pr }): LeaseGrant {
      const ref = lockRef(refPrefix, head)
      for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt++) {
        const current = read(ref)
        const t = now()
        const held = current?.payload
        if (held != null && held.holder !== holder && Date.parse(held.expiresAt) > t.getTime()) {
          return { ok: false, holder: held.holder }
        }
        const payload: LeasePayload = {
          holder,
          pr,
          startedAt: t.toISOString(),
          expiresAt: new Date(t.getTime() + opts.ttlMs).toISOString(),
        }
        const sha = buildLeaseCommit(payload, { ...gitOpts, parentSha: current?.sha ?? null })
        try {
          if (current === null) casCreate(remote, ref, sha, gitOpts)
          else casReplace(remote, ref, current.sha, sha, gitOpts)
        } catch (e) {
          if (e instanceof CasFailed) continue
          throw withRefHint(e, remote)
        }
        return {
          ok: true,
          release() {
            try {
              casDelete(remote, ref, sha, gitOpts)
            } catch {
              // Lost the swap (the lease expired and was taken over) or the remote is gone.
              // Either way the lease ends by itself at `expiresAt`; a failed release must not
              // hide the update's own result.
            }
          },
        }
      }
      // Lost every swap: someone is actively taking this lease.
      const last = read(ref)
      return { ok: false, holder: last?.payload?.holder ?? 'unknown' }
    },
  }
}
