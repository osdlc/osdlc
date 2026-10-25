/**
 * Every key the terminal UI and the web view answer, in one table. The
 * terminal UI's footer and `?` screen, the web view's key help and the
 * `browse` command's help all read it, so a key is described in one place.
 *
 * The table describes keys; it does not dispatch them. Each surface maps the
 * bytes or `KeyboardEvent`s it receives itself.
 *
 * Browser-safe: no Node built-in, so the page imports it.
 */

/** The surface a key works on. */
export type KeySurface = 'tui' | 'web'

/**
 * The view a key works in. The terminal UI has `list`, `arguments` (the
 * entry line for a task's arguments), `settings` and `help`. The web view has
 * `list` and `arguments` (the run bar).
 */
export type KeyView = 'list' | 'arguments' | 'settings' | 'help'

/** One key, or a set of keys that do one thing. */
export interface KeyBinding {
  surface: KeySurface
  view: KeyView
  /** The keys as a person reads them: `enter`, `^y`, `shift+tab`. */
  keys: readonly string[]
  /** What it does, for a help screen. */
  action: string
  /** The footer's short form, such as `^y copy`. Absent: help only. */
  hint?: string | undefined
  /** The footer shows it at every width. */
  always?: boolean | undefined
  /** When the footer is short of room it drops the highest rank first. */
  rank?: number | undefined
}

/** The table. Within a view, in the order a help screen lists them. */
export const KEY_TABLE: readonly KeyBinding[] = Object.freeze([
  // The terminal UI's list.
  { surface: 'tui', view: 'list', keys: ['type'], action: 'narrow the list' },
  {
    surface: 'tui',
    view: 'list',
    keys: ['enter'],
    action: 'run the task, asking for arguments first; copy a skill',
    hint: 'enter run',
    rank: 1,
  },
  {
    surface: 'tui',
    view: 'list',
    keys: ['^y'],
    action: "copy the selected task's command line, or a skill's /name",
    hint: '^y copy',
    rank: 2,
  },
  {
    surface: 'tui',
    view: 'list',
    keys: ['tab', 'shift+tab'],
    action: 'next / previous tab: all, each runner, skills',
    hint: 'tab runner',
    rank: 3,
  },
  {
    surface: 'tui',
    view: 'list',
    keys: [','],
    action: 'settings: runners, discovery, excluded paths and trust',
    hint: ', settings',
    rank: 4,
  },
  {
    surface: 'tui',
    view: 'list',
    keys: ['^s'],
    action: 'trust this repository, after a y/n question',
    hint: '^s trust',
    rank: 5,
  },
  {
    surface: 'tui',
    view: 'list',
    keys: ['^r'],
    action: 'refresh: probe the repository again',
    hint: '^r refresh',
    rank: 6,
  },
  {
    surface: 'tui',
    view: 'list',
    keys: ['^t'],
    action: 'only services: tasks that run until you stop them',
    hint: '^t services',
    rank: 7,
  },
  {
    surface: 'tui',
    view: 'list',
    keys: ['^e'],
    action: 'exact search instead of fuzzy',
    hint: '^e exact',
    rank: 8,
  },
  {
    surface: 'tui',
    view: 'list',
    keys: ['^d'],
    action: 'only tasks a file declares, not inferred ones',
    hint: '^d declared',
    rank: 9,
  },
  {
    surface: 'tui',
    view: 'list',
    keys: ['^o'],
    action: 'scope: all, the root only, or at most 2 or 3 levels down',
    hint: '^o scope',
    rank: 10,
  },
  { surface: 'tui', view: 'list', keys: ['↑', '↓', '^p', '^n'], action: 'move by one row' },
  { surface: 'tui', view: 'list', keys: ['pgup', 'pgdn'], action: 'move by a screenful' },
  { surface: 'tui', view: 'list', keys: ['home', 'end', '^a'], action: 'first / last row' },
  {
    surface: 'tui',
    view: 'list',
    keys: ['backspace', '^u'],
    action: 'delete a character / clear the query',
  },
  {
    surface: 'tui',
    view: 'list',
    keys: ['?'],
    action: 'this list of keys',
    hint: '? help',
    always: true,
  },
  {
    surface: 'tui',
    view: 'list',
    keys: ['esc', '^c'],
    action: 'quit, stopping any probe that is running',
    hint: 'esc quit',
    always: true,
  },

  // The terminal UI's entry line for arguments.
  {
    surface: 'tui',
    view: 'arguments',
    keys: ['type'],
    action: 'the arguments; quotes group words as in sh',
  },
  {
    surface: 'tui',
    view: 'arguments',
    keys: ['enter'],
    action: 'run with what you typed, which may be nothing',
    hint: 'enter run',
    always: true,
  },
  {
    surface: 'tui',
    view: 'arguments',
    keys: ['backspace', '^u'],
    action: 'delete a character / clear the line',
  },
  {
    surface: 'tui',
    view: 'arguments',
    keys: ['esc'],
    action: 'back to the list; nothing runs',
    hint: 'esc back',
    always: true,
  },

  // The terminal UI's settings screen.
  { surface: 'tui', view: 'settings', keys: ['↑', '↓'], action: 'move between settings' },
  { surface: 'tui', view: 'settings', keys: ['pgup', 'pgdn'], action: 'move by a screenful' },
  {
    surface: 'tui',
    view: 'settings',
    keys: ['space', 'enter'],
    action: 'turn a runner on or off, or change discovery',
    hint: 'space change',
    rank: 1,
  },
  {
    surface: 'tui',
    view: 'settings',
    keys: ['[', ']'],
    action: 'move a runner earlier / later in the order',
    hint: '[ ] order',
    rank: 3,
  },
  {
    surface: 'tui',
    view: 'settings',
    keys: ['a'],
    action: 'add an excluded path',
    hint: 'a add path',
    rank: 2,
  },
  {
    surface: 'tui',
    view: 'settings',
    keys: ['x'],
    action: 'remove the selected excluded path',
    hint: 'x remove',
    rank: 4,
  },
  {
    surface: 'tui',
    view: 'settings',
    keys: ['t', 'u'],
    action: 'trust the repository or the selected tool (after a y/n question) / remove it',
    hint: 't/u trust',
    rank: 5,
  },
  { surface: 'tui', view: 'settings', keys: ['?'], action: 'the list of keys', hint: '? help' },
  {
    surface: 'tui',
    view: 'settings',
    keys: ['esc', ','],
    action: 'back to the list',
    hint: 'esc back',
    always: true,
  },

  // The terminal UI's help screen.
  { surface: 'tui', view: 'help', keys: ['↑', '↓', 'pgup', 'pgdn'], action: 'scroll' },
  {
    surface: 'tui',
    view: 'help',
    keys: ['esc', '?'],
    action: 'close this screen',
    hint: 'esc back',
    always: true,
  },

  // The web view.
  { surface: 'web', view: 'list', keys: ['/'], action: 'search' },
  {
    surface: 'web',
    view: 'list',
    keys: ['enter'],
    action: 'copy the top hit, or the focused task',
  },
  {
    surface: 'web',
    view: 'list',
    keys: ['shift+enter'],
    action: 'run the top hit, or the focused task',
  },
  { surface: 'web', view: 'list', keys: ['↑', '↓'], action: 'move through the tasks' },
  { surface: 'web', view: 'list', keys: ['esc'], action: 'back to search; again to clear it' },
  { surface: 'web', view: 'list', keys: ['?'], action: 'this help' },
  { surface: 'web', view: 'arguments', keys: ['enter'], action: 'run with what you typed' },
  { surface: 'web', view: 'arguments', keys: ['esc'], action: 'close the run bar; nothing runs' },
] satisfies KeyBinding[])

/** The keys of one view on one surface, in table order. */
export function keysFor(surface: KeySurface, view: KeyView): KeyBinding[] {
  return KEY_TABLE.filter((k) => k.surface === surface && k.view === view)
}

/**
 * The footer for `bindings` in at most `width` columns: every hint marked
 * `always`, then the others by rank while they fit, shown in table order and
 * joined by `separator`. A hint is plain ASCII or one column per character,
 * so its length is its width.
 */
export function footerHints(
  bindings: readonly KeyBinding[],
  width: number,
  separator = '  ',
): string {
  const hinted = bindings.filter((k) => k.hint !== undefined)
  const kept = new Set(hinted.filter((k) => k.always === true))
  const widthOf = (set: Set<KeyBinding>): number =>
    [...set].reduce((n, k) => n + k.hint!.length, 0) + Math.max(0, set.size - 1) * separator.length
  const optional = hinted
    .filter((k) => k.always !== true)
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
  for (const k of optional) {
    kept.add(k)
    if (widthOf(kept) > width) kept.delete(k)
  }
  return hinted
    .filter((k) => kept.has(k))
    .map((k) => k.hint!)
    .join(separator)
}

/** The key names of a binding as one column: `tab, shift+tab`. */
export function keyNames(binding: KeyBinding): string {
  return binding.keys.join(', ')
}

/**
 * The keys of one view as aligned text lines, `  enter   run the selected
 * task`, for a help screen or `--help`.
 */
export function keyLines(surface: KeySurface, view: KeyView, indent = '  '): string[] {
  const rows = keysFor(surface, view)
  const pad = Math.max(...rows.map((k) => keyNames(k).length))
  return rows.map((k) => `${indent}${keyNames(k).padEnd(pad)}  ${k.action}`)
}
