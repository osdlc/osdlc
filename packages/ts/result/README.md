# @osdlc/result

A plain-object `Result` and a `Failure` shape written for people. Zero
dependencies.

## Why

A function that can fail in a way its caller should handle has two honest
choices: throw, or return the failure. Throwing is right for bugs and for
"stop here". Returning is right when the caller will look at the failure and
decide: retry, show a hint, fall back. This library is for the second case. It
gives every layer of a program the same small vocabulary, so a failure that
starts in a subprocess can travel up through a git client and a code-host
adapter and still end as one plain sentence for a person.

- A `Result` is a plain object, `{ ok: true, value }` or `{ ok: false, error }`.
  No classes, so it survives JSON, structured clone and a test's `toEqual`.
- A `Failure` is `{ kind, message, hint?, detail?, cause? }`. `kind` is for
  code, `message` and `hint` are for people, `detail` is the raw tool output,
  `cause` is what produced it.
- Async results are just `Promise<Result<…>>`. There is no `ResultAsync`.

When not to use it: you want a full effect system (use Effect), or railway
chains with dozens of combinators (use neverthrow or fp-ts). This is eleven
small functions.

## Install

```sh
npm install @osdlc/result
```

`pnpm add @osdlc/result` and `yarn add @osdlc/result` work too.

ESM only. Node.js 22 or later. Bun also works.

## Use

```ts
import { describe, err, type Failure, match, ok, type Result } from '@osdlc/result'

type ParseKind = 'empty' | 'not-a-number'

function parsePort(text: string): Result<number, Failure<ParseKind>> {
  if (text.trim() === '') return err({ kind: 'empty', message: 'No port was given.' })
  const n = Number(text)
  if (!Number.isInteger(n)) {
    return err({
      kind: 'not-a-number',
      message: `"${text}" is not a port number.`,
      hint: 'Use a whole number such as 8080.',
    })
  }
  return ok(n)
}

const r = parsePort('8080')
if (r.ok) console.log(r.value) // narrowed to Ok<number>

// `match` handles both arms and returns one value.
const line = match(parsePort('x'), {
  ok: (n) => `listening on ${n}`,
  err: (f) => describe(f), // '"x" is not a port number. Use a whole number such as 8080.'
})
console.log(line)
```

### Exhaustive handling

Make `kind` a string-literal union per layer. A `switch` then tells the
compiler when a kind is unhandled: add a kind and every `switch` with a
`never` default stops compiling.

```ts
import { type Failure } from '@osdlc/result'

type Kind = 'empty' | 'not-a-number'

function advice(f: Failure<Kind>): string {
  switch (f.kind) {
    case 'empty':
      return 'ask again'
    case 'not-a-number':
      return 'show the hint'
    default: {
      const unreachable: never = f.kind
      return unreachable
    }
  }
}
console.log(advice({ kind: 'empty', message: 'No port was given.' }))
```

### With ts-pattern (optional)

`ts-pattern` is not a dependency. If you use it, a Result is an ordinary
discriminated union, so it works without an adapter:

```typescript
// Not run by the README test: ts-pattern is not installed here.
import { match } from 'ts-pattern'

match(result)
  .with({ ok: true }, ({ value }) => use(value))
  .with({ ok: false, error: { kind: 'empty' } }, () => askAgain())
  .with({ ok: false, error: { kind: 'not-a-number' } }, ({ error }) => show(error))
  .exhaustive()
```

### Stopping instead

`unwrap(result)` returns the value or throws. A `Failure` error throws a
`FailureError`: its `message` is the failure's message, its `cause` is the
failure's cause, and the whole failure is `e.failure`. Any other error throws a
plain `Error` whose `cause` is that error.

`attempt(fn, toError)` and `attemptAsync(fn, toError)` turn a throwing call into
a Result at the edge, once:

```ts
import { attempt, type Failure, unwrap } from '@osdlc/result'

const parsed = attempt(
  () => JSON.parse('{"a":1}') as { a: number },
  (cause): Failure<'bad-json'> => ({ kind: 'bad-json', message: 'The text is not JSON.', cause }),
)
console.log(unwrap(parsed).a)
```

## API

Types: `Ok<T>`, `Err<E>`, `Result<T, E = Failure>`, `Failure<K extends string = string>`.

| Export                         | What it does                                                          |
| ------------------------------ | --------------------------------------------------------------------- |
| `ok(value)` / `err(error)`     | Build the two arms.                                                   |
| `isOk(r)` / `isErr(r)`         | Type guards.                                                          |
| `map(r, f)` / `mapErr(r, f)`   | Transform the value, or the error.                                    |
| `andThen(r, f)`                | Chain a step that returns a Result; the first failure wins.           |
| `unwrapOr(r, fallback)`        | The value, or the fallback.                                           |
| `unwrap(r)`                    | The value, or throw `FailureError` / `Error` with a `cause`.          |
| `match(r, { ok, err })`        | Handle both arms and return one value.                                |
| `attempt(fn, toError)`         | Run `fn`; a throw becomes `toError(thrown)`.                          |
| `attemptAsync(fn, toError)`    | The same, awaited.                                                    |
| `FailureError`                 | A `Failure` as a thrown `Error`; `.failure` holds it.                 |
| `isFailure(x)`                 | Whether `x` has a string `kind` and a string `message`.               |
| `describe(f)`                  | `message`, then `hint` when there is one: one plain line for people. |

## Stability

Pre-1.0. The API above is small and intended to stay; a minor version may
change it. See [docs/planning](./docs/planning/README.md) for why it has this
shape.

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
