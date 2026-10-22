# Parallel slots

How many copies of a job to run at once on this machine. A slot is one running instance with
its own copy of whatever it writes. An instance counts everything the slot runs: the app, its
servers, and the browser or GUI driver that drives it.

## Measure

Take the lowest of three limits:

- **Cores:** CPU cores / cores one instance needs.
- **Memory:** free RAM / RAM one instance needs.
- **Load:** cores minus the current 1-minute load average, / cores one instance needs.

Read the numbers:

| What | macOS | Linux |
| --- | --- | --- |
| Cores | `sysctl -n hw.ncpu` | `nproc` |
| Load | `sysctl -n vm.loadavg \| tr -d '{}' \| awk '{print $1}'` (the output is `{ 1.2 1.5 1.7 }`) | `cut -d' ' -f1 /proc/loadavg` |
| Free RAM | `vm_stat` (free + inactive pages × page size) | `grep MemAvailable /proc/meminfo` |

Measure one instance once (`ps -o rss,pcpu -p <pid>` while it runs) when its needs are not
known. Round down, and use at least 1.

## Cap by the kind of app

- **Web app, API or CLI:** no cap beyond the measure. Give each slot its own port range and data
  copy.
- **Desktop GUI app:** 1 on macOS or Windows. On Linux, one per virtual display (Xvfb).
- **Bound to one shared resource** (a fixed port, a single database, a single-instance lock):
  1.

When the user names a number, use it.
