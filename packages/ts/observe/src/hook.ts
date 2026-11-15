/**
 * The hook entry: one envelope for the payload a coding-agent harness sends on
 * a hook's stdin, and typed readers for the body it keeps as sent.
 */

export {
  HOOK_ENVELOPE_FIELDS,
  HOOK_HARNESSES,
  HookEnvelopeSchema,
  isPermissionNotification,
  normalizeHook,
  normalizeHookText,
  rawNumber,
  rawString,
  rawValue,
  type HookEnvelope,
  type HookEnvelopeField,
  type HookHarness,
} from './hook-payload.ts'
