/**
 * The settings screen: this project's configuration, and edits to it.
 *
 * It reads `way config list` and `way trust --show`, and Save writes each
 * edit with `way config set`, so the screen and the command line read and
 * write the same files with the same rules. Edits are staged; nothing is
 * written until Save. The project config is a committed file, so a click
 * must not silently change someone's working tree.
 *
 * Trust of the repository, or of one tool, is granted here only after the
 * person confirms (see `trustRepo`, `trustTool`). Settings the page may not
 * write (`allowExec`, the trust policy, `tools`) are shown read-only, each
 * with the command that changes it.
 *
 * It is not the runner picker. The picker in the header filters this visit
 * and is then forgotten. This screen sets which runners the project uses.
 *
 * Its state lives here, not in `state.ts`. The staged edits belong to the
 * dialog and mean nothing once it closes.
 */

import { CLI_ONLY_KEYS, THEME_VALUES, type Theme } from '../config-keys.ts'
import { APP, BIN, WITHHELD, runnerLabel } from '../vocabulary.ts'
import {
  failureText,
  load,
  readConfig,
  setSetting,
  settingSource,
  settingValue,
  trustRepo,
  trustTool,
  unsetSetting,
  untrustRepo,
  untrustTool,
  type ConfigView,
} from './api.ts'
import { $, state, toolInfo } from './state.ts'
import {
  escapeHtml,
  homepageLink,
  languageText,
  openDialogAtTop,
  render,
  setThemeButton,
  withheldNote,
} from './view.ts'

/** What the server last said the configuration is. */
let loaded: ConfigView | null = null

/** Runner ids the catalog reported. The config alone cannot supply them. */
let knownRunners: readonly string[] = []

/**
 * Edits not yet written, by dotted key. Empty means nothing is unsaved. This
 * is the only unsaved-changes test, since a separate boolean could disagree.
 */
let staged: Record<string, unknown> = {}

/** A message from the last Save, shown until the next render clears it. */
let notice: { kind: 'err' | 'ok'; text: string } | null = null

/** The file each editable key is written to. Personal settings go to the user's file. */
const LAYER_OF: Record<string, 'user' | 'project'> = {
  'runners.disabled': 'project',
  discovery: 'project',
  excludePaths: 'project',
  theme: 'user',
  open: 'user',
}

// ------------------------------------------------------------------ values

/** The value a key would have if Save were pressed now. */
function valueOf(key: string): unknown {
  if (key in staged) return staged[key]
  return settingValue(loaded, key)
}

function stringsAt(key: string): string[] {
  const value = valueOf(key)
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * Stage a value, or drop the edit when it matches what the file already says.
 * Toggling a checkbox and toggling it back leaves the screen clean.
 */
function stage(key: string, value: unknown): void {
  if (JSON.stringify(settingValue(loaded, key)) === JSON.stringify(value)) delete staged[key]
  else staged[key] = value
}

function isDirty(): boolean {
  return Object.keys(staged).length > 0
}

/** The path of a layer's file. */
function fileOf(layer: string): string {
  return loaded?.locations.find((l) => l.layer === layer)?.path ?? layer
}

// ------------------------------------------------------------------ render

/** Where a value came from, said the way `way config list` says it. */
function layerNote(key: string): string {
  if (key in staged) {
    return '<span class="set-layer" data-layer="staged">unsaved</span>'
  }
  const layer = settingSource(loaded, key)
  const where =
    layer === 'project' ? 'this project' : layer === 'user' ? 'your user config' : 'the default'
  return (
    '<span class="set-layer" data-layer="' +
    escapeHtml(layer) +
    '">' +
    escapeHtml(where) +
    '</span>'
  )
}

function section(title: string, key: string | null, body: string): string {
  return (
    '<section class="set-section">' +
    '<h3>' +
    escapeHtml(title) +
    (key === null ? '' : layerNote(key)) +
    '</h3>' +
    body +
    '</section>'
  )
}

/** A command a person can paste, as one line. */
function command(text: string): string {
  return '<code class="set-cmd">' + escapeHtml(text) + '</code>'
}

/** The runners withheld in the current catalog, by id. */
function withheldRunners(): Set<string> {
  return new Set(state.unknowns.filter((u) => u.kind === 'withheld').map((u) => u.runner))
}

function runnersSection(): string {
  const disabled = new Set(stringsAt('runners.disabled'))
  const withheld = withheldRunners()
  // Every runner the catalog knows, plus any named in `disabled`. A disabled
  // runner is not collected, so listing only collected runners would hide
  // the rows this section exists to show.
  const names = [...new Set([...knownRunners, ...disabled])].sort()
  const rows = names
    .map((name) => {
      const on = !disabled.has(name)
      // On or off is the setting. Withheld is a separate fact: an enabled
      // runner that was not read this time.
      const note = on && withheld.has(name) ? ', ' + withheldNote(name) : ''
      // What the tool is, from `way providers`. Text, so it is escaped, as
      // all text is.
      const tool = toolInfo(name)
      const about =
        tool === undefined
          ? ''
          : (tool.description !== null
              ? '<span class="set-desc">' + escapeHtml(tool.description) + '</span>'
              : '') +
            '<span class="set-tool">' +
            escapeHtml(languageText(tool)) +
            (homepageLink(tool.homepage) !== ''
              ? ' · ' + homepageLink(tool.homepage, 'homepage')
              : '') +
            '</span>'
      return (
        '<tr><td><input type="checkbox" data-set-runner="' +
        escapeHtml(name) +
        '"' +
        (on ? ' checked' : '') +
        ' aria-label="Collect ' +
        escapeHtml(runnerLabel(name)) +
        '" /></td>' +
        '<td><code>' +
        escapeHtml(runnerLabel(name)) +
        '</code>' +
        about +
        '</td>' +
        '<td class="set-state">' +
        escapeHtml((on ? 'on' : 'off') + note) +
        '</td></tr>'
      )
    })
    .join('')
  const order = stringsAt('runners.order')
  const orderSource = settingSource(loaded, 'runners.order')
  return section(
    'Runners',
    'runners.disabled',
    (names.length === 0
      ? '<p class="set-empty">no runners detected</p>'
      : '<table class="set-table"><tbody>' + rows + '</tbody></table>') +
      '<p class="set-sub">Order: ' +
      (order.length === 0
        ? 'the default'
        : order.map((r) => '<code>' + escapeHtml(runnerLabel(r)) + '</code>').join(' ')) +
      ' ' +
      layerNote('runners.order') +
      // A drag in the tab row writes the user's order. A project's order wins
      // over it, so the way back is offered only for the user's own.
      (orderSource === 'user'
        ? '<button data-reset-order="1">Reset to the default order</button>'
        : '') +
      '</p>' +
      '<p class="set-sub">Drag a tab or a Runners row to reorder; the order is saved in your user config.</p>',
  )
}

function executionSection(): string {
  const config = loaded!
  // What this page's reads do is decided per call, from the trust store and
  // the flags `serve` started with. The catalog says whether it ran with
  // execution.
  const running = state.catalog?.allowExec === true
  const trust = config.trusted
    ? 'This repository is trusted' +
      (config.trustedBy !== null && config.trustedBy !== 'marker'
        ? ' by your trust policy (' + config.trustedBy + ')'
        : '') +
      ', so runners may run to be read.'
    : running
      ? 'This repository is not trusted, but execution is on: ' +
        BIN +
        ' serve was started with --exec.'
      : state.trustable
        ? 'This repository is not trusted, so runners that must run to be read are ' +
          WITHHELD +
          '.'
        : 'Execution is off for this session, and trusting the repository would not change that.'

  // Untrust removes a marker; a policy-trusted root has none to remove.
  const action =
    config.trusted && config.trustedBy === 'marker'
      ? '<button data-untrust-repo="1">Untrust</button>'
      : !config.trusted && state.trustable
        ? '<button data-trust-repo-settings="1">Trust this repository</button>'
        : ''
  const allowExec = settingValue(loaded, 'allowExec') === true
  return section(
    'Execution',
    'allowExec',
    '<p>' +
      escapeHtml(trust) +
      '</p>' +
      (action === '' ? '' : '<div class="set-actions set-inline">' + action + '</div>') +
      toolTrust() +
      '<p class="set-sub"><code>allowExec</code>: <code>' +
      String(allowExec) +
      '</code>. It is changed from the command line only: ' +
      command(`${BIN} config set allowExec ${String(!allowExec)} --user`) +
      '</p>' +
      '<p class="set-sub">A project file can only turn execution <em>off</em>. ' +
      'Turning it on is the trust grant — a repository cannot grant itself ' +
      'permission to run its own code.</p>',
  )
}

/**
 * Trust one tool at a time: the tools trusted on their own, each with
 * Untrust, and the withheld runners with the tools they still need, each
 * with a grant. Empty when neither applies.
 */
function toolTrust(): string {
  const trusted = state.catalog?.trustedTools ?? []
  const waiting = state.unknowns.flatMap((u) =>
    u.kind === 'withheld' && u.missing !== undefined && u.missing.length > 0 ? [u] : [],
  )
  if (trusted.length === 0 && waiting.length === 0) return ''
  const trustedRows = trusted
    .map(
      (tool) =>
        '<li><code>' +
        escapeHtml(tool) +
        '</code> trusted on its own ' +
        '<button data-untrust-tool="' +
        escapeHtml(tool) +
        '" aria-label="' +
        escapeHtml('Untrust ' + tool) +
        '">Untrust</button></li>',
    )
    .join('')
  // One button per tool, however many runners need it.
  const offered = new Set<string>()
  const waitingRows = waiting
    .map((u) => {
      const grants = (u.missing ?? [])
        .filter((tool) => {
          if (!state.trustable || offered.has(tool)) return false
          offered.add(tool)
          return true
        })
        .map(
          (tool) =>
            '<button data-trust-tool="' +
            escapeHtml(tool) +
            '">' +
            escapeHtml('Trust ' + tool) +
            '</button>',
        )
        .join('')
      return (
        '<li><code>' +
        escapeHtml(runnerLabel(u.runner)) +
        '</code> ' +
        escapeHtml(u.label) +
        ' ' +
        grants +
        '</li>'
      )
    })
    .join('')
  return (
    '<h4>Tools</h4>' +
    '<ul class="set-list set-tools">' +
    trustedRows +
    waitingRows +
    '</ul>' +
    '<p class="set-sub">Trusting one tool lets the runners that run it be read, and nothing else. ' +
    command(`${BIN} trust --scope <tool>`) +
    ' does the same; ' +
    command(`${BIN} trust --untrust --scope <tool>`) +
    ' removes it.</p>'
  )
}

const DISCOVERY_MODES = ['auto', 'git', 'walk'] as const

function radios(key: string, values: readonly string[]): string {
  const current = valueOf(key)
  return (
    '<div class="set-radios">' +
    values
      .map(
        (v) =>
          '<label><input type="radio" name="set-' +
          escapeHtml(key) +
          '" data-set-key="' +
          escapeHtml(key) +
          '" data-set-value="' +
          escapeHtml(v) +
          '"' +
          (current === v ? ' checked' : '') +
          ' /> <code>' +
          escapeHtml(v) +
          '</code></label>',
      )
      .join('') +
    '</div>'
  )
}

function discoverySection(): string {
  return section(
    'Discovery',
    'discovery',
    radios('discovery', DISCOVERY_MODES) +
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

function personalSection(): string {
  return section(
    'Personal',
    null,
    '<p class="set-sub">Saved in your user config, not the project.</p>' +
      '<h4>Theme ' +
      layerNote('theme') +
      '</h4>' +
      radios('theme', THEME_VALUES) +
      '<h4>What <code>' +
      escapeHtml(BIN) +
      '</code> opens ' +
      layerNote('open') +
      '</h4>' +
      radios('open', ['tui', 'web']),
  )
}

/** The settings the page may not write, each with the command that does. */
function cliOnlySection(): string {
  const shown = (loaded?.settings ?? []).filter(
    (s) =>
      s.key !== 'allowExec' && CLI_ONLY_KEYS.some((k) => s.key === k || s.key.startsWith(k + '.')),
  )
  const rows = shown
    .map(
      (s) =>
        '<tr><td><code>' +
        escapeHtml(s.key) +
        '</code></td><td><code>' +
        escapeHtml(JSON.stringify(s.value) ?? 'unset') +
        '</code> ' +
        layerNote(s.key) +
        '</td></tr>',
    )
    .join('')
  return section(
    'Command line only',
    null,
    '<p class="set-sub">A page must not change the trust policy or name code to load, so these ' +
      'are changed from the command line, for example ' +
      command(`${BIN} config set trust.paths '["~/work"]' --user`) +
      ' or ' +
      command(`${BIN} trust`) +
      '.</p>' +
      (rows === '' ? '' : '<table class="set-table set-ro"><tbody>' + rows + '</tbody></table>'),
  )
}

/** The whole screen, from whatever the module currently holds. */
function screen(): string {
  const config = loaded
  if (config === null) {
    return (
      '<p class="set-empty">Could not read the configuration. The server may have handed ' +
      'over the terminal; start ' +
      escapeHtml(APP) +
      ' again.</p>'
    )
  }
  const dirty = isDirty()
  const message =
    notice === null
      ? ''
      : '<p class="set-notice" role="status" data-kind="' +
        escapeHtml(notice.kind) +
        '">' +
        escapeHtml(notice.text) +
        '</p>'
  const files = [...new Set(Object.keys(staged).map((k) => LAYER_OF[k] ?? 'project'))]
  return (
    '<div class="set-head"><h2 id="settings-title">Settings' +
    (dirty ? ' <span class="set-dirty">' + Object.keys(staged).length + ' unsaved</span>' : '') +
    '</h2>' +
    '<p class="set-file">Project: ' +
    escapeHtml(fileOf('project')) +
    '</p><p class="set-file">User: ' +
    escapeHtml(fileOf('user')) +
    '</p></div>' +
    message +
    runnersSection() +
    executionSection() +
    discoverySection() +
    excludedSection() +
    personalSection() +
    cliOnlySection() +
    '<div class="set-actions">' +
    '<button data-settings-revert="1"' +
    (dirty ? '' : ' disabled') +
    '>Revert</button>' +
    '<button data-settings-save="1"' +
    (dirty ? '' : ' disabled') +
    '>' +
    escapeHtml(
      dirty
        ? 'Save to ' +
            files.map((l) => (l === 'user' ? 'your user config' : 'the project file')).join(' and ')
        : 'Save',
    ) +
    '</button>' +
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
 * Seed the screen from a fresh read and return its markup.
 *
 * Staged edits are dropped: keeping them across a close would let a later Save
 * write something the person had walked away from.
 */
export function openSettings(config: ConfigView | null, known: readonly string[]): string {
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
    // the disabled list.
    if (runner.checked) disabled.delete(name)
    else disabled.add(name)
    stage('runners.disabled', [...disabled].sort())
    repaint()
    return true
  }

  const radio = target.closest('[data-set-key]') as HTMLElement | null
  if (radio !== null) {
    stage(radio.dataset['setKey']!, radio.dataset['setValue']!)
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
    // `trustRepo` asks the person before the grant is sent.
    void trustRepo().then(reload)
    return true
  }

  const grant = target.closest('[data-trust-tool]') as HTMLElement | null
  if (grant !== null) {
    const tool = grant.dataset['trustTool']!
    // `trustTool` asks the person before the grant is sent.
    void trustTool(tool).then((result) => {
      notice = result.ok
        ? { kind: 'ok', text: 'Trusted ' + tool + '. The runners that run it are read now.' }
        : result.declined
          ? null
          : { kind: 'err', text: 'trust ' + tool + ' failed: ' + result.detail }
      void reload()
    })
    return true
  }

  const revoke = target.closest('[data-untrust-tool]') as HTMLElement | null
  if (revoke !== null) {
    const tool = revoke.dataset['untrustTool']!
    void untrustTool(tool).then((result) => {
      notice = result.ok
        ? {
            kind: 'ok',
            text: 'Untrusted ' + tool + '. The runners that run it are withheld again.',
          }
        : { kind: 'err', text: 'untrust ' + tool + ' failed: ' + (result.detail ?? '') }
      void reload()
    })
    return true
  }

  if (target.closest('[data-untrust-repo]') !== null) {
    void untrustRepo().then((result) => {
      notice = result.ok
        ? { kind: 'ok', text: 'Untrusted. Runners that must run to be read are withheld again.' }
        : { kind: 'err', text: result.detail ?? 'untrust failed' }
      void reload()
    })
    return true
  }

  if (target.closest('[data-reset-order]') !== null) {
    void unsetSetting('runners.order', 'user').then(async (result) => {
      notice = result.ok
        ? { kind: 'ok', text: 'Removed runners.order from ' + result.doc.file + '.' }
        : { kind: 'err', text: failureText(result) }
      state.runnerOrder = []
      state.runnerOrderSource = 'default'
      await load()
      render()
      await reload()
    })
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
 * current notice.
 */
async function reload(): Promise<void> {
  const fresh = await readConfig()
  if (fresh !== null) loaded = fresh
  repaint()
}

/** "a", "a and b", "a, b and c". */
function listed(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]
}

/**
 * Write the staged edits, one `config set` each, and say what was written
 * where. A refused write stops there and keeps it and the edits after it
 * staged, so nothing the person typed is lost.
 */
export async function commit(): Promise<void> {
  const written = new Map<string, string[]>()
  let failure: string | null = null
  for (const [key, value] of Object.entries(staged)) {
    const result = await setSetting(key, value, LAYER_OF[key] ?? 'project')
    if (!result.ok) {
      failure = key + ': ' + failureText(result)
      break
    }
    written.set(result.doc.file, [...(written.get(result.doc.file) ?? []), key])
    delete staged[key]
    if (key === 'theme') applyTheme(value as Theme)
  }
  const saved = [...written].map(([file, keys]) => 'Saved ' + listed(keys) + ' to ' + file + '.')
  notice =
    failure === null
      ? { kind: 'ok', text: saved.join(' ') || 'Nothing to save.' }
      : { kind: 'err', text: [...saved, 'Not saved: ' + failure].join(' ') }
  const fresh = await readConfig()
  if (fresh !== null) loaded = fresh
  repaint()
  // A saved runner, discovery or path setting changes what the next read collects.
  if (written.size > 0) {
    state.fingerprint = ''
    await load()
  }
  if ($('settings').hasAttribute('open')) openDialogAtTop('settings')
}

/** Show `theme` now, as the server will on the next load. */
function applyTheme(theme: Theme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)
  setThemeButton(theme)
}
