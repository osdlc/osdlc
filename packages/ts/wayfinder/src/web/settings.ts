/**
 * The settings screen: this project's configuration, and edits to it.
 *
 * Edits are staged. Nothing is written until Save. The project config is a
 * committed file, so a click must not silently change someone's working tree.
 *
 * It is not the runner picker. The picker in the header filters this session
 * and is then forgotten. This screen sets which runners the project uses.
 *
 * Sections follow the config schema's key order (runners, execution,
 * discovery, excluded paths), so the screen reads like the file it describes.
 *
 * Its state lives here, not in `state.ts`. The staged edits belong to the
 * dialog and mean nothing once it closes. In the page-wide `AppState`, every
 * user of that state would carry a field about a screen it never opens.
 */

import { getConfig, saveConfig, trustRepo, untrustRepo, type ConfigResponse } from './api.ts'
import { clearRunnerOrder, restoreRunnerOrder, state } from './state.ts'
import { escapeHtml, render } from './view.ts'

/** What the server last told us the configuration is. */
let loaded: ConfigResponse | null = null

/** Runner ids the catalog reported. The config alone cannot supply them. */
let knownRunners: readonly string[] = []

/**
 * Edits not yet written, by dotted key. Empty means nothing is unsaved. This
 * is the only unsaved-changes test, since a separate boolean could disagree.
 */
let staged: Record<string, unknown> = {}

/** A message from the last Save, shown until the next render clears it. */
let notice: { kind: 'err' | 'ok'; text: string } | null = null

// ------------------------------------------------------------------ values

/** The value a key would have if Save were pressed now. */
function valueOf(key: string): unknown {
  if (key in staged) return staged[key]
  const effective = loaded?.effective ?? {}
  // Dotted, because that is how the config names its keys and how the patch
  // will be sent.
  let cursor: unknown = effective
  for (const segment of key.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

function stringsAt(key: string): string[] {
  const value = valueOf(key)
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * Stage a value, or drop the edit when it matches what the file already says.
 *
 * Dropping matters: toggling a checkbox and toggling it back should leave the
 * screen clean, not offer to save a no-op.
 */
function stage(key: string, value: unknown): void {
  const original = (() => {
    const before = staged
    staged = {}
    const v = valueOf(key)
    staged = before
    return v
  })()
  if (JSON.stringify(original) === JSON.stringify(value)) delete staged[key]
  else staged[key] = value
}

function isDirty(): boolean {
  return Object.keys(staged).length > 0
}

// ------------------------------------------------------------------ render

/** Where a value came from, said the way `way config list` says it. */
function layerNote(key: string): string {
  if (key in staged) {
    return '<span class="set-layer" data-layer="staged">unsaved</span>'
  }
  const layer = loaded?.sources[key] ?? 'default'
  const where =
    layer === 'project' ? 'this project' : layer === 'user' ? 'your user config' : 'the default'
  return '<span class="set-layer" data-layer="' + layer + '">' + escapeHtml(where) + '</span>'
}

function section(title: string, key: string, body: string): string {
  return (
    '<section class="set-section">' +
    '<h3>' +
    escapeHtml(title) +
    layerNote(key) +
    '</h3>' +
    body +
    '</section>'
  )
}

function runnersSection(): string {
  // The order saved in this browser, which is separate from `runners.order`
  // and overrides it. Read here so the section can say whether one is set.
  const localOrder = restoreRunnerOrder()
  const disabled = new Set(stringsAt('runners.disabled'))
  // Every runner the catalog knows, plus any named in `disabled`. A disabled
  // runner is not collected, so listing only collected runners would hide
  // the rows this section exists to show.
  const names = [...new Set([...knownRunners, ...disabled])].sort()
  const rows = names
    .map((name) => {
      const on = !disabled.has(name)
      return (
        '<tr><td><input type="checkbox" data-set-runner="' +
        escapeHtml(name) +
        '"' +
        (on ? ' checked' : '') +
        ' aria-label="Collect ' +
        escapeHtml(name) +
        '" /></td>' +
        '<td><code>' +
        escapeHtml(name) +
        '</code></td>' +
        '<td class="set-state">' +
        (on ? 'collected' : 'not collected') +
        '</td></tr>'
      )
    })
    .join('')
  const order = stringsAt('runners.order')
  return section(
    'Runners',
    'runners.disabled',
    (names.length === 0
      ? '<p class="set-empty">no runners detected</p>'
      : '<table class="set-table"><tbody>' + rows + '</tbody></table>') +
      '<p class="set-sub">Order: ' +
      (order.length === 0
        ? 'alphabetical'
        : order.map((r) => '<code>' + escapeHtml(r) + '</code>').join(' ')) +
      '</p>' +
      // An order dragged in the tab bar overrides `runners.order` until it is
      // cleared. This is shown here, where both orders are visible.
      (localOrder.length === 0
        ? ''
        : '<p class="set-sub set-override">A dragged order is in force in this browser and ' +
          'wins over the setting above.' +
          '<button data-reset-order="1">Reset to configured order</button></p>'),
  )
}

function executionSection(): string {
  // Trust and `allowExec` are not the same switch, and the screen says so,
  // because confusing them is the security risk: a project file may only
  // turn execution off. Turning it on is the trust grant, which a person
  // decides once per repository on each machine.
  const config = loaded!
  // What this process decided is a third fact, not derived from the other
  // two. Untrusting during a session makes the store say no, but this run
  // keeps the execution it started with, and `trustable` became false at the
  // grant. Without this the screen would say execution is off while probes
  // are still being spawned.
  //
  // The sentence states the situation and gives no advice. Two kinds of
  // session reach here: untrusted during the run, and `--exec` on a
  // repository never trusted. A restart turns execution off in the first and
  // keeps it in the second, so advice for one would be wrong for the other.
  const running = state.catalog?.allowExec === true
  const trust = config.trusted
    ? 'This repository is trusted, so runners may spawn probes.'
    : running
      ? 'This repository is not trusted, but execution is on for this session — the gate was ' +
        'resolved when wayfinder started and does not change while it runs.'
      : config.trustable
        ? 'This repository is not trusted, so runners that must be run to be read were skipped.'
        : 'Execution is off for this project, and trusting the repository would not change that.'

  // Offered only where it would do something. `trustable` comes from the
  // server's own decision. Under `--no-exec` or `--exec` a grant changes
  // nothing and the endpoint refuses it, so a button would mislead.
  const action = config.trusted
    ? '<button data-untrust-repo="1">Untrust</button>'
    : config.trustable
      ? '<button data-trust-repo-settings="1">Trust this repository</button>'
      : ''

  return section(
    'Execution',
    'allowExec',
    '<p>' +
      escapeHtml(trust) +
      '</p>' +
      (action === '' ? '' : '<div class="set-actions set-inline">' + action + '</div>') +
      '<p class="set-sub"><code>allowExec</code>: <code>' +
      String(valueOf('allowExec') === true) +
      '</code></p>' +
      '<p class="set-sub">A project file can only turn execution <em>off</em>. ' +
      'Turning it on is the trust grant — a repository cannot grant itself ' +
      'permission to run its own code.</p>',
  )
}

const DISCOVERY_MODES = ['auto', 'git', 'walk'] as const

function discoverySection(): string {
  const current = valueOf('discovery')
  return section(
    'Discovery',
    'discovery',
    '<div class="set-radios">' +
      DISCOVERY_MODES.map(
        (mode) =>
          '<label><input type="radio" name="set-discovery" data-set-discovery="' +
          mode +
          '"' +
          (current === mode ? ' checked' : '') +
          ' /> <code>' +
          mode +
          '</code></label>',
      ).join('') +
      '</div>' +
      '<p class="set-sub"><code>auto</code> uses git when the root is a repository and walks it ' +
      'otherwise.</p>',
  )
}

function excludedSection(): string {
  const paths = stringsAt('excludePaths')
  return section(
    'Excluded paths',
    'excludePaths',
    (paths.length === 0
      ? '<p class="set-empty">none</p>'
      : '<ul class="set-list">' +
        paths
          .map(
            (p, i) =>
              '<li><code>' +
              escapeHtml(p) +
              '</code>' +
              '<button class="set-x" data-drop-path="' +
              i +
              '" aria-label="Remove ' +
              escapeHtml(p) +
              '">×</button></li>',
          )
          .join('') +
        '</ul>') +
      '<div class="set-add"><input type="text" id="set-path" placeholder="vendor, or src/fixtures" ' +
      'aria-label="Path to exclude" /><button data-add-path="1">Add</button></div>' +
      '<p class="set-sub">A bare name matches any path segment; a value with a slash matches ' +
      'from the root. This narrows where runners look, and is not the same as turning a runner off.</p>',
  )
}

/** The whole screen, from whatever the module currently holds. */
function screen(): string {
  const config = loaded
  if (config === null) {
    return (
      '<p class="set-empty">Could not read the configuration — the server may have handed ' +
      'over the terminal. Start wayfinder again.</p>'
    )
  }
  const warnings =
    config.warnings.length === 0
      ? ''
      : '<div class="set-warnings">' +
        config.warnings.map((w) => '<p>' + escapeHtml(w) + '</p>').join('') +
        '</div>'
  const dirty = isDirty()
  const message =
    notice === null
      ? ''
      : '<p class="set-notice" data-kind="' + notice.kind + '">' + escapeHtml(notice.text) + '</p>'
  return (
    '<div class="set-head"><h2>Settings' +
    (dirty ? ' <span class="set-dirty">' + Object.keys(staged).length + ' unsaved</span>' : '') +
    '</h2>' +
    '<p class="set-file">' +
    escapeHtml(config.locations.project) +
    '</p></div>' +
    warnings +
    message +
    runnersSection() +
    executionSection() +
    discoverySection() +
    excludedSection() +
    '<div class="set-actions">' +
    '<button data-settings-revert="1"' +
    (dirty ? '' : ' disabled') +
    '>Revert</button>' +
    '<button data-settings-save="1"' +
    (dirty ? '' : ' disabled') +
    '>Save to wayfinder.config.json</button>' +
    '</div>'
  )
}

// ------------------------------------------------------------------ wiring

/** Repaint the dialog body in place. */
function repaint(): void {
  const body = document.getElementById('settings-body')
  if (body !== null) body.innerHTML = screen()
}

/**
 * Seed the screen from a fresh read and paint it.
 *
 * Staged edits are dropped: keeping them across a close would let a later Save
 * write something the person had walked away from.
 */
export function openSettings(config: ConfigResponse | null, known: readonly string[]): string {
  loaded = config
  knownRunners = known
  staged = {}
  notice = null
  return screen()
}

/**
 * Handle a click inside the settings dialog. Returns true when this function
 * handled it, so the page's shared click listener can stop.
 */
export function handleSettingsClick(target: HTMLElement): boolean {
  const runner = target.closest('[data-set-runner]') as HTMLInputElement | null
  if (runner !== null) {
    const name = runner.dataset['setRunner']!
    const disabled = new Set(stringsAt('runners.disabled'))
    // The checkbox means "collect this", so checking it removes the name from
    // the disabled list. The file stores the disabled list; the screen shows
    // what is collected.
    if (runner.checked) disabled.delete(name)
    else disabled.add(name)
    stage('runners.disabled', [...disabled].sort())
    repaint()
    return true
  }

  const mode = target.closest('[data-set-discovery]') as HTMLElement | null
  if (mode !== null) {
    stage('discovery', mode.dataset['setDiscovery']!)
    repaint()
    return true
  }

  const drop = target.closest('[data-drop-path]') as HTMLElement | null
  if (drop !== null) {
    const paths = stringsAt('excludePaths')
    paths.splice(Number(drop.dataset['dropPath']), 1)
    stage('excludePaths', paths)
    repaint()
    return true
  }

  if (target.closest('[data-add-path]') !== null) {
    const field = document.getElementById('set-path') as HTMLInputElement | null
    const value = field?.value.trim() ?? ''
    if (value !== '') {
      stage('excludePaths', [...stringsAt('excludePaths'), value])
      repaint()
    }
    return true
  }

  if (target.closest('[data-trust-repo-settings]') !== null) {
    // Asks for confirmation, like the picker's button. Trusting lets this
    // repository's code run, which one click should not decide.
    if (
      confirm(
        'Trust this repository? Its runners will be read by running them, now and on every later visit, until you untrust it.',
      )
    ) {
      void trustRepo().then(reload)
    }
    return true
  }

  if (target.closest('[data-untrust-repo]') !== null) {
    void untrustRepo().then((result) => {
      notice = result.ok
        ? {
            kind: 'ok',
            // Stated plainly, because it is surprising: the store now says
            // not trusted, but this process keeps the execution it started
            // with.
            text: 'Untrusted. This session keeps the execution it started with — start wayfinder again to re-probe without it.',
          }
        : { kind: 'err', text: result.detail ?? 'untrust failed' }
      void reload()
    })
    return true
  }

  if (target.closest('[data-reset-order]') !== null) {
    clearRunnerOrder()
    // The tab bar behind the dialog uses the same order, so it is
    // re-rendered too.
    render()
    repaint()
    return true
  }

  if (target.closest('[data-settings-revert]') !== null) {
    staged = {}
    notice = null
    repaint()
    return true
  }

  if (target.closest('[data-settings-save]') !== null) {
    void commit()
    return true
  }

  return false
}

/**
 * Re-read the configuration and repaint, keeping any staged edits and the
 * current notice. Used after trust changes, which alter what the server
 * reports without touching what the person has typed.
 */
async function reload(): Promise<void> {
  const fresh = await getConfig()
  if (fresh !== null) loaded = fresh
  repaint()
}

/** Write the staged edits, then re-seed from what the server produced. */
async function commit(): Promise<void> {
  const result = await saveConfig(staged)
  if (result.ok) {
    loaded = result.config
    staged = {}
    notice = { kind: 'ok', text: 'Saved.' }
  } else {
    // Nothing is cleared on failure, so a refused write does not lose the
    // person's edits.
    notice = { kind: 'err', text: result.detail }
  }
  repaint()
}
