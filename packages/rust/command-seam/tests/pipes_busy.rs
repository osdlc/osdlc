//! A busy machine does not make a complete run incomplete. Its own file, so
//! the load it makes is not seen by other tests.
#![cfg(unix)]

use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

use command_seam::{CommandRunner, RunOptions, SpawnRunner, args};

#[test]
fn a_busy_machine_does_not_cut_output_short() {
    let spinners = 2 * thread::available_parallelism().map_or(4, usize::from);
    let stop = AtomicBool::new(false);
    thread::scope(|scope| {
        for _ in 0..spinners {
            scope.spawn(|| {
                while !stop.load(Ordering::Relaxed) {
                    std::hint::spin_loop();
                }
            });
        }
        let printf = SpawnRunner::new("printf");
        for _ in 0..300 {
            let result = printf.run(&args(["x"]), &RunOptions::default());
            assert_eq!(result.stdout_lossy(), "x");
            assert_eq!(result.exit_code(), Some(0));
            assert!(!result.output_incomplete);
        }
        stop.store(true, Ordering::Relaxed);
    });
}
