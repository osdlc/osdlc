/**
 * The generated per-entity CLI verbs. Each kind declares its `EntityNoun` in
 * `<type>/noun.ts`; `ENTITY_NOUNS` collects them, keyed like `ENTITY_SCHEMAS`.
 * `registerEntityNouns` builds them; kind-specific verbs stay hand-written
 * under `<type>/ops/`.
 */

import { defineCreateOp, type CreateOpSpec } from '@lib/model/ops/_create'
import { definePreviewIdOp } from '@lib/model/ops/_preview_id'
import { defineReadOps } from '@lib/model/ops/_reads'
import { defineUpdateOp } from '@lib/model/ops/_update'
import { defineNoun, OpDefinitionError, reregister, type RegistryEntry } from '@lib/registry'

import { BacklogNoun } from './backlog/noun.ts'
import { CapabilityNoun } from './capability/noun.ts'
import { DecisionNoun } from './decision/noun.ts'
import { DriverNoun } from './driver/noun.ts'
import { FrictionNoun } from './friction/noun.ts'
import { MilestoneNoun } from './milestone/noun.ts'
import { NoteNoun } from './note/noun.ts'
import { PrincipleNoun } from './principle/noun.ts'
import { ProductNoun } from './product/noun.ts'
import { ReferenceNoun } from './reference/noun.ts'
import { RoadmapNoun } from './roadmap/noun.ts'
import { StandardNoun } from './standard/noun.ts'
import { TaskNoun } from './task/noun.ts'
import { TermNoun } from './term/noun.ts'

export interface EntityNoun {
  /** One-line noun summary for `sdlc --help`; must be a prefix of the `^summary` bullet in `definition.md`. */
  summary?: string
  /** `<type> create`, built by `defineCreateOp`; a slugged identity adds `<type> preview-id`. */
  create?: Omit<CreateOpSpec, 'type'>
  /** `<type> update`, built by `defineUpdateOp`. */
  update?: true
  /** `<type> list|get|search|related`, built by `defineReadOps`. */
  reads?: true
}

export const ENTITY_NOUNS: Readonly<Record<string, EntityNoun>> = {
  backlog: BacklogNoun,
  capability: CapabilityNoun,
  decision: DecisionNoun,
  driver: DriverNoun,
  friction: FrictionNoun,
  milestone: MilestoneNoun,
  note: NoteNoun,
  principle: PrincipleNoun,
  product: ProductNoun,
  reference: ReferenceNoun,
  roadmap: RoadmapNoun,
  standard: StandardNoun,
  task: TaskNoun,
  term: TermNoun,
}

type CreateOp = ReturnType<typeof defineCreateOp>
type UpdateOp = ReturnType<typeof defineUpdateOp>
type PreviewIdOp = ReturnType<typeof definePreviewIdOp>
type ReadOps = ReturnType<typeof defineReadOps>
type NounOp = CreateOp | UpdateOp | PreviewIdOp | ReadOps[keyof ReadOps]

let built: Map<string, NounOp> | null = null

/**
 * Build the verb descriptors and register each noun summary, once.
 * `defineNoun` throws on a duplicate noun, so this must not run twice.
 */
function nounOps(): Map<string, NounOp> {
  if (built !== null) return built
  const ops = new Map<string, NounOp>()
  for (const [type, noun] of Object.entries(ENTITY_NOUNS)) {
    if (noun.summary) defineNoun({ noun: type, summary: noun.summary })
    if (noun.create) ops.set(`${type} create`, defineCreateOp({ type, ...noun.create }))
    if (noun.update) ops.set(`${type} update`, defineUpdateOp(type))
    if (noun.create?.identity.kind === 'slugged') {
      ops.set(`${type} preview-id`, definePreviewIdOp(type))
    }
    if (noun.reads) {
      for (const [verb, op] of Object.entries(defineReadOps(type))) ops.set(`${type} ${verb}`, op)
    }
  }
  built = ops
  return built
}

/**
 * Register every `ENTITY_NOUNS` verb. Idempotent: a later call re-registers
 * the same descriptors, so a cleared registry can be refilled.
 *
 * @throws OpDefinitionError when another op already holds one of the keys.
 */
export function registerEntityNouns(): RegistryEntry[] {
  const ops = [...nounOps().values()] as RegistryEntry[]
  for (const op of ops) {
    const problem = reregister(op)
    if (problem !== null) throw new OpDefinitionError(problem)
  }
  return ops
}

/** The built descriptor for one generated verb; throws if the kind lacks it. */
export function entityNounOp(type: string, verb: 'create'): CreateOp
export function entityNounOp(type: string, verb: 'update'): UpdateOp
export function entityNounOp(type: string, verb: 'preview-id'): PreviewIdOp
export function entityNounOp(type: string, verb: string): NounOp {
  const op = nounOps().get(`${type} ${verb}`)
  if (op === undefined) throw new Error(`no generated '${verb}' verb for entity '${type}'`)
  return op
}
