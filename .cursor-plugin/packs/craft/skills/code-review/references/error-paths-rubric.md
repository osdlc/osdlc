Error paths are the least exercised code in a change and the code that runs
when someone is already in trouble. A swallowed error turns a loud failure into
silent corruption; a missing cleanup turns one failure into a pile-up on the
next run. Judge each catch, error branch, failure result, non-zero exit and
fallback the change adds or alters.

Look for:

- Swallowed errors: an empty catch, a discarded failure result, a fallback
  that hides the cause, a promise rejection nobody observes.
- Partial writes: if step N of M fails, what is left behind (a half-written
  file, a held lock, a created directory, a posted message)? Can a later run
  detect it and recover?
- Cleanup: temp files, locks, processes, sessions and handles released on every
  exit path, including the failing one.
- Retries: bounded, backed off, limited to errors that can succeed on retry,
  and applied only to operations that are safe to repeat.
- Exit codes: a failure that exits zero, or an error that is logged and then
  treated as success by the caller.
- Messages: an error that names what failed, on which input, and what the
  reader can do next, without leaking a secret. One generic message for several
  distinct causes is a finding when the reader must act differently on each.
- Inconsistency: a new helper that returns null on failure where its siblings
  throw, so callers handle two conventions.

Not a finding:

- A deliberate, commented best-effort step whose failure the caller does not
  depend on (for example removing a cache file that may not exist).
- Handling at the right layer: an error passed up unchanged to a caller that
  handles it is correct. Do not ask every function to catch.
- Errors the language or framework already reports with a usable message.
- Formatting or naming of error text, and anything a linter catches.

Writing the finding: cite file:line. Trace the failure: name the failing call,
what the code does next, and the state or message that results. Name the
missing cleanup or the lost cause, and give the fix, such as a finally block, a
rethrow with context, or a cap on the retry loop.
