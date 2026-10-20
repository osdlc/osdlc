---
id: D-03
type: decision
state: accepted
created: 2026-10-19
---

# D-03: Secret redaction

## Decision

Reports redact secrets by default. A redacted value reads `<redacted>`, which
the package exports as `REDACTED`. Passing `includeValues: true` to `detect()`
or `readPlugin()` keeps every value as written.

The rule for MCP servers is:

- Every value in an MCP server's `env` and in its `headers` is redacted,
  whatever its key.
- In a server's `url`, the user part of the authority (`user:password@`, or a
  token used as the user name) is redacted. The value of every query
  parameter is redacted. Marketplace URLs get the same treatment.
- MCP `args` are redacted when they look like secrets:
  - The value of a `--flag` whose name contains `token`, `secret`, `key`,
    `password` or `auth`, in any case. This covers the `--flag value` form
    and the `--flag=value` form. In the first form, a next argument that
    starts with `--` is another flag, not the value, and is kept.
  - The value of a `KEY=value` argument whose `KEY` contains `token`,
    `secret`, `key` or `password`, in any case.
  - The value of an `Authorization:` header argument, and the token of a
    `Bearer <token>` argument.
  - The user part and the query values of any argument that contains `://`.
- Every other argument is returned as written.

Other rules:

- Credential files are tested for existence and never read for values.
- From `~/.claude.json`, only the `mcpServers` maps are read, plus whether an
  `oauthAccount` key exists.
- A pi auth file is read for its top-level key names, which are provider
  names, never its values.
- Hook commands are returned as written. Redaction does not cover them.

## Why

- A report is often logged, shown or sent to a model. Secret values in it
  would leak there.
- Redacting whole `env` and header values is simple to state and cannot miss a
  secret under an unexpected key name.
- Arguments have no key to go by, so a name-based rule is the best that can be
  said without guessing at values. The rule is narrow on purpose: it names the
  words and the forms, so a reader can predict what it hides.

## Consequences

- The rule is name-based. A secret in an argument that matches none of the
  forms above is returned. The README says so, and says not to put secrets in
  hook commands or such arguments.
- Widening the rule changes output. Before 1.0 it ships in a minor release,
  and the changelog says so.
- A caller that needs the values passes `includeValues: true` and owns the
  handling.
