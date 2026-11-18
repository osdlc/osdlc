# Changelog

## Unreleased

- A key whose account is out of credit or quota now falls through to the next key, like an authentication failure; the list order is the priority. The failure comment says whether all keys failed authentication, all were out of credit, or both.
- First version: answer mode, `@claude review` mode, a list of API keys,
  done and failed markers, and errors posted on every failure path. Moved out
  of osdlc/osdlc's `.github/workflows/claude.yml`.
- The mention filter, key loop, prompt, comment and markers moved to the shared
  `pr-common` scripts, used by claude-pr, codex-pr and cursor-pr. Inputs,
  outputs, markers and trigger are unchanged.
- New `marketplaces` input (agent-setup's format). When set it wins over
  `marketplace-url` and installs through agent-setup; unset, the install is
  the same as before.
