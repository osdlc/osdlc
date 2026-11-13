/** The top-level switch: the component graph or the work map. */
export type AppView = 'components' | 'work'
export type WorkLevel = 'overview' | 'detail'

export const APP_VIEW_LABEL: Record<AppView, string> = { components: 'Components', work: 'Work' }
export const WORK_LEVEL_LABEL: Record<WorkLevel, string> = { overview: 'Milestones', detail: 'Tasks' }

/** What the URL hash holds. A node id is raw: either member of a twin pair names its card. */
export type Route =
  | { view: 'components'; node: string | null }
  | { view: 'work'; level: WorkLevel; task: number | null; milestone: string | null }

/**
 * Reads `#node=<id>` (Components) or `#view=work[&level=overview][&task=<n> | &milestone=<id>]`.
 * Anything else is the Components view with nothing selected.
 */
export function parseHash(hash: string): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (params.get('view') === 'work') {
    const taskText = params.get('task')
    const task = taskText !== null && /^\d+$/.test(taskText) ? Number(taskText) : null
    return {
      view: 'work',
      level: params.get('level') === 'overview' ? 'overview' : 'detail',
      task,
      milestone: task === null ? params.get('milestone') || null : null,
    }
  }
  return { view: 'components', node: params.get('node') || null }
}

export function formatHash(route: Route): string {
  if (route.view === 'components') return route.node === null ? '' : `#node=${encodeURIComponent(route.node)}`
  let hash = '#view=work'
  if (route.level === 'overview') hash += '&level=overview'
  if (route.task !== null) hash += `&task=${route.task}`
  else if (route.milestone !== null) hash += `&milestone=${encodeURIComponent(route.milestone)}`
  return hash
}
