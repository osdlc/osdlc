/**
 * Signing a browser in to the web view.
 *
 * The command tree is served by cli-tool's HTTP adapter, which owns the
 * bearer token and the Host and Origin checks. What it leaves to the app is
 * how its own page gets that token.
 *
 * Other local users can reach 127.0.0.1 and can read a process's argv while
 * it runs. So the bearer token never appears in a URL, an argv or the page
 * itself. The URL the server prints or opens carries a boot token instead.
 * The page sends it once, in a JSON body to `POST /session`, and gets the
 * bearer token back. The boot token works once and expires a minute after
 * the URL is shown, so it is only usable between opening the browser and the
 * page loading.
 *
 * The boot token is in the browser opener's argv while it runs, so another
 * local user could redeem it first. The right boot token sent a second time
 * is refused, and the server warns in its terminal (see `onReplay`). Sessions
 * already signed in keep working; a new link comes from {@link SignIn.renew}.
 *
 * A JSON body from another origin needs a CORS preflight, which the server
 * never answers, so a website cannot redeem the boot token either.
 */

import { newToken, tokenEquals } from '@osdlc/cli-tool/http'

/** How long the boot token stays usable once the URL is shown. */
const BOOT_TTL_MS = 60_000

/** The one-shot boot token. */
export interface SignIn {
  /** Put this in the URL the person opens. The latest one {@link renew} made. */
  readonly bootToken: string
  /**
   * Start the expiry timer. Call it when the URL is shown: the first probe
   * runs before that, and on a cold tree it can use up much of the minute.
   */
  arm(): void
  /** True once, for the first unexpired `candidate` that matches. */
  redeem(candidate: unknown): boolean
  /**
   * Replace the boot token with a new one, armed, and return it. The old one
   * stops working. Bearer tokens already handed out keep working.
   */
  renew(): string
}

/**
 * Make a boot token. `now` is injectable for tests. `onReplay` is called when
 * the right boot token arrives after it was redeemed: a second tab, or
 * another program that read the link.
 */
export function createSignIn(now: () => number = Date.now, onReplay?: () => void): SignIn {
  let bootToken = newToken()
  let live = true
  let redeemed = false
  let expiresAt = Number.POSITIVE_INFINITY
  return {
    get bootToken() {
      return bootToken
    },
    arm() {
      expiresAt = now() + BOOT_TTL_MS
    },
    redeem(candidate) {
      if (typeof candidate !== 'string') return false
      if (redeemed && tokenEquals(candidate, bootToken)) onReplay?.()
      if (!live) return false
      if (now() > expiresAt) {
        live = false
        return false
      }
      if (!tokenEquals(candidate, bootToken)) return false
      live = false
      redeemed = true
      return true
    },
    renew() {
      bootToken = newToken()
      live = true
      redeemed = false
      expiresAt = now() + BOOT_TTL_MS
      return bootToken
    },
  }
}
