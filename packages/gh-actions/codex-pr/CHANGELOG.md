# Changelog

## Unreleased

- Skill mode: `@codex /<plugin>:<skill> [args]` runs any installed skill and posts its output (marker `codex-skill`). `--apply` lets the agent edit files; the agent job uploads the edits as a patch artifact (output `apply-patch`) and a separate job in the `pr-agent` environment (action `pr-apply`) validates and pushes it. The agent job has no push token. Answer and review modes are unchanged.
- A key that is out of quota (`insufficient_quota`) now falls through to the next key, like an authentication failure; the list order is the priority.
- First version: `@codex` answers and `@codex review`, a list of API keys, done and failed markers (`codex-answer`, `codex-review`), a read-only sandbox, craft installed through agent-setup, and `marketplaces` / `plugins` inputs.
