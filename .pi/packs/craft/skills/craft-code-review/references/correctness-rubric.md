Correctness is whether the code does what the change says it does, and
whether it still does when the input is hostile or the timing is unlucky.
These are the defects that reach production and cost the most, so they come
first. A finding here names a concrete input, ordering or caller for which the
code is wrong.

Look for:

- Behaviour the description, commit message, comment or name promises that the
  code does not deliver.
- Logic and boundaries: off-by-one, empty and single-element input, null or
  missing values, an inverted condition, the wrong operator, integer, time-zone
  and encoding edges.
- Broken contracts: a changed signature, return shape or invariant with a
  caller that still assumes the old one. Follow the function to its callers.
- Concurrency and ordering: a check followed by an act across an await or a
  thread boundary, shared mutable state, a read before the write it needs,
  unawaited work, cleanup that depends on order.
- Resource leaks: processes, file handles, subscriptions, timers, transactions
  and connections opened and not released on every path.
- Input trust: a value from a user, file, network, environment variable or
  subprocess used as a path, key, index, size or command without validation at
  the point it enters.
- Injection: untrusted text placed into a shell command, SQL, path, regex, HTML
  or prompt without escaping or an argument array.
- Secrets: a token or credential reaching a log line, error message, artifact
  or command line.
- Authentication and authorization: a caller-controlled value (a header, a
  path, an id) trusted to grant access; one actor able to act with another's
  authority; a check placed after the action it guards.
- A dry-run or read-only mode that still writes, spawns, pushes or posts.

Not a finding:

- Pre-existing code the change leaves untouched, unless the change makes it
  newly reachable.
- A guard that the surrounding code already provides. Read the callers and
  callees before reporting.
- Defences against inputs the program cannot produce, such as validating a
  value the type system already constrains.
- Style, naming and anything a linter or type checker reports.

Writing the finding: cite file:line. State the failing input or sequence
("two calls interleaved at the await on line 40 both pass the check") or, for
a security finding, who controls the value and what it reaches. Give the fix
when it is a line or two.
