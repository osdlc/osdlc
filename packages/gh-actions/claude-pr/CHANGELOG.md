# Changelog

## Unreleased

- Skill mode: `@claude /<plugin>:<skill> [args]` runs any installed skill and posts its output (marker `claude-skill`). `--apply` lets the agent edit files and the action commits and pushes to the pull request branch with the new `push-token` input (same-repo head only, head must not have moved, never forced, refused without a token). New `git-user-name` and `git-user-email` inputs. Answer and review modes are unchanged.
- First version: answer mode, `@claude review` mode, a list of API keys,
  done and failed markers, and errors posted on every failure path. Moved out
  of osdlc/osdlc's `.github/workflows/claude.yml`.
- The mention filter, key loop, prompt, comment and markers moved to the shared
  `pr-common` scripts, used by claude-pr, codex-pr and cursor-pr. Inputs,
  outputs, markers and trigger are unchanged.
- New `marketplaces` input (agent-setup's format). When set it wins over
  `marketplace-url` and installs through agent-setup; unset, the install is
  the same as before.
