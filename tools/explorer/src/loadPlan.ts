import { emptyPlan, parsePlan, type Plan } from './model/plan'

// Bundled at build time. A glob, so a missing plan.json leaves the Work view empty instead of failing.
const modules = import.meta.glob<unknown>('../data/plan.json', { eager: true, import: 'default' })

export interface LoadedPlan {
  found: boolean
  plan: Plan
  problems: string[]
}

export function loadPlan(): LoadedPlan {
  const raw = Object.values(modules)[0]
  if (raw === undefined) return { found: false, plan: emptyPlan(), problems: [] }
  return { found: true, ...parsePlan(raw) }
}
