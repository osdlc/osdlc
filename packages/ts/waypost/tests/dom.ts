/**
 * The page's markup for the `src/web/` modules.
 *
 * `src/web/` is browser code. Everything reachable without a document is
 * already covered as a pure string builder (see `view.test.ts`); the rules
 * below are not — a selector's scope, what a click leaves focused, what a
 * refused clipboard write is allowed to claim. The three suites that need a
 * document declare `// @vitest-environment jsdom` (jsdom is a root
 * devDependency); every other suite runs without one, so the real `fetch`,
 * timers and `URL` the loopback-server suites depend on stay untouched.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Built from the module's URL string: under jsdom `URL` is jsdom's class, which
// `fileURLToPath` refuses as not a Node URL.
const SKELETON = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/web/page.html'),
  'utf-8',
)

/** Put the real page markup in the document — the same file the server serves. */
export function mountPage(): void {
  document.body.innerHTML = SKELETON.slice(SKELETON.indexOf('<div id="chrome">'))
}
