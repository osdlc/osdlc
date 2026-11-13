---
title: Keeping secrets out of logs
sidebar:
  order: 1
description: What the redactor does to a log line, what it catches and misses, and how to wire it into a writer.
---

Logs of agent work are full of text you did not write: the prompt a person
typed, the output of every shell command an agent ran, error messages, HTTP
headers. That text carries secrets. An agent runs `env`, a test prints a
connection string, a failed `git push` echoes a token in its URL. If a log
writer puts that text on disk as it is, the log becomes a copy of every secret
the agent saw.

`@osdlc/observe/redact` is the filter that runs before the write. It replaces
each secret it finds with a marker that names the rule that found it, and it
tells you how many it replaced. It never gives the secret back.

## What happens to a line

```ts
import { createRedactor } from '@osdlc/observe/redact'

const redactor = createRedactor()
const { text, redactions } = await redactor.redact(
  'curl -H "Authorization: Bearer dk-7f3a9c2e11b4" https://api.example.com',
)
```

| | |
|---|---|
| `text` | `curl -H "Authorization: Bearer [REDACTED:auth-scheme]" https://api.example.com` |
| `redactions` | `{ "auth-scheme": 1 }` |

The rest of the line is untouched, so the log still says what happened. Only
the secret is gone, and `auth-scheme` says why it was taken.

More examples, each run through the same redactor:

| Logged text | Becomes |
|---|---|
| `DB_PASSWORD=correct-horse-battery-staple npm run migrate` | `DB_PASSWORD=[REDACTED:assigned-secret] npm run migrate` |
| `connecting to postgres://app:s3cr3t-pa55@db.internal/prod` | `connecting to [REDACTED:database-connection-string]` |
| `git push https://x-access-token:ghp_…@github.com/acme/app.git` | `git push [REDACTED:basicauth]` |
| `commit 4f3a9c2e11b4d8e7…, usage {"input_tokens": 12048}` | unchanged: a git SHA and a token count are not secrets |
| `const token = session.id` | unchanged: the value is code, not a secret |

## Logging a whole event

Most logs are JSON lines, not strings. `appendRedactedJsonl` takes the line you
would have given `appendJsonl`, redacts it, and appends it:

```ts
import { appendRedactedJsonl, createRedactor } from '@osdlc/observe/redact'

const redactor = createRedactor()

await appendRedactedJsonl(
  'logs/tools.jsonl',
  {
    v: 1,
    ts: '2026-11-07T10:00:00.000Z',
    kind: 'tool.output',
    source: 'hook',
    session: 's-01JABCDEFGHJKMNPQRSTVWXYZ0',
    tool: 'Bash',
    output: 'pushed with ghp_…', // a GitHub token in the command's output
  },
  redactor,
)
```

The file gets:

```json
{"v":1,"ts":"2026-11-07T10:00:00.000Z","kind":"tool.output","source":"hook","session":"s-01JABCDEFGHJKMNPQRSTVWXYZ0","tool":"Bash","output":"pushed with [REDACTED:github]"}
```

The envelope's own fields (`v`, `ts`, `kind`, `writer`, `source`, `session`,
`run`, `subject`) are written as they are. They are ids and structure, and a
reader needs them to join one log to another. Every other field is redacted.

That split matters for one key in particular. Inside free-form data,
`redactJson` treats a string under `session` as a secret, because there it is
usually a cookie or a session token:

```ts
await redactor.redactJson({
  prompt: 'deploy it',
  headers: { authorization: 'Basic YWRhOmh1bnRlcjI=' },
  password: 'hunter2',
  max_tokens: 100,
  session: 'abc',
})
// {
//   prompt: 'deploy it',
//   headers: { authorization: '[REDACTED:assigned-secret]' },
//   password: '[REDACTED:assigned-secret]',
//   max_tokens: 100,
//   session: '[REDACTED:assigned-secret]',
// }
```

Calling `redactJson` on a whole envelope would blank its `session` id.
`appendRedactedJsonl` keeps the envelope out of that pass, which is why it is the
writer to use.

## What it looks for

Four passes run over the original text, and every range any of them finds is
replaced:

1. **secretlint's recommended preset.** Cloud, chat, package-registry and
   payment provider keys (AWS, GCP, GitHub, Slack, npm, OpenAI, Anthropic,
   Stripe, SendGrid...), private keys, basic-auth URLs and database connection
   strings.
2. **Rules for what logs hold that files seldom do.**
   - `Authorization` and `Cookie` headers, and `Bearer ...` tokens.
   - A value assigned to a secret-sounding name: `DB_PASSWORD=...`,
     `DB_PASS=...`, `"api_key": "..."`, `client_secret: ...`. Under a
     password-like name, `password: correct horse battery staple` is redacted
     to the end of the line, spaces and all.
   - JWTs, provider API keys, PEM and PGP private key blocks, passwords inside
     URLs.
   - A long, random-looking token right after a word like `key` or `token`.
3. **Your environment.** The value of every environment variable whose name
   contains a part such as `KEY`, `TOKEN`, `SECRET`, `PASSWORD` or `AUTH`, and is
   8 characters or longer. If `DEPLOY_TOKEN=dk-7f3a9c2e11b4` is set, that exact
   string is redacted wherever it appears, whatever surrounds it.
4. **Your patterns**, if you add any (below).

## What it does not catch

Redaction lowers the chance that a secret reaches a log. It is not a guarantee.

- **A secret with no shape and no context.** A bare 40-character AWS secret key
  with no key name or access key id nearby looks like any other base64 string.
- **A secret split across a line wrap.**
- **Your own secret formats**, until you add them.

Keep logs as private as the things they record.

## Adding your own rules

You can add rules. You cannot turn one off.

```ts
const redactor = createRedactor({
  // A secret whose variable name does not say so.
  envNames: ['BUILD_SIGNER'],
  // An in-house key format. Reported as `custom:ticket-key`.
  extraPatterns: [{ id: 'ticket-key', regex: 'TK-[A-Z0-9]{12}' }],
})
```

A pattern runs on every line you log, so a slow one slows every write.
`createRedactor` refuses the patterns known to be catastrophically slow, such
as `(a+)+$`, and throws. To report a bad pattern earlier, for example while
loading a config file, call `redactPatternProblem`. It loads nothing:

```ts
import { redactPatternProblem } from '@osdlc/observe/redact'

redactPatternProblem('TK-[A-Z0-9]{12}') // null: fine
redactPatternProblem('(a+)+$') // '... risks catastrophic backtracking'
redactPatternProblem('(') // 'Invalid regular expression: /(/g: Unterminated group'
```

The check is a heuristic. Keep your patterns simple and bounded.

## When something goes wrong

The redactor fails closed. If a pass throws, or secretlint cannot be loaded,
the whole value is replaced:

```ts
{ text: '[REDACTED:redactor-error]', redactions: { 'redactor-error': 1 } }
```

You lose that line's content, not your secrets. Count `redactor-error` if you
want to know it happened. If secretlint failed to load, the next call tries
again.

The text being logged cannot switch the redactor off either. A file an agent
printed may contain a `// secretlint-disable` comment. The redactor ignores it.

## Making the type system help

`redact` returns `Redacted`, a string type that only the redactor produces.
Declare the free-text fields of your log events with it, and the compiler
refuses a plain string:

```ts
import type { Redacted } from '@osdlc/observe/redact'

interface ToolOutputEvent {
  kind: 'tool.output'
  output: Redacted
}

const { text } = await redactor.redact(rawOutput)
const ok: ToolOutputEvent = { kind: 'tool.output', output: text }
const bad: ToolOutputEvent = { kind: 'tool.output', output: rawOutput } // type error
```

A cast (`rawOutput as Redacted`) still gets past it, so treat a cast to
`Redacted` as something a reviewer should question.

## Cost

- Importing `@osdlc/observe/redact` loads nothing heavy. secretlint loads the
  first time a text could hold a secret.
- Text with no run of 16 or more non-space characters, no `://` and no `-----`
  skips secretlint, which is most of a chat transcript.
- No built-in rule nests an unbounded quantifier. Each has a test that feeds
  it 100 KiB of input built to make it backtrack and requires it to finish
  quickly.

## Reference

| Export | What it is |
|---|---|
| `createRedactor(options?)` | Builds a `Redactor`. Reads the environment once, here. Throws on a bad extra pattern. |
| `Redactor.redact(text)` | Redacts a string. Returns `{ text: Redacted, redactions }`. Never throws. |
| `Redactor.redactJson(value)` | Redacts every string in a JSON-like value, keys included. Never throws. |
| `appendRedactedJsonl(path, line, redactor, options?)` | Redacts all but the envelope's fields, then appends the line. |
| `redactPatternProblem(regex)` | Why a pattern would be refused, or `null`. |
| `mergeRedactions(into, from)` | Adds one set of per-rule counts into another. |
| `RedactorOptions` | `env`, `envNames`, `extraPatterns`, and `lint`, a stand-in for secretlint in tests. |
| `Redacted`, `Redactions`, `RedactionRange` | The branded string, the per-rule counts, and a `[start, end, rule]` range. |

Why the redactor lives in this package, and the full rule list, are in
[D-09](../planning/decisions/D-09-the-redactor-lives-here.md).
