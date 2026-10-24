/**
 * The harness-independent statuses a hook payload maps to, and how each maps
 * to a session state (`./model.ts`). Each harness maps its own hook events to
 * {@link AgentStatus}. The reducer, not this module, decides whether a move is
 * legal from the session's current state.
 */

import type { SessionRunState } from './model.ts'

/**
 * What a harness hook reports about its agent: the prompt was `delivered` (the
 * harness started), it is `working`, `idle`, it `needs_input`, or it `ended`.
 * A closed union: a new value is a breaking change.
 */
export type AgentStatus = 'delivered' | 'working' | 'idle' | 'needs_input' | 'ended'

/**
 * The session state a hook status reports: `needs_input` is
 * `waiting_for_input`, `idle` is `idle`, `ended` is `ended`, and `delivered`
 * (the harness started) and `working` are `running`.
 */
export function runStateForStatus(status: AgentStatus): SessionRunState {
  switch (status) {
    case 'needs_input':
      return 'waiting_for_input'
    case 'idle':
      return 'idle'
    case 'ended':
      return 'ended'
    default:
      return 'running' // delivered | working
  }
}
