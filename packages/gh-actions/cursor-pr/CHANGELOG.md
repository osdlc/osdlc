# Changelog

## Unreleased

- Skill mode: `@cursor /<plugin>:<skill> [args]` runs any installed skill and posts its output (marker `cursor-skill`). `--apply` lets the agent edit files; the agent job uploads the edits as a patch artifact (output `apply-patch`) and a separate job in the `pr-agent` environment (action `pr-apply`) validates and pushes it. The agent job has no push token. Answer and review modes are unchanged.
- A key that is out of credit now falls through to the next key, like an authentication failure; the list order is the priority. The usage-limit text is unverified.
- First version: `@cursor` answers and `@cursor review`, a list of API keys, done and failed markers (`cursor-answer`, `cursor-review`), read-only through ask mode and a temporary permission file, the craft code-review skill inlined into the review prompt, and a `marketplaces` input (plugins are not supported on cursor).
