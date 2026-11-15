---
methodType: probe
harnesses:
  - "[Gemini CLI](../../harnesses/Gemini%20CLI.md)"
subjects:
  - "[Lifecycle](../../subjects/meta/Lifecycle.md)"
commands:
  gemini-cli:
    - gemini --version
    - gemini -p "Reply with ok."
record:
  - The harness version.
  - The reply, or the error name and message.
  - "The sign-in kind: personal Google account, Workspace, or an API key."
safety:
  - Uses the signed-in Google account. A first run may start a browser sign-in.
imported_from: probe:gemini-sign-in
---

# Gemini CLI sign-in

Checks whether Gemini CLI still serves the sign-in kind used. It needs no fixture.

Imported from `probes/gemini-sign-in/probe.md`.
