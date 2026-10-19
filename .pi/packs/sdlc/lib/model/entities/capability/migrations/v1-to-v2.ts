/**
 * Pure-function transform from capability schema v1 to v2
 * ([[T-2KK8-capability-kind-grains-and-locations]], hosting [[T-SJH1]]'s
 * `contains` drop in the same combined bump).
 *
 * Consumes a parsed-frontmatter object plus the (unchanged) body and returns
 * the migrated pair. The third argument is the migrate runner's
 * `TransformContext` (`{ filePath }`): the `contains`-consistency check reads
 * the sibling capability files in the same directory, and `filePath` is how
 * it finds them. No writes — callers own writing the file.
 *
 * Contract:
 *
 *   - Returns a *new* frontmatter object; the input is not mutated. The body
 *     passes through byte-identical.
 *   - `kind: feature` → `audience: user`; `kind: technical` →
 *     `audience: system`; the v1 `kind` key is removed either way. The v2
 *     structural `kind` (11 grains) starts unset — regrading is follow-up
 *     triage, not migration.
 *   - `kind` absent → no `audience` written (v1 defaulted `kind` to
 *     `technical`, v2 defaults `audience` to `system`; the defaults agree).
 *   - `contains`, when present, is dropped ONLY after verifying it matches
 *     the children's `parent_key` inverses ([[T-SJH1]]): the set of ids it
 *     stores must equal the set of sibling capabilities whose `parent_key`
 *     targets this instance. Any mismatch — stored-but-not-derived or
 *     derived-but-not-stored — throws `MigrationError`; so does a `contains`
 *     with no `TransformContext` to verify against.
 *   - Stamps `schema_version: "2"` (string-typed, matching the schema).
 *   - Throws `MigrationError` for non-object frontmatter, an unrecognized v1
 *     `kind`, or a malformed `contains`.
 *
 * Export shape matches the entity migration loader convention: the module's
 * `migrate` is discovered by filename (`v1-to-v2.ts`) and invoked body-aware
 * (arity ≥ 2) so the runner passes the context through.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { split } from '@osdlc/frontmatter-lossless'

import { cmpStr } from '@lib/util/strings'
import { isRecord } from '@lib/util/guards'
import { repr, typeName } from '@lib/util/diagnostics'

import { MigrationError } from './errors.ts'
export { MigrationError }

export type Frontmatter = Record<string, unknown>

/** The migrate runner's context (structurally `ops/migrate.ts`'s
 *  `TransformContext`; re-declared here so the module stays import-light like
 *  its task-migration siblings). */
export interface TransformContext {
  filePath: string
}

// v1 audience-masquerading-as-structure values and their v2 audience.
const KIND_TO_AUDIENCE: Record<string, string> = {
  feature: 'user',
  technical: 'system',
}

const CAPABILITY_ID_RE = /C-[0-9A-Z]{4}/

/** Extract the C-NNNN id from a wikilink-ish string, or null. */
function capabilityIdOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = CAPABILITY_ID_RE.exec(value)
  return m ? m[0] : null
}

/**
 * Scan the sibling `.md` files of `filePath` (the corpus dir) and derive the
 * children of `selfId`: every sibling whose `parent_key` targets `selfId`.
 * Line-scans the frontmatter block for `id:` / `parent_key:` — deliberately
 * YAML-free (the framing comes from `@osdlc/frontmatter-lossless`, values from a
 * line scan), sufficient for the flat key: value shapes those two fields take
 * in capability instances.
 */
function deriveChildren(filePath: string, selfId: string): Set<string> {
  const corpusDir = dirname(filePath)
  const self = basename(filePath)
  const children = new Set<string>()
  for (const name of readdirSync(corpusDir)) {
    if (!name.endsWith('.md') || name === self) continue
    const full = join(corpusDir, name)
    if (!statSync(full).isFile()) continue
    let text: string
    try {
      text = readFileSync(full, 'utf-8')
    } catch {
      continue
    }
    const block = split(text).yaml
    if (block === null) continue
    const idLine = /^id:\s*(.+)$/m.exec(block)
    const parentLine = /^parent_key:\s*(.+)$/m.exec(block)
    if (!idLine || !parentLine) continue
    const siblingId = capabilityIdOf(idLine[1])
    const parentId = capabilityIdOf(parentLine[1])
    if (siblingId !== null && parentId === selfId) children.add(siblingId)
  }
  return children
}

/**
 * Verify `contains` matches the children's `parent_key` inverses, then
 * confirm it is droppable. Throws `MigrationError` on any inconsistency.
 */
function verifyContains(
  contains: unknown,
  fm: Frontmatter,
  ctx: TransformContext | undefined,
): void {
  if (!Array.isArray(contains)) {
    throw new MigrationError(
      `contains must be a list, got ${typeName(contains)}: ${repr(contains)}`,
    )
  }
  const stored = new Set<string>()
  for (const entry of contains) {
    const id = capabilityIdOf(entry)
    if (id === null) {
      throw new MigrationError(`contains entry is not a capability wikilink: ${repr(entry)}`)
    }
    stored.add(id)
  }

  if (ctx === undefined || typeof ctx.filePath !== 'string') {
    throw new MigrationError(
      "cannot verify contains against the children's parent_key inverses " +
        'without a file context; refusing to drop it unverified',
    )
  }
  const selfId = capabilityIdOf(fm['id'])
  if (selfId === null) {
    throw new MigrationError(
      `cannot verify contains: frontmatter id is not a capability id ` + `(got ${repr(fm['id'])})`,
    )
  }

  const derived = deriveChildren(ctx.filePath, selfId)
  const sorted = (s: Set<string>): string[] => [...s].sort(cmpStr)
  const missingFromContains = sorted(derived).filter((id) => !stored.has(id))
  const extraInContains = sorted(stored).filter((id) => !derived.has(id))
  if (missingFromContains.length > 0 || extraInContains.length > 0) {
    const parts: string[] = []
    if (extraInContains.length > 0) {
      parts.push(`listed but no child's parent_key points here: [${extraInContains.join(', ')}]`)
    }
    if (missingFromContains.length > 0) {
      parts.push(
        `children by parent_key but missing from contains: [${missingFromContains.join(', ')}]`,
      )
    }
    throw new MigrationError(
      `contains is inconsistent with the children's parent_key inverses ` +
        `for ${selfId} — ${parts.join('; ')}`,
    )
  }
}

/**
 * Migrate a v1 capability frontmatter object to v2.
 *
 * Returns `[newFrontmatter, body]`; does not mutate `fm`; `body` passes
 * through untouched.
 */
export function migrate(
  fm: Frontmatter,
  body: string,
  ctx?: TransformContext,
): [Frontmatter, string] {
  if (!isRecord(fm)) {
    throw new MigrationError(`frontmatter must be a mapping, got ${typeName(fm)}`)
  }

  const next: Frontmatter = { ...fm }

  // ---- kind → audience (the axis split) ----
  if (Object.prototype.hasOwnProperty.call(next, 'kind')) {
    const kind = next['kind']
    if (typeof kind !== 'string' || !(kind in KIND_TO_AUDIENCE)) {
      const known = Object.keys(KIND_TO_AUDIENCE).sort().map(repr)
      throw new MigrationError(
        `unrecognised v1 kind ${repr(kind)}; expected ${known.join(' or ')}` +
          ` — cannot migrate to v2`,
      )
    }
    next['audience'] = KIND_TO_AUDIENCE[kind] as string
    delete next['kind']
  }
  // kind absent: v1 defaulted to technical, v2 defaults audience to system —
  // the defaults agree, so nothing is written.

  // ---- contains drop ([[T-SJH1]]) ----
  if (Object.prototype.hasOwnProperty.call(next, 'contains')) {
    verifyContains(next['contains'], next, ctx)
    delete next['contains']
  }

  next['schema_version'] = '2'
  return [next, body]
}
