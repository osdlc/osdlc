---
methodType: test procedure
---

# Config path probe

Finds out which config file fernlog reads on one machine.

For each place fernlog might look for its config file, one at a time:

1. Write a config file there whose `marker` value names the place.
2. Run `fernlog config show` three times and note the `marker` it prints each time, or `none`.
3. Delete the file.

The places to try are `~/.config/fernlog/config.toml` and `~/.fernlog.toml` on every system, and
`~/Library/Application Support/fernlog/config.toml` on macOS as well.

Record one CSV row per run: the place, the run number, and the marker printed. A run that prints
the place's own marker shows that fernlog read that file.

A study result that keeps its files is a record folder, with a copy of the exact script it ran
beside its CSV. A later change to these steps then leaves old results as they were. A run done by
hand may keep no files, and its record says so.
