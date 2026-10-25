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
 * means that happened: the server says so and stops (see `onReplay`).
 *
 * A JSON body from another origin needs a CORS preflight, which the server
 * never answers, so a website cannot redeem the boot token either.
 */

/** How long the boot token stays usable once the URL is shown. */
const BOOT_TTL_MS = 60_000

/** 128 bits, hex, from a secure source. */
function secret(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compared without an early exit, so a near miss takes as long as a far one. */
function tokenEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

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
 * the right boot token arrives after it was redeemed: someone else signed in
 * with it first.
 */
export function createSignIn(now: () => number = Date.now, onReplay?: () => void): SignIn {
  let bootToken = secret()
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
      bootToken = secret()
      live = true
      redeemed = false
      expiresAt = now() + BOOT_TTL_MS
      return bootToken
    },
  }
}
