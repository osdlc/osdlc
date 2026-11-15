import type { Change, EcoNode, Repo, State, ViewMode } from './types'

export function changeOf(states: readonly State[]): Change {
  const present = states.includes('present')
  const target = states.includes('target')
  if (present && target) return 'both'
  return present ? 'removed' : 'added'
}

export function inView(states: readonly State[], view: ViewMode): boolean {
  return view === 'compare' || states.includes(view)
}

export const CHANGE_LABEL: Record<Change, string> = {
  both: 'both',
  removed: 'going away',
  added: 'new',
}

export const VIEW_LABEL: Record<ViewMode, string> = {
  present: 'Present',
  target: 'Target',
  compare: 'Compare',
}

/** True when the node exists in both states under different repos. */
export function movesRepo(node: EcoNode): boolean {
  const { present, target } = node.repo
  return present !== null && target !== null && present !== target
}

/**
 * The repo to show for a node in a view: the target's in Compare, or the present's for a node that
 * is going away. Null means the node is absent from that state or its repo is not decided; check
 * `states` to tell which.
 */
export function repoInView(node: EcoNode, view: ViewMode): string | null {
  if (view !== 'compare') return node.repo[view]
  return node.states.includes('target') ? node.repo.target : node.repo.present
}

export const REPO_NOT_DECIDED = 'repo not decided'

/** Every repo id a node lives in, across both states. */
export function reposOf(node: EcoNode): string[] {
  const ids = [node.repo.present, node.repo.target].filter((id): id is string => id !== null)
  return [...new Set(ids)]
}

/** A repo's short label. Only call it with null for a state the node is in. */
export function repoLabel(repos: readonly Repo[], id: string | null): string {
  if (id === null) return REPO_NOT_DECIDED
  return repos.find((repo) => repo.id === id)?.label ?? id
}

export const LANGUAGE_LABEL: Record<string, string> = {
  ts: 'TS',
  rust: 'Rust',
  yaml: 'YAML',
  markdown: 'Markdown',
  none: '—',
}

const LANGUAGE_NAME: Record<string, string> = {
  ts: 'TypeScript',
  rust: 'Rust',
  yaml: 'YAML',
  markdown: 'Markdown',
}

/** The language in full words, for accessible labels. Empty for no language. */
export function languageName(language: string): string {
  return LANGUAGE_NAME[language] ?? ''
}

export function languageLabel(language: string): string {
  return LANGUAGE_LABEL[language] ?? language
}

