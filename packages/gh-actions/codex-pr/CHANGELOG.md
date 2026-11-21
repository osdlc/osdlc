# Changelog

## Unreleased

- Input `push-job` (default `false`): without a push job, an `--apply` run that changed files now posts the agent's output and says nothing was pushed, instead of posting nothing. The workflows here set it to `"true"`.
- `.github/workflows/codex.yml` is callable from other repositories (`workflow_call`): a short caller with `secrets: inherit`. Settings come from the calling repository's variables (`PR_AGENT_TRIGGER_USERS`, `PR_AGENT_APP_CLIENT_ID`, `PR_AGENT_ENVIRONMENT`), each overridable by an input; the App key is the secret `PR_AGENT_APP_PRIVATE_KEY` and is passed as `client-id`, not the deprecated `app-id`. The workflow fetches this action and `pr-apply` from its own commit, so pinning the workflow pins them.
- Run mode: `@codex /<plugin>:<skill> [args]` runs any installed skill and posts its output (marker `codex-run`). `@codex <free text> --apply` runs a free-form instruction the same way (edits allowed, same patch artifact and push job; commit `codex: instruction from #<pr> comment`); free text without `--apply` is still an answer. `--apply` lets the agent edit files; the agent job uploads the edits as a patch artifact (output `apply-patch`) and a separate job (action `pr-apply`) validates and pushes it. The agent job has no push token. Answer and review modes are unchanged.
- A key that is out of quota (`insufficient_quota`) now falls through to the next key, like an authentication failure; the list order is the priority.
- First version: `@codex` answers and `@codex review`, a list of API keys, done and failed markers (`codex-answer`, `codex-review`), a read-only sandbox, craft installed through agent-setup, and `marketplaces` / `plugins` inputs.
