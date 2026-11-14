---
slug: dsh
vendor: DeepSeek
homepage: "https://deepseek.com/harness"
docs: "https://deepseek-harness.github.io/deepseek-harness/"
repository: "https://github.com/deepseek-ai/deepseek-harness"
license: MIT
open_source: true
cli: dsh
surfaces: [cli, web, desktop]
status: current
versioning: semver
checked: '2026-11-14'
sources:
  - "[DeepSeek Harness homepage](../documents/DeepSeek/DeepSeek%20Harness%20homepage.md)"
  - "[DeepSeek Harness README](../documents/DeepSeek/DeepSeek%20Harness%20README.md)"
  - "[dsh CLI package.json](../documents/DeepSeek/dsh%20CLI%20package.json.md)"
  - "[DeepSeek Harness releases](../documents/DeepSeek/DeepSeek%20Harness%20releases.md)"
  - "[DeepSeek Harness release dsh-v0.2.2-rc.3](../documents/DeepSeek/DeepSeek%20Harness%20release%20dsh-v0.2.2-rc.3.md)"
  - "[deepseek-ai deepseek-harness apps cli README at 39163dd](../documents/DeepSeek/deepseek-ai%20deepseek-harness%20apps%20cli%20README%20at%2039163dd.md)"
---

DeepSeek Harness is DeepSeek's open-source, plugin-based agent harness, in preview. The `dsh`
command launches it by profile: `dsh web` starts the web UI and `dsh --profile headless` runs one
job in the terminal. ACP and the SDK are also profiles of the same command, which `surfaces` has
no value for. A desktop app is offered for macOS and Windows. Its release tags are semver with a
`dsh-v` prefix, such as dsh-v0.2.2-rc.3.
