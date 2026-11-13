import { computed, reactive, shallowRef } from 'vue'
import type { Plan } from '../model/plan'
import type { WorkLevel } from '../model/route'
import { indexPlan, milestoneDeps, nextUpIds } from '../model/work'
import { emptyWorkFilters, visibleWork, workFacets } from '../model/workFilters'
import { toWorkFlow, workHeading, type WorkSelection } from '../model/workFlow'
import {
  MILESTONE_HEIGHT,
  MILESTONE_WIDTH,
  detailLayout,
  milestoneNodeId,
  overviewLayout,
  parseWorkNodeId,
  taskNodeId,
  workBounds,
} from '../model/workLayout'

/** The Work view's state: level, filters, selection and what to draw. The plan never changes. */
export function useWorkView(plan: Plan) {
  const index = indexPlan(plan)
  const deps = milestoneDeps(index)
  const facets = workFacets(index)
  const nextUp = nextUpIds(index)
  const layouts = { detail: detailLayout(index), overview: overviewLayout(index, deps) }

  const level = shallowRef<WorkLevel>('detail')
  const filters = reactive(emptyWorkFilters())
  const selection = shallowRef<WorkSelection>(null)
  const reveal = shallowRef(0)

  const layout = computed(() => layouts[level.value])
  // The first view: the start lanes in the detailed level, everything in the overview.
  const bounds = computed(() => layout.value.start ?? workBounds(layout.value, { width: MILESTONE_WIDTH, height: MILESTONE_HEIGHT }))
  const visible = computed(() => visibleWork(index, filters))
  const flow = computed(() =>
    toWorkFlow({
      index,
      deps,
      layout: layout.value,
      level: level.value,
      visible: visible.value,
      selection: selection.value,
      highlightNext: filters.nextUp,
    }),
  )
  const revealId = computed(() => {
    const current = selection.value
    if (current?.type === 'task') return level.value === 'detail' ? taskNodeId(current.id) : null
    return current ? milestoneNodeId(current.id) : null
  })
  const heading = computed(() => workHeading(index, selection.value))

  /** Selects a task; the overview has no task cards, so it switches to the detailed level. */
  function selectTask(id: number, options: { reveal?: boolean } = {}) {
    if (!index.task.has(id)) return
    selection.value = { type: 'task', id }
    level.value = 'detail'
    if (options.reveal) reveal.value++
  }

  function selectMilestone(id: string, options: { reveal?: boolean } = {}) {
    if (!index.milestone.has(id)) return
    selection.value = { type: 'milestone', id }
    if (options.reveal) reveal.value++
  }

  /** A click or Enter on a card in the graph. */
  function selectNode(nodeId: string) {
    const target = parseWorkNodeId(nodeId)
    if (target?.type === 'task') selectTask(target.id)
    else if (target?.type === 'milestone') selectMilestone(target.id)
  }

  function clear() {
    selection.value = null
  }

  return {
    index,
    deps,
    facets,
    nextUp,
    level,
    filters,
    selection,
    reveal,
    layout,
    bounds,
    flow,
    revealId,
    heading,
    selectTask,
    selectMilestone,
    selectNode,
    clear,
  }
}
