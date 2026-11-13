import { describe, expect, it } from 'vitest'
import { parseEcosystem } from '../src/model/data'
import { parsePlan } from '../src/model/plan'
import { indexPlan, milestoneDeps } from '../src/model/work'
import { detailLayout, taskNodeId } from '../src/model/workLayout'

// Checks the real plan against data/PLAN-SCHEMA.md whenever it is present.
const planModules = import.meta.glob<unknown>('../data/plan.json', { eager: true, import: 'default' })
const ecoModules = import.meta.glob<unknown>('../data/ecosystem.json', { eager: true, import: 'default' })
const raw = Object.values(planModules)[0]
const rawEco = Object.values(ecoModules)[0]

describe.skipIf(raw === undefined)('data/plan.json', () => {
  it('follows the PLAN-SCHEMA.md rules', () => {
    expect(parsePlan(raw).problems).toEqual([])
  })

  it('places every task, with no milestone cycle', () => {
    const index = indexPlan(parsePlan(raw).plan)
    const layout = detailLayout(index)
    for (const task of index.plan.tasks) expect(layout.positions[taskNodeId(task.id)], `task ${task.id}`).toBeDefined()
    expect(milestoneDeps(index).length).toBeGreaterThan(0)
  })

  it.skipIf(rawEco === undefined)('names only plan tasks in ecosystem.json', () => {
    const ids = new Set(parsePlan(raw).plan.tasks.map((t) => t.id))
    const unknown = parseEcosystem(rawEco).eco.nodes.flatMap((n) => n.tasks.filter((t) => !ids.has(t)).map((t) => `${n.id}: ${t}`))
    expect(unknown).toEqual([])
  })
})
