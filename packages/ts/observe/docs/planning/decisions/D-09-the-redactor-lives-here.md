---
id: D-09
type: decision
state: proposed
created: 2026-11-07
---

# D-09: The redactor lives here

## Decision

- The package ships a redactor in the `@osdlc/observe/redact` entry:
  `createRedactor`, `redactPatternProblem`, and `appendRedactedJsonl`, the
  JSONL writer with the redactor in front of it.
- It is always on. Options add rules (`envNames`, `extraPatterns`). No option
  removes one.
- It fails closed. When a pass throws, or secretlint cannot load, the whole
  value is replaced with `[REDACTED:redactor-error]`. It never returns what it
  matched, only counts per rule.
- `appendRedactedJsonl` writes the envelope's own keys (`v`, `ts`, `kind`,
  `writer`, `source`, `session`, `run`, `subject`) as they are when they hold a
  primitive, and redacts the rest of the line.
- secretlint is a runtime dependency, loaded with a dynamic import on the first
  text that could hold a secret. Importing the entry loads nothing.
- The entry is stable for 0.x.

## The rules

These came with the redactor from its first consumer, where the maintainer
ruled that redaction is aggressive and always on for content: it cannot be
disabled, only extended.

Four passes each collect ranges over the original text. Overlapping or
adjacent ranges merge, keeping the rule of the earliest start, and each is replaced
as `[REDACTED:<rule>]`.

1. **secretlint.** `@secretlint/core` with
   `@secretlint/secretlint-rule-preset-recommend`. It covers cloud, chat,
   package-registry and payment provider keys, private keys, basic-auth URLs
   and database connection strings. The preset's rules are registered one
   by one, without its comment filter, so a `secretlint-disable` comment in
   the logged text cannot switch a rule off.
2. **Built-in rules.**
   - JWTs, and provider API keys the preset's strict shapes miss.
   - PEM and PGP private key blocks, by a linear scan, which the preset misses on
     short bodies.
   - Passwords in connection strings, `Authorization` and cookie headers, and
     bearer tokens.
   - `assigned-secret`: a key name (`password`, `passwd`, `pwd`, `secret`,
     `token`, `api_key`, `access_key`, `private_key`, `credential`, with an
     identifier tail so `DB_PASSWORD` and `client_secret_key` match; `auth`
     takes no tail, so `author` does not) followed by `:` or `=` and a value.
     A quoted value redacts at any length, a bare value from 6 characters. Only
     the value is redacted. Token counts (`input_tokens: 12048`) and values
     that read as code (a call, a member chain off a known receiver, a type
     name, `$VAR`) are exempt, except under a password-like key, where only
     type names and variable references are: `password=correct.horse.battery`
     is redacted.
   - `high-entropy`: a long token of Shannon entropy 4 or more right after a
     key-like word, so git SHAs and UUIDs in prose pass.
3. **Environment values.** The exact values, 8 characters or longer, of
   environment variables whose names have a secret-like part (`KEY`, `TOKEN`,
   `SECRET`, `PASSWORD`, `PASS`, `CREDENTIAL`, `AUTH`, `PRIVATE`, `APIKEY`),
   except paths and sockets (`SSH_AUTH_SOCK`, `*_PATH`, `*_FILE`), plus the
   names in `envNames`.
4. **Extra patterns** from `extraPatterns`, reported as `custom:<id>`.
   `redactPatternProblem` refuses the common catastrophic shapes when the
   redactor is built.

`redactJson` also blanks the whole value of a secret-named key, since a
per-string pass cannot see that `{ "password": "hunter22" }` is a secret.

Every built-in pass has a 100 KiB adversarial-input timing test. Accepted
limits: a bare 40-character AWS secret key with no key name or access key id
nearby looks like any other base64 and survives; a secret split across a line
wrap is not matched; an extra pattern runs unbounded.

## Why

- Logs of agent work hold prompts, tool output and error messages, and those
  hold tokens. A logging library with no redactor leaves every caller to write
  one, and a caller who forgets writes secrets to disk.
- `appendJsonl` stays synchronous and takes any value. secretlint is
  asynchronous, so redaction is a second writer, not an option on the first.
- The envelope's keys are ids and structure. `redactJson` blanks a string under
  `session`, which in a free-form value is often a cookie or token, so the
  writer must keep the envelope's `session` id out of that pass.
- secretlint is the maintained catalogue of secret shapes, under MIT. The
  built-in rules cover what logs hold that files seldom do: headers,
  assignments, secret-named JSON keys and secret-named environment values.
- A dynamic import keeps the entry cheap for a config loader that only calls
  `redactPatternProblem`, and keeps secretlint off the path of a caller that
  never redacts.

## Consequences

- Installing the package installs secretlint and its dependencies, even for a
  caller that never imports the redact entry.
- A new built-in rule is a feature (a patch while 0.x): it can only redact more.
  Renaming a rule id changes the `[REDACTED:<rule>]` markers and the counts, so
  it is a breaking change.
- `Redacted` is a branded string. A field typed `Redacted` refuses a plain
  string at compile time, but a cast still gets past it.
