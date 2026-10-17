/**
 * The per-entity `markdown-contract` registry — `type → Contract`.
 *
 * Sibling to `_registry.ts` (which maps `type → Zod frontmatter schema`); this
 * one maps `type → Contract`, where each contract pairs that same Zod schema (its
 * frontmatter plane) with the entity's body grammar + content leaves. It is the
 * single lookup `entities validate` / `audit` / `authoring` route through,
 * replacing the retired presence-only `body-schema.yaml` body check.
 *
 * One contract per entity type, co-located at `<type>/schema.ts` (exported
 * alongside that type's Zod frontmatter schema).
 */
import type { Contract } from 'markdown-contract'

import { BacklogContract } from './backlog/schema.ts'
import { CapabilityContract } from './capability/schema.ts'
import { DecisionContract } from './decision/schema.ts'
import { DriverContract } from './driver/schema.ts'
import { FrictionContract } from './friction/schema.ts'
import { MilestoneContract } from './milestone/schema.ts'
import { NoteContract } from './note/schema.ts'
import { PrincipleContract } from './principle/schema.ts'
import { ProductContract } from './product/schema.ts'
import { ReferenceContract } from './reference/schema.ts'
import { RoadmapContract } from './roadmap/schema.ts'
import { StandardContract } from './standard/schema.ts'
import { TaskContract } from './task/schema.ts'
import { TermContract } from './term/schema.ts'

/** Entity type → its full two-plane contract. */
const CONTRACTS: Readonly<Record<string, Contract>> = {
  backlog: BacklogContract,
  capability: CapabilityContract,
  decision: DecisionContract,
  driver: DriverContract,
  friction: FrictionContract,
  milestone: MilestoneContract,
  note: NoteContract,
  principle: PrincipleContract,
  product: ProductContract,
  reference: ReferenceContract,
  roadmap: RoadmapContract,
  standard: StandardContract,
  task: TaskContract,
  term: TermContract,
}

/** The contract for `type`, or `undefined` when no contract is registered. */
export function contractForType(type: string): Contract | undefined {
  return CONTRACTS[type]
}

/** Every entity type that has a registered contract, sorted. */
export function entityTypesWithContracts(): string[] {
  return Object.keys(CONTRACTS).sort()
}
