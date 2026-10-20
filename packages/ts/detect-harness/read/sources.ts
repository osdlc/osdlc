/**
 * Location lookup and source bookkeeping shared by the built-in providers.
 *
 * Runtime-agnostic: pure over the {@link ProviderContext}.
 */

import type { JsonRead, ProviderContext, TextRead } from '../contract.ts'
import type { BuiltinHarnessId } from '../harnesses.ts'
import {
  resolveBases,
  resolveLocations,
  type LocationContext,
  type LocationRole,
  type ResolvedLocation,
  type Scope,
} from '../locations.ts'
import type { ConfigDir, Diagnostic, Source } from '../report.ts'

/** Settings-scope precedence; higher wins: managed > local > project > user. */
export const SCOPE_RANK: Readonly<Record<Scope, number>> = {
  user: 1,
  project: 2,
  local: 3,
  managed: 4,
}

/** The scopes `ctx.mode` may read. */
export function scopesFor(ctx: ProviderContext): readonly Scope[] {
  return ctx.mode === 'project' ? ['project', 'local'] : ['managed', 'user', 'project', 'local']
}

export function locationContext(ctx: ProviderContext): LocationContext {
  return {
    home: ctx.home,
    env: ctx.env,
    platform: ctx.platform,
    systemRoot: ctx.systemRoot,
    projectRoot: ctx.projectRoot,
  }
}

/** A resolved location with its path known. */
export type Located = ResolvedLocation & { resolved: string }

/** The locations of `harness` with `role` that this mode may read, resolved, in table order. */
export function locate(
  ctx: ProviderContext,
  harness: BuiltinHarnessId,
  role: LocationRole,
): Located[] {
  const scopes = scopesFor(ctx)
  return resolveLocations(harness, locationContext(ctx)).filter(
    (l): l is Located => l.role === role && l.resolved !== null && scopes.includes(l.scope),
  )
}

/** The harness's base folders, with existence; none in `project` mode. */
export function configDirs(ctx: ProviderContext, harness: BuiltinHarnessId): ConfigDir[] {
  if (ctx.mode === 'project') return []
  return resolveBases(harness, locationContext(ctx)).flatMap((b) =>
    b.path === null
      ? []
      : [{ name: b.name, path: b.path, envVar: b.envVar, exists: ctx.isDirectory(b.path) }],
  )
}

/** Collects the sources and diagnostics of one provider run. */
export class SourceLog {
  readonly sources: Source[] = []
  readonly diagnostics: Diagnostic[] = []
  private readonly seen = new Set<string>()

  /** Record a read once per path and kind; an error also becomes a warning. */
  record(
    path: string,
    scope: Scope,
    kind: string,
    read: JsonRead | TextRead,
    rank: number | null = null,
  ): void {
    const key = `${kind}\u0000${path}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    const error = read.status === 'error' ? read.error : null
    this.sources.push({ path, scope, kind, status: read.status, error, rank })
    if (error !== null) this.warn(`${path}: ${error}`, path)
  }

  warn(message: string, source: string | null = null): void {
    this.diagnostics.push({ severity: 'warning', message, source })
  }

  /** Read a JSON location and record it. The value when it parsed, else `null`. */
  json(
    ctx: ProviderContext,
    loc: Located,
    rank: number | null = null,
  ): Record<string, unknown> | null {
    const read = ctx.readJson(loc.resolved)
    this.record(loc.resolved, loc.scope, loc.role, read, rank)
    return read.status === 'parsed' ? read.value : null
  }
}
