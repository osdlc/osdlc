/**
 * A per-branch update lease on a ref, so two `pr-update` runs (two CI jobs, a laptop and a server)
 * do not update the same head branch at once.
 *
 * The lease is the ref `<ref_prefix>lock/<encoded head>` at the remote. Its commit holds
 * `{ holder, pr, startedAt, expiresAt }`. `@osdlc/ref-lease` does the claim, the takeover of an
 * expired or own-leftover lease, and the release pinned to the sha this run wrote. This file holds
 * only the payload rules. Nothing renews a lease, so the TTL must outlast one PR's update, repair
 * included.
 */

import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

import { CasFailed, claim, refKey, release } from '@osdlc/ref-lease'

import type { BranchLease, LeaseGrant } from '../ports.ts'
import { DEFAULT_REF_PREFIX, MAX_CAS_ATTEMPTS, withRefHint } from './ref-attempts.ts'

/** The ref holding the update lease of one head branch. */
export function lockRef(refPrefix: string, head: string): string {
  return refKey(`${refPrefix.replace(/\/+$/, '')}/lock/`, head)
}

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
  /** Default: `GITHUB_RUN_ID` when set, else `<hostname>:<pid>`. */
  holder?: string
  now?: () => Date
}

/**
 * `github-run-<id>` in Actions, else `<hostname>:<pid>`, plus a per-invocation suffix so two
 * processes of one run never share a holder.
 */
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

/** A payload with the wrong shape reads as a lease that has already expired. */
function decode(v: unknown): LeasePayload {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
  const valid = typeof o['holder'] === 'string' && typeof o['expiresAt'] === 'string'
  return {
    holder: valid ? (o['holder'] as string) : '',
    pr: typeof o['pr'] === 'number' ? o['pr'] : 0,
    startedAt: typeof o['startedAt'] === 'string' ? o['startedAt'] : '',
    expiresAt: valid ? (o['expiresAt'] as string) : new Date(0).toISOString(),
  }
}

export function refBranchLease(opts: RefBranchLeaseOptions): BranchLease {
  const { remote, cwd } = opts
  const refPrefix = opts.refPrefix ?? DEFAULT_REF_PREFIX
  const holder = opts.holder ?? defaultHolder()
  const now = opts.now ?? (() => new Date())

  return {
    acquire({ head, pr }): LeaseGrant {
      const ref = lockRef(refPrefix, head)
      try {
        const got = claim<LeasePayload>(remote, ref, {
          cwd,
          decode,
          attempts: MAX_CAS_ATTEMPTS,
          build: () => {
            const t = now()
            return {
              holder,
              pr,
              startedAt: t.toISOString(),
              expiresAt: new Date(t.getTime() + opts.ttlMs).toISOString(),
            }
          },
          isLive: (p) => Date.parse(p.expiresAt) > now().getTime(),
          isMine: (p) => p.holder === holder,
        })
        if (!got.won) return { ok: false, holder: got.payload.holder }
        return {
          ok: true,
          release() {
            try {
              release(remote, ref, got.sha, { cwd })
            } catch {
              // The remote went away. The lease ends by itself at `expiresAt`, and a failed
              // release must not hide the update's own result.
            }
          },
        }
      } catch (e) {
        // Every pass lost its swap: another run is taking this lease right now.
        if (e instanceof CasFailed) return { ok: false, holder: 'unknown' }
        throw withRefHint(e, remote)
      }
    },
  }
}
