import { membersInView } from './filters'
import type { DisplayNode } from './twins'
import type { Change, EcoNode, Language, Repo, State, ViewMode } from './types'
import { CHANGE_LABEL, changeOf, languageName, movesRepo, repoInView, repoLabel } from './view'

export type Logo = 'typescript' | 'rust' | 'markdown' | 'yaml'

const LOGO: Record<Language, Logo | null> = {
  ts: 'typescript',
  rust: 'rust',
  markdown: 'markdown',
  yaml: 'yaml',
  none: null,
}

export function logoOf(language: string): Logo | null {
  return LOGO[language as Language] ?? null
}

/** One member's logo on a card, with a badge when that member differs from the card. */
export interface CardMember {
  id: string
  logo: Logo | null
  /** The language in words, for the logo's accessible label. */
  languageName: string
  badge: { mark: string; text: string } | null
}

/** The parts of a card that come from the data and the view, not from selection or search. */
export interface CardFace {
  title: string
  subtitle: string | null
  kind: string
  members: CardMember[]
  change: Change
  repo: string
  /** Index of the repo in `repos`, for its colour stripe; -1 when unknown. */
  repoIndex: number
  move: { from: string; to: string } | null
  /** Both versions when a twin card's members differ, else null. */
  versions: string | null
}

/** Change colouring only applies in Compare; a single-state view draws everything neutral. */
export function changeInView(states: readonly State[], view: ViewMode): Change {
  return view === 'compare' ? changeOf(states) : 'both'
}

/**
 * A twin card's title is the TypeScript name with the crate's name under it, or "name (TS + Rust)"
 * when the names match. A view that holds only one member shows that member's name alone.
 */
export function titleOf(members: readonly EcoNode[]): { title: string; subtitle: string | null } {
  const [first, second] = members
  if (!first) return { title: '', subtitle: null }
  if (!second) return { title: first.name, subtitle: null }
  if (first.name === second.name) return { title: `${first.name} (TS + Rust)`, subtitle: null }
  return { title: first.name, subtitle: second.name }
}

function memberBadge(member: EcoNode, shown: readonly EcoNode[], cardChange: Change, view: ViewMode, repos: readonly Repo[]) {
  if (view !== 'compare' || shown.length < 2) return null
  const change = changeOf(member.states)
  if (change !== cardChange) {
    return { mark: change === 'added' ? '+' : '−', text: `${member.name}: ${CHANGE_LABEL[change]}` }
  }
  const others = shown.filter((other) => other !== member)
  if (movesRepo(member) && others.some((other) => !movesRepo(other))) {
    const from = repoLabel(repos, member.repo.present)
    const to = repoLabel(repos, member.repo.target)
    return { mark: '⇢', text: `${member.name} moves from ${from} to ${to}` }
  }
  return null
}

export function cardFace(node: DisplayNode, view: ViewMode, repos: readonly Repo[]): CardFace {
  const shown = membersInView(node, view)
  const change = changeInView(node.states, view)
  const repoIds = repos.map((repo) => repo.id)
  const memberRepos = [...new Set(shown.map((member) => repoInView(member, view)))]
  const repo = memberRepos[0] ?? null
  const moving = view === 'compare' ? shown.find(movesRepo) : undefined
  const versions = shown.map((member) => member.version ?? 'none')
  return {
    ...titleOf(shown),
    kind: [...new Set(shown.map((member) => member.kind))].join(' + '),
    members: shown.map((member) => ({
      id: member.id,
      logo: logoOf(member.language),
      languageName: languageName(member.language),
      badge: memberBadge(member, shown, change, view, repos),
    })),
    change,
    repo: memberRepos.map((id) => repoLabel(repos, id)).join(' / '),
    repoIndex: repo === null ? -1 : repoIds.indexOf(repo),
    move: moving
      ? { from: repoLabel(repos, moving.repo.present), to: repoLabel(repos, moving.repo.target) }
      : null,
    versions: shown.length > 1 && new Set(versions).size > 1 ? versions.join(' / ') : null,
  }
}

/** The title plus the members' languages, for a tooltip and screen readers. */
export function cardLabel(face: CardFace): string {
  const languages = face.members.map((member) => member.languageName).join(' and ')
  const name = face.subtitle ? `${face.title}, ${face.subtitle}` : face.title
  return languages ? `${name} (${languages})` : name
}
