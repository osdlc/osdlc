/**
 * Every action the terminal UI and the web view offer, and the command that
 * does the same thing. A script or an agent never has to drive a UI: each
 * row names the command. `tests/actions.test.ts` checks that every command
 * and flag named here exists in the command tree.
 *
 * Browser-safe: no Node built-in.
 */

/** One action, where each surface offers it, and its command. */
export interface SurfaceAction {
  /** What the person does. */
  action: string
  /** The terminal UI's key, or null when it has none. */
  tui: string | null
  /** The web view's control, or null when it has none. */
  web: string | null
  /** The command words, such as `['trust']` or `['config', 'set']`. */
  command: readonly string[]
  /** The flags it takes for this action, by their JSON names (`untrust`, `scope`). */
  flags: readonly string[]
}

/** The table. */
export const SURFACE_ACTIONS: readonly SurfaceAction[] = Object.freeze([
  { action: 'browse', tui: 'the list', web: 'the list', command: ['list'], flags: [] },
  {
    action: 'search',
    tui: 'type, ^e exact',
    web: 'search box, Fuzzy / Exact',
    command: ['query'],
    flags: ['exact'],
  },
  { action: 'services only', tui: '^t', web: 'Services', command: ['list'], flags: ['services'] },
  { action: 'declared only', tui: '^d', web: 'Declared', command: ['list'], flags: ['declared'] },
  { action: 'scope', tui: '^o', web: 'Scope', command: ['list'], flags: ['depth'] },
  {
    action: 'one runner, hide runners',
    tui: 'tab',
    web: 'tabs, Runners',
    command: ['list'],
    flags: ['only', 'exclude'],
  },
  {
    action: 'reorder runners',
    tui: 'settings [ ]',
    web: 'drag a tab',
    command: ['config', 'set'],
    flags: ['user'],
  },
  {
    action: 'run, with arguments',
    tui: 'enter',
    web: 'run, Shift+Enter',
    command: ['run'],
    flags: [],
  },
  { action: 'copy a command', tui: '^y', web: 'copy, Enter', command: ['list'], flags: [] },
  { action: 'refresh', tui: '^r', web: 'Refresh', command: ['list'], flags: [] },
  {
    action: 'trust the repository',
    tui: '^s',
    web: 'Trust this repository',
    command: ['trust'],
    flags: [],
  },
  {
    action: 'trust one tool',
    tui: 'settings t',
    web: 'settings, Trust',
    command: ['trust'],
    flags: ['scope'],
  },
  {
    action: 'untrust',
    tui: 'settings u',
    web: 'settings, Untrust',
    command: ['trust'],
    flags: ['untrust', 'scope'],
  },
  { action: 'view settings', tui: ',', web: 'settings', command: ['config', 'list'], flags: [] },
  {
    action: 'edit a setting',
    tui: 'settings',
    web: 'settings, Save',
    command: ['config', 'set'],
    flags: ['user', 'project'],
  },
  { action: 'theme', tui: null, web: 'theme button', command: ['config', 'set'], flags: ['user'] },
  {
    action: 'runner info',
    tui: 'detail line, settings',
    web: 'i',
    command: ['providers'],
    flags: [],
  },
  {
    action: 'skills: list, search, copy /name',
    tui: 'Skills tab',
    web: 'Skills tab',
    command: ['query'],
    flags: [],
  },
  {
    action: 'withheld runners and why',
    tui: 'status line',
    web: 'trust bar',
    command: ['list'],
    flags: [],
  },
  { action: 'help', tui: '?', web: '?', command: ['help'], flags: [] },
])
