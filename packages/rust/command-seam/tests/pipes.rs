//! Reading a child's pipes on the calling thread: a held pipe is closed when
//! the run returns, and stdin never holds the run.
#![cfg(unix)]

use std::time::{Duration, Instant};

use command_seam::{CommandRunner, RunOptions, SpawnRunner, args};

#[test]
fn a_held_pipe_is_closed_when_the_run_returns() {
    let dir = tempfile::tempdir().expect("tempdir");
    let marker = dir.path().join("status");
    let script = "(trap '' PIPE; sleep 2.5; /bin/echo late; echo $? > \"$1\") & echo hi";
    let start = Instant::now();
    let result = SpawnRunner::new("sh").run(
        &args(["-c", script, "sh", marker.to_str().expect("utf-8 path")]),
        &RunOptions::default(),
    );
    assert!(start.elapsed() < Duration::from_secs(2));
    assert_eq!(result.stdout_lossy(), "hi\n");
    assert!(result.output_incomplete);

    let give_up = Instant::now() + Duration::from_secs(5);
    let status = loop {
        if let Ok(text) = std::fs::read_to_string(&marker)
            && let Ok(n) = text.trim().parse::<i32>()
        {
            break n;
        }
        assert!(
            Instant::now() < give_up,
            "the held pipe's writer never finished"
        );
        std::thread::sleep(Duration::from_millis(50));
    };
    assert_ne!(
        status, 0,
        "the late write reached a pipe that was still open"
    );
}

#[test]
fn a_child_that_stops_reading_stdin_does_not_hold_the_run() {
    let start = Instant::now();
    let opts = RunOptions::default().input(vec![b'a'; 1 << 20]);
    let result = SpawnRunner::new("head").run(&args(["-c", "10"]), &opts);
    assert!(start.elapsed() < Duration::from_secs(2));
    assert_eq!(result.stdout.len(), 10);
    assert_eq!(result.exit_code(), Some(0));
    assert!(!result.output_incomplete);
}

#[test]
fn input_larger_than_a_pipe_is_written_while_output_is_read() {
    let input: Vec<u8> = (0..1 << 20).map(|i| (i % 251) as u8).collect();
    let result = SpawnRunner::new("cat").run(&[], &RunOptions::default().input(input.clone()));
    assert_eq!(result.stdout, input);
    assert!(!result.output_incomplete);
}

#[test]
fn an_empty_input_closes_stdin() {
    let start = Instant::now();
    let opts = RunOptions::default()
        .input(Vec::new())
        .timeout(Duration::from_secs(5));
    let result = SpawnRunner::new("cat").run(&[], &opts);
    assert!(start.elapsed() < Duration::from_secs(2));
    assert_eq!(result.exit_code(), Some(0));
    assert!(result.stdout.is_empty());
}
