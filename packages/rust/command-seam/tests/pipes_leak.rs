//! A run leaves no thread and no open pipe behind. Its own file, so no other
//! test in the process changes the counts.
#![cfg(target_os = "linux")]

use command_seam::{CommandRunner, RunOptions, SpawnRunner, args};

fn threads() -> usize {
    let status = std::fs::read_to_string("/proc/self/status").expect("status");
    let line = status
        .lines()
        .find_map(|l| l.strip_prefix("Threads:"))
        .expect("Threads line");
    line.trim().parse().expect("thread count")
}

fn open_files() -> usize {
    std::fs::read_dir("/proc/self/fd").expect("fd dir").count()
}

#[test]
fn no_thread_or_pipe_outlives_a_run() {
    let sh = SpawnRunner::new("sh");
    let (threads_before, files_before) = (threads(), open_files());
    for _ in 0..5 {
        let result = sh.run(&args(["-c", "sleep 11 & echo hi"]), &RunOptions::default());
        assert_eq!(result.stdout_lossy(), "hi\n");
        assert!(result.output_incomplete);
    }
    assert_eq!(threads(), threads_before);
    assert_eq!(open_files(), files_before);
}
