---
kind: docs
reportedIn:
  - "[deepseek-ai deepseek-harness shell-env README at 39163dd](../../documents/DeepSeek/deepseek-ai%20deepseek-harness%20shell-env%20README%20at%2039163dd.md)"
harness: "[DeepSeek Harness](../../harnesses/DeepSeek%20Harness.md)"
version: 0.2.2-rc.3
version_basis: inferred
observed: 2026-11-14
locator: "packages/shell/shell-env/README.md#L32 at 39163dd"
excerpt:
  exact: "When the launcher provided a profile context, every call also receives `DSH_PROFILE` (the profile name), `DSH_PROFILE_DIR` (its absolute directory; its `node_modules` holds only profile-installed packages, while the harness's own bundles resolve from the dsh installation), and `DSH_INSTALL_DIR` (the absolute directory of the `@deepseek-ai/dsh` package that anchors the installation, which carries the published `docs/` and `src/`); compositions booted without a profile omit all three."
  prefix: "hat ordinary tools cannot open. "
  suffix: " ### Adding your own environment"
contributions:
  - contributor:
      name: harness-reference research
      agentType: software
    activityType: created
    date: 2026-11-14T00:00:00Z
---

> When the launcher provided a profile context, every call also receives `DSH_PROFILE` (the profile name), `DSH_PROFILE_DIR` (its absolute directory; its `node_modules` holds only profile-installed packages, while the harness's own bundles resolve from the dsh installation), and `DSH_INSTALL_DIR` (the absolute directory of the `@deepseek-ai/dsh` package that anchors the installation, which carries the published `docs/` and `src/`); compositions booted without a profile omit all three.
