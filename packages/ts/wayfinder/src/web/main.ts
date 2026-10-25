/**
 * Startup only: sign in, read the preferences, attach every listener, draw
 * the first frame. Rendering, data loading and event handling live in
 * `view.ts`, `api.ts` and `input.ts`. This module starts them in the order
 * the page needs.
 */
import { $, state } from './state.ts'
import { measureChrome, setThemeButton, showSignedOut } from './view.ts'
import { wireInput } from './input.ts'
import {
  load,
  loadTools,
  readConfig,
  settingSource,
  settingValue,
  signIn,
  signedIn,
  tokenWorks,
} from './api.ts'

async function start(): Promise<void> {
  // Take the boot token out of the address bar first: it is spent by the
  // sign-in below, and a copied URL should not carry a credential at all.
  const url = new URL(location.href)
  const boot = url.searchParams.get('boot')
  if (boot !== null) {
    url.searchParams.delete('boot')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
  // A reload uses the token this tab kept. A boot token is spent only when
  // the tab has no working token: redeeming one twice stops the server. The
  // first call answers 401 if the server has restarted since.
  const kept = signedIn() && (boot === null || (await tokenWorks()))
  const ok = kept || (boot !== null && (await signIn(boot)))
  if (!ok) {
    showSignedOut()
    return
  }

  // The server set `data-theme` from the `theme` setting before the first
  // paint. The button shows the scheme in use.
  const theme = document.documentElement.getAttribute('data-theme')
  setThemeButton(theme === 'light' || theme === 'dark' ? theme : 'system')

  wireInput()
  measureChrome()
  ;($('q') as HTMLInputElement).focus()

  // The stored probe first, so the page has rows at once; then a fresh read.
  // The catalog arrives in the configured runner order. The setting itself
  // is read beside it, so a drag knows which layer set it. The tool info is
  // for the runner info and settings, which are opened later.
  const [config] = await Promise.all([readConfig(), load({ cached: true }), loadTools()])
  if (!signedIn()) return
  const order = settingValue(config, 'runners.order')
  if (Array.isArray(order)) {
    state.runnerOrder = order.filter((r): r is string => typeof r === 'string')
  }
  state.runnerOrderSource = settingSource(config, 'runners.order')
  await load()
}

void start()
