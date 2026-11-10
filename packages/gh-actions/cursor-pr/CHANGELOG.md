# Changelog

## Unreleased

- Skill mode: `@cursor /<plugin>:<skill> [args]` runs any installed skill and posts its output (marker `cursor-skill`). `--apply` lets the agent edit files and the action commits and pushes to the pull request branch with the new `push-token` input (same-repo head only, head must not have moved, never forced, refused without a token). New `git-user-name` and `git-user-email` inputs. Answer and review modes are unchanged.
- First version: `@cursor` answers and `@cursor review`, a list of API keys, done and failed markers (`cursor-answer`, `cursor-review`), read-only through ask mode and a temporary permission file, the craft code-review skill inlined into the review prompt, and a `marketplaces` input (plugins are not supported on cursor).
