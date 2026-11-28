//! A run in its own process group, against real processes.
// Every test reads `/proc`, so the file builds on Linux only.
#![cfg(target_os = "linux")]

use std::fs;
use std::path::Path;
use std::time::{Duration, Instant};

use command_seam::{
    CommandResult, CommandRunner, ProcessGroups, RunOptions, SpawnRunner, StopReason,
};

/// Runs `script` as `sh -c <script> sh <pid_file>`.
fn sh(script: &str, pid_file: &Path, opts: &RunOptions) -> CommandResult {
    let argv = vec![
        "-c".into(),
        script.into(),
        "sh".into(),
        pid_file.as_os_str().to_owned(),
    ];
    SpawnRunner::new("sh").run(&argv, opts)
}

/// Waits for the script to write the grandchild's pid.
fn read_pid(file: &Path) -> u32 {
    let until = Instant::now() + Duration::from_secs(10);
    loop {
        if let Ok(text) = fs::read_to_string(file)
            && let Ok(pid) = text.trim().parse()
        {
            return pid;
        }
        assert!(Instant::now() < until, "no pid in {file:?}");
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// True once the process is gone or a zombie, within `within`.
fn gone(pid: u32, within: Duration) -> bool {
    let until = Instant::now() + within;
    loop {
        let state = fs::read_to_string(format!("/proc/{pid}/stat"))
            .ok()
            .and_then(|s| {
                let rest = s.rsplit_once(')')?.1.trim_start().to_owned();
                rest.chars().next()
            });
        if matches!(state, None | Some('Z')) {
            return true;
        }
        if Instant::now() >= until {
            return false;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

const SHOW_GROUP: &str = "echo $$; cut -d' ' -f5 /proc/$$/stat";

fn two_lines(r: &CommandResult) -> Vec<String> {
    r.stdout_lossy().lines().map(str::to_owned).collect()
}

#[test]
fn the_child_leads_its_own_group() {
    let dir = tempfile::tempdir().unwrap();
    let opts = RunOptions::default().process_group(&ProcessGroups::new());
    let lines = two_lines(&sh(SHOW_GROUP, &dir.path().join("pid"), &opts));
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0], lines[1]);
}

#[test]
fn without_a_group_the_child_shares_the_callers_group() {
    let dir = tempfile::tempdir().unwrap();
    let lines = two_lines(&sh(
        SHOW_GROUP,
        &dir.path().join("pid"),
        &RunOptions::default(),
    ));
    assert_eq!(lines.len(), 2);
    assert_ne!(lines[0], lines[1]);
}

#[test]
fn a_timeout_stops_the_grandchild() {
    let dir = tempfile::tempdir().unwrap();
    let pid_file = dir.path().join("pid");
    let opts = RunOptions::default()
        .process_group(&ProcessGroups::new())
        .timeout(Duration::from_millis(200))
        .kill_grace(Duration::from_secs(5));
    let start = Instant::now();
    let r = sh("sleep 51 & echo $! > \"$1\"; wait", &pid_file, &opts);
    assert!(
        start.elapsed() < Duration::from_secs(3),
        "{:?}",
        start.elapsed()
    );
    assert!(r.timed_out());
    assert_eq!(r.signal(), Some(15));
    assert!(gone(read_pid(&pid_file), Duration::from_secs(2)));
}

#[test]
fn a_group_that_ignores_sigterm_is_killed_after_the_grace() {
    let dir = tempfile::tempdir().unwrap();
    let pid_file = dir.path().join("pid");
    let opts = RunOptions::default()
        .process_group(&ProcessGroups::new())
        .timeout(Duration::from_millis(200))
        .kill_grace(Duration::from_millis(300));
    let start = Instant::now();
    let r = sh(
        "trap '' TERM; sleep 52 & echo $! > \"$1\"; wait",
        &pid_file,
        &opts,
    );
    assert!(
        start.elapsed() < Duration::from_secs(5),
        "{:?}",
        start.elapsed()
    );
    assert!(r.timed_out());
    assert_eq!(r.signal(), Some(9));
    assert!(gone(read_pid(&pid_file), Duration::from_secs(2)));
}

#[test]
fn stop_all_stops_every_running_group() {
    let dir = tempfile::tempdir().unwrap();
    let files = [dir.path().join("a"), dir.path().join("b")];
    let groups = ProcessGroups::new();
    let opts = RunOptions::default().process_group(&groups);
    let start = Instant::now();
    let results: Vec<CommandResult> = std::thread::scope(|s| {
        let handles: Vec<_> = files
            .iter()
            .map(|f| s.spawn(|| sh("sleep 53 & echo $! > \"$1\"; wait", f, &opts)))
            .collect();
        for f in &files {
            read_pid(f);
        }
        groups.stop_all();
        handles.into_iter().map(|h| h.join().unwrap()).collect()
    });
    assert!(start.elapsed() < Duration::from_secs(10));
    for r in &results {
        assert_eq!(r.stop().map(|s| s.reason), Some(StopReason::Abort));
        assert_eq!(r.signal(), Some(15));
    }
    for f in &files {
        assert!(gone(read_pid(f), Duration::from_secs(2)));
    }
}

#[test]
fn stop_all_stops_what_the_group_left_after_its_leader_exited() {
    let dir = tempfile::tempdir().unwrap();
    let pid_file = dir.path().join("pid");
    let groups = ProcessGroups::new();
    let opts = RunOptions::default().process_group(&groups);
    // The leader exits at once; the `sleep` it left holds the run's stdout.
    let r = std::thread::scope(|s| {
        let run = s.spawn(|| sh("sleep 59 & echo $! > \"$1\"", &pid_file, &opts));
        read_pid(&pid_file);
        // Let the runner see the leader's exit first; the stop then comes
        // inside the one-second wait on the held pipe.
        std::thread::sleep(Duration::from_millis(200));
        groups.stop_all();
        run.join().unwrap()
    });
    assert_eq!(r.stop().map(|s| s.reason), Some(StopReason::Abort));
    assert!(gone(read_pid(&pid_file), Duration::from_secs(2)));
}

#[test]
fn a_late_stop_keeps_what_the_group_wrote_while_stopping() {
    let dir = tempfile::tempdir().unwrap();
    let pid_file = dir.path().join("pid");
    let groups = ProcessGroups::new();
    let opts = RunOptions::default().process_group(&groups);
    // The member the leader leaves says `bye` a little after it is told to
    // stop.
    let script = "(trap 'sleep 0.6; echo bye; exit 0' TERM; sleep 59 & wait) & echo $! > \"$1\"";
    let r = std::thread::scope(|s| {
        let run = s.spawn(|| sh(script, &pid_file, &opts));
        read_pid(&pid_file);
        // Inside the one-second wait on the held pipe, with a stop that ends
        // after that wait would have.
        std::thread::sleep(Duration::from_millis(600));
        groups.stop_all();
        run.join().unwrap()
    });
    assert_eq!(r.stop().map(|s| s.reason), Some(StopReason::Abort));
    assert_eq!(r.stdout_lossy(), "bye\n");
}

#[test]
fn a_run_after_stop_all_never_starts() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("started");
    let groups = ProcessGroups::new();
    groups.stop_all();
    let r = sh(
        "echo started > \"$1\"",
        &file,
        &RunOptions::default().process_group(&groups),
    );
    assert_eq!(r.stop().map(|s| s.reason), Some(StopReason::Abort));
    assert_eq!(r.signal(), None);
    assert!(!file.exists());
}
