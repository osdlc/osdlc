---
proposition:
  subject: '[conda](../../stores/conda.md)'
  predicate: location/data-dirs
  object:
    dirs:
    - platform: linux
      path: ~/miniconda3/pkgs
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/miniconda3/pkgs
      holds: packages
      rebuild: re-download
    - platform: linux
      path: ~/miniconda3/envs
      holds: packages
      rebuild: lost
    - platform: macos
      path: ~/miniconda3/envs
      holds: packages
      rebuild: lost
    - platform: linux
      path: ~/miniforge3/pkgs
      holds: packages
      rebuild: re-download
    - platform: macos
      path: ~/miniforge3/pkgs
      holds: packages
      rebuild: re-download
    - platform: all
      path: ~/.conda/pkgs
      holds: packages
      rebuild: re-download
    - platform: all
      path: ~/.conda/envs
      holds: packages
      rebuild: lost
direction: supports
strength: strong
hasEvidenceLines:
- hasEvidenceItems:
  - '[2026-11-21 conda data directories 1](../../study-results/conda/2026-11-21%20conda%20data%20directories%201.md)'
  - '[2026-11-21 conda data directories 2](../../study-results/conda/2026-11-21%20conda%20data%20directories%202.md)'
  - '[2026-11-21 conda data directories 3](../../study-results/conda/2026-11-21%20conda%20data%20directories%203.md)'
  - '[2026-11-21 conda data directories 4](../../study-results/conda/2026-11-21%20conda%20data%20directories%204.md)'
  - '[2026-11-21 conda data directories 5](../../study-results/conda/2026-11-21%20conda%20data%20directories%205.md)'
  - '[2026-11-21 conda data directories 6](../../study-results/conda/2026-11-21%20conda%20data%20directories%206.md)'
  directionOfEvidenceProvided: supports
  strengthOfEvidenceProvided: strong
  description: The settings page says the package cache is root_dir/pkgs and environments live in the
    root envs directory; the source falls back to ~/.conda/pkgs and ~/.conda/envs; Miniconda installs
    in the home directory as miniconda3 and the Miniforge README uses ~/miniforge3.
contributions:
- contributor:
    name: system-cleanup research
    agentType: software
  activityType: created
  date: '2026-11-21T00:00:00Z'
store: '[conda](../../stores/conda.md)'
subject: '[Data directories](../../subjects/location/Data%20directories.md)'
scope:
  since: null
  until: null
  platform: []
status: current
open:
- 'Windows default paths are not covered: Miniconda''s Windows doc only says the installation''s parent
  directory is the user profile.'
- The base directory varies by installer and user choice (Anaconda uses anaconda3); conda info --base
  gives the real one.
- Environments are marked lost because their contents can only be rebuilt if the user kept an environment.yml
  or lockfile.
---

The settings page says the package cache is root_dir/pkgs and environments live in the root envs directory; the source falls back to ~/.conda/pkgs and ~/.conda/envs; Miniconda installs in the home directory as miniconda3 and the Miniforge README uses ~/miniforge3.
