# Changelog

## Unreleased

- Input `push-job` (default `false`): without a push job, an `--apply` run that changed files now posts the agent's output and says nothing was pushed, instead of posting nothing. The workflows here set it to `"true"`.
- `.github/workflows/claude.yml` is callable from other repositories (`workflow_call`): a short caller with `secrets: inherit`. Settings come from the calling repository's variables (`PR_AGENT_TRIGGER_USERS`, `PR_AGENT_APP_CLIENT_ID`, `PR_AGENT_ENVIRONMENT`), each overridable by an input; the App key is the secret `PR_AGENT_APP_PRIVATE_KEY` and is passed as `client-id`, not the deprecated `app-id`. The workflow fetches this action and `pr-apply` from its own commit, so pinning the workflow pins them.
- Run mode: `@claude /<plugin>:<skill> [args]` runs any installed skill and posts its output (marker `claude-run`). `@claude <free text> --apply` runs a free-form instruction the same way (edits allowed, same patch artifact and push job; commit `claude: instruction from #<pr> comment`); free text without `--apply` is still an answer. `--apply` lets the agent edit files; the agent job uploads the edits as a patch artifact (output `apply-patch`) and a separate job (action `pr-apply`) validates and pushes it. The agent job has no push token. Answer and review modes are unchanged.
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
