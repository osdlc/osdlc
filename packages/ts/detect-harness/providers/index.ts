/** The built-in providers, one per {@link BUILTIN_HARNESSES} id, in that order. */

import type { HarnessProvider } from '../contract.ts'
import { antigravityProvider, opencodeProvider, piProvider } from './basic.ts'
import { claudeProvider } from './claude.ts'
import { codexProvider } from './codex.ts'
import { cursorProvider } from './cursor.ts'

/** The providers `detect()` uses by default, one per built-in harness, in report order. */
export const builtinProviders: readonly HarnessProvider[] = [
  claudeProvider,
  codexProvider,
  cursorProvider,
  opencodeProvider,
  piProvider,
  antigravityProvider,
]
