---
id: D-01
type: decision
state: accepted
created: 2026-10-21
---

# D-01: A plain-object Result and a Failure shape

## Decision

- A `Result<T, E = Failure>` is a plain union of two plain objects:
  `{ ok: true, value }` and `{ ok: false, error }`. There are no classes on the
  Result itself and no method chaining; the combinators are functions
  (`map`, `mapErr`, `andThen`, `unwrapOr`, `unwrap`, `match`).
- Async results are `Promise<Result<…>>`. There is no `ResultAsync`.
- A `Failure<K extends string>` is `{ kind, message, hint?, detail?, cause? }`.
  `kind` is a string-literal union chosen by each layer.
- `FailureError` is a `Failure` as a thrown `Error`: `message` is the failure's
  message, `cause` its cause, and the failure itself is `.failure`.
- `describe(failure)` is `message` plus ` hint`: one plain line for people.
- Zero runtime dependencies.

## Why

The motivating case is a stack of small libraries: a subprocess runner, a git
client and a GitHub client over it, then adapters and a CLI. Each layer used to
invent its own way to say "that did not work": an `exitCode`, a `null`, a
thrown `CommandFailed`, a `{ ok, reason, message }`. A failure that began as
`spawn gh ENOENT` reached the user as a stack trace. One shared shape lets a
failure keep its meaning as it travels up and be turned into a sentence once.

### Prior art

- **Plain union (Zod `safeParse`, Standard Schema).** `{ success, data | error }`
  is a plain object that narrows on one field. This is the shape we follow,
  with `ok`/`value`/`error`.
- **Class Results (neverthrow, true-myth, ts-results-es, oxide.ts).** Methods
  such as `.map` and `.andThen` read well, but the Result becomes a class
  instance: it does not survive JSON or structured clone, does not compare with
  `toEqual` without care, and two copies of the library in one tree disagree on
  `instanceof`. A plain object has none of those problems and the functions
  tree-shake.
- **fp-ts / purify `Either`.** `Left`/`Right` with a full algebra. It is the
  right tool for a codebase committed to that style, and a heavy dependency for
  one that only wants to return a failure.
- **Effect.** A complete runtime with typed errors, services and fibres. It is
  a way to write a whole program, not a small value to return from a library.
- **Go-style tuples and the early TC39 try-operator proposal.** `[error,
  value]` needs no library, but it does not narrow (checking `error` does not
  tell TypeScript that `value` is set, without a tagged tuple) and a tuple has
  no name for its parts. The try-operator proposal would give syntax for it,
  but it is not in the language.
- **Thrown typed errors (Node's `err.code`, `Error.cause`).** Right for bugs and
  for "stop here", and what `unwrap` and the checked doors of the clients still
  do. They are a poor return value: nothing in a signature says a function can
  fail, and a `catch` sees `unknown`.

### Why `ok`, `value`, `error`

These names match what the surrounding code already used: the tool router's
results, typed-git's outcomes, and `fetch`'s `response.ok`. A reader who knows
one knows the rest, and there was nothing to migrate for the field names.

### Why `kind` is a string-literal union per layer

A layer declares `type GitFailureKind = 'not-a-repo' | …`. A `switch` over
`failure.kind` with a `never` default, or ts-pattern's `.exhaustive()`, then
fails to compile when a layer adds a kind and a caller has not handled it.
`Failure<K = string>` keeps the open form for code that only logs. A layer that
wraps another's kinds writes `CommandFailureKind | 'not-a-repo'`.

### Library errors typed, application errors formatted once

This follows Rust's split between `thiserror` and `anyhow`. A library returns a
typed error with kinds a caller can match on. The application, at its edge,
turns whatever it received into text once, with `describe`. Because `message`
and `hint` are written by the layer that knows the answer (the git client knows
the install URL; the subprocess runner does not), the application needs no
table of its own.

### `cause` chains

`Failure.cause` and `FailureError`'s `cause` use the standard `Error.cause`
slot, as Rust's `Error::source()` does. A git failure's `cause` can be the
subprocess failure it was classified from, so a debug view can walk down to the
raw output while the default view shows one line.

## Consequences

- Adopting layers change their failure types to `Failure<TheirKind>`; see their
  own decision records.
- A caller that wants an exception writes `unwrap(result)`.
- Pre-1.0, so a shape change is a minor version; there are no aliases.
