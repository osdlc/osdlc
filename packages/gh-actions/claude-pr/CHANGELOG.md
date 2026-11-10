# Changelog

## Unreleased

- Skill mode: `@claude /<plugin>:<skill> [args]` runs any installed skill and posts its output (marker `claude-skill`). `--apply` lets the agent edit files; the agent job uploads the edits as a patch artifact (output `apply-patch`) and a separate job in the `pr-agent` environment (action `pr-apply`) validates and pushes it. The agent job has no push token. Answer and review modes are unchanged.
- First version: answer mode, `@claude review` mode, a list of API keys,
  done and failed markers, and errors posted on every failure path. Moved out
  of osdlc/osdlc's `.github/workflows/claude.yml`.
- The mention filter, key loop, prompt, comment and markers moved to the shared
  `pr-common` scripts, used by claude-pr, codex-pr and cursor-pr. Inputs,
  outputs, markers and trigger are unchanged.
- New `marketplaces` input (agent-setup's format). When set it wins over
  `marketplace-url` and installs through agent-setup; unset, the install is
  the same as before.
