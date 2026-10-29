use std::process::Command;

#[test]
fn binary_prints_the_notice_to_stderr_and_exits_1() {
    let out = Command::new(env!("CARGO_BIN_EXE_tradecraft"))
        .output()
        .expect("run the tradecraft binary");
    assert_eq!(out.status.code(), Some(1));
    assert!(out.stdout.is_empty());
    let stderr = String::from_utf8(out.stderr).expect("stderr is UTF-8");
    assert_eq!(stderr.trim(), tradecraft::NOTICE);
    assert!(stderr.contains("cargo install skillwright"));
}
