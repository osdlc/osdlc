# Changelog

## Unreleased

- Skill mode: `@codex /<plugin>:<skill> [args]` runs any installed skill and posts its output (marker `codex-skill`). `--apply` lets the agent edit files and the action commits and pushes to the pull request branch with the new `push-token` input (same-repo head only, head must not have moved, never forced, refused without a token). New `git-user-name` and `git-user-email` inputs. Answer and review modes are unchanged.
- First version: `@codex` answers and `@codex review`, a list of API keys, done and failed markers (`codex-answer`, `codex-review`), a read-only sandbox, craft installed through agent-setup, and `marketplaces` / `plugins` inputs.
