/**
 * Startup only: restore saved preferences, attach every listener, draw the
 * first frame. Rendering, data loading and event handling live in `view.ts`,
 * `api.ts` and `input.ts`. This module starts them in the order the page needs.
 */
import { $, restoreRunnerOrder, restoreTheme, state } from './state.ts'
import { measureChrome } from './view.ts'
import { setThemeButton, wireInput } from './input.ts'
import { load } from './api.ts'

// Drop the boot token from the address bar. It is already used by the time
// this runs, but a copied URL should not carry a credential at all.
if (new URL(location.href).searchParams.has('boot')) {
  const clean = new URL(location.href)
  clean.searchParams.delete('boot')
  history.replaceState(null, '', clean.pathname + clean.search + clean.hash)
}

// Restore a saved runner arrangement; absent, alphabetical stands.
state.runnerOrder = restoreRunnerOrder()

// Restore an explicit theme choice; absent, the system default stands. The
// button is updated either way, so it shows the scheme in use rather than the
// markup's static default.
const savedTheme = restoreTheme()
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme)
setThemeButton(savedTheme ?? 'system')

wireInput()

measureChrome()
;($('q') as HTMLInputElement).focus()
load(false)
