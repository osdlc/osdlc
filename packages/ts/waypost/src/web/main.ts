/**
 * Boot only: restore saved preferences, wire every listener, draw the first
 * frame. The actual behavior — rendering, data loading, event handling —
 * lives in `view.ts`, `api.ts` and `input.ts`; this module just sequences
 * their startup in the order the page depends on.
 */
import { $, restoreRunnerOrder, restoreTheme, state } from './state.ts'
import { measureChrome } from './view.ts'
import { setThemeButton, wireInput } from './input.ts'
import { load } from './api.ts'

// Drop the boot token from the address bar. It is already spent by the time
// this runs, but a copied URL should not carry a credential at all.
if (new URL(location.href).searchParams.has('boot')) {
  const clean = new URL(location.href)
  clean.searchParams.delete('boot')
  history.replaceState(null, '', clean.pathname + clean.search + clean.hash)
}

// Restore a saved runner arrangement; absent, alphabetical stands.
state.runnerOrder = restoreRunnerOrder()

// Restore an explicit theme choice; absent, the system default stands. The
// button is painted either way, so what it shows is the scheme actually in
// force rather than the markup's static default.
const savedTheme = restoreTheme()
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme)
setThemeButton(savedTheme ?? 'system')

wireInput()

measureChrome()
;($('q') as HTMLInputElement).focus()
load(false)
