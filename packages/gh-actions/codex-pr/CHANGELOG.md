# Changelog

## Unreleased

- A key that is out of quota (`insufficient_quota`) now falls through to the next key, like an authentication failure; the list order is the priority.
- First version: `@codex` answers and `@codex review`, a list of API keys, done and failed markers (`codex-answer`, `codex-review`), a read-only sandbox, craft installed through agent-setup, and `marketplaces` / `plugins` inputs.
