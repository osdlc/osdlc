//! Every reader through the public surface.

use std::collections::BTreeMap;

use finding_formats::{Error, Fact, Format, Level, Options, Report, read, read_bytes, read_lcov};

fn fixture(name: &str) -> String {
    std::fs::read_to_string(format!(
        "{}/tests/fixtures/{name}",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
}

/// Reads a fixture with the default options.
fn read_fixture(format: Format, name: &str) -> Report {
    read(format, &fixture(name), &Options::default()).unwrap()
}

fn sorted_keys(value: &serde_json::Value) -> Vec<String> {
    let mut keys: Vec<_> = value.as_object().unwrap().keys().cloned().collect();
    keys.sort();
    keys
}

fn int(report: &Report, name: &str) -> i64 {
    match report.facts.get(name) {
        Some(Fact::Int(n)) => *n,
        other => panic!("fact {name}: {other:?}"),
    }
}

fn pattern_options() -> Options {
    Options {
        pattern: Some(
            r"^(?P<path>[^:]+):(?P<line>\d+):(?P<col>\d+): (?P<level>\w+) (?P<rule>\S+) (?P<message>.*)$"
                .to_owned(),
        ),
        ..Options::default()
    }
}

#[test]
fn lines_default_layout_with_and_without_column() {
    let r = read_fixture(Format::Lines, "default.txt");
    assert_eq!(r.findings.len(), 2);
    let f = &r.findings[0];
    assert_eq!(f.path.as_deref(), Some("src/main.rs"));
    assert_eq!(f.line, Some(12));
    assert_eq!(f.message, "unused variable `x`");
    assert_eq!(f.level, Level::Error);
    assert_eq!(r.findings[0].col, None);
    assert_eq!(r.findings[1].line, Some(40));
    assert_eq!(r.findings[1].col, Some(7));
    assert_eq!(r.findings[1].message, "missing semicolon");
}

#[test]
fn lines_column_zero_is_not_kept() {
    let r = read(Format::Lines, "a.rs:3:0: msg\n", &Options::default()).unwrap();
    assert_eq!(r.findings.len(), 1);
    assert_eq!(r.findings[0].line, Some(3));
    assert_eq!(r.findings[0].col, None);
}

#[test]
fn lines_unmatched_are_exposed_and_blank_lines_skipped() {
    let r = read_fixture(Format::Lines, "default.txt");
    assert_eq!(r.unmatched, ["this line is chatter from the tool"]);
}

#[test]
fn lines_custom_pattern_with_level_and_rule() {
    let r = read(
        Format::Lines,
        &fixture("eslint-like.txt"),
        &pattern_options(),
    )
    .unwrap();
    assert_eq!(r.findings.len(), 3);
    assert_eq!(r.findings[0].rule, "no-unused-vars");
    assert_eq!(r.findings[0].level, Level::Warning);
    assert_eq!(r.findings[0].col, Some(5));
    assert_eq!(r.findings[1].level, Level::Error);
    assert_eq!(r.findings[2].level, Level::Note);
    assert_eq!(r.unmatched, ["summary: 3 problems"]);
}

#[test]
fn lines_levels_map_overrides_builtin_words() {
    let mut options = pattern_options();
    options.levels = BTreeMap::from([
        ("warning".to_owned(), Level::Error),
        ("info".to_owned(), Level::Warning),
    ]);
    let r = read(Format::Lines, &fixture("eslint-like.txt"), &options).unwrap();
    assert_eq!(r.findings[0].level, Level::Error);
    assert_eq!(r.findings[2].level, Level::Warning);
}

#[test]
fn lines_paths_from_joins_and_normalises() {
    let options = Options {
        paths_from: Some("packages/web".to_owned()),
        ..Options::default()
    };
    let r = read(Format::Lines, &fixture("paths.txt"), &options).unwrap();
    assert_eq!(r.findings[0].path.as_deref(), Some("packages/web/src/a.rs"));
    assert_eq!(r.findings[1].path.as_deref(), Some("packages/shared/b.rs"));
}

#[test]
fn lines_windows_path_keeps_drive_and_uses_forward_slashes() {
    let r = read_fixture(Format::Lines, "windows.txt");
    assert_eq!(r.findings[0].path.as_deref(), Some("C:/work/app/src/a.rs"));
    assert_eq!(r.findings[0].line, Some(12));
}

#[test]
fn lines_bad_pattern_is_a_lines_error() {
    let bad = |pattern: &str| Options {
        pattern: Some(pattern.to_owned()),
        ..Options::default()
    };
    assert!(matches!(
        read(Format::Lines, "x", &bad("(")),
        Err(Error::Lines { .. })
    ));
    assert!(matches!(
        read(Format::Lines, "x", &bad("^(?P<path>.*)$")),
        Err(Error::Lines { .. })
    ));
}

#[test]
fn lines_empty_input_is_an_empty_report() {
    let r = read(Format::Lines, "", &Options::default()).unwrap();
    assert!(r.findings.is_empty() && r.unmatched.is_empty());
}

#[test]
fn sarif_maps_results_across_runs() {
    let r = read_fixture(Format::Sarif, "two-runs.sarif");
    assert_eq!(r.findings.len(), 4);

    let a = &r.findings[0];
    assert_eq!(a.rule, "A001");
    assert_eq!(
        a.level,
        Level::Error,
        "from the rule's defaultConfiguration"
    );
    assert_eq!(
        a.path.as_deref(),
        Some("/repo/src/a.rs"),
        "file:// stripped"
    );
    assert_eq!((a.line, a.end_line), (Some(4), Some(6)));
    assert_eq!(a.col, Some(2));
    assert_eq!(a.fingerprint.as_deref(), Some("abc123"));

    let b = &r.findings[1];
    assert_eq!(
        (b.level, b.path.as_deref()),
        (Level::Note, Some("src/b.rs"))
    );
    assert_eq!(b.fingerprint.as_deref(), Some("fp-b"));

    let c = &r.findings[2];
    assert_eq!(c.level, Level::Warning, "SARIF default");
    assert_eq!((c.path.as_deref(), c.line), (None, None));

    assert_eq!(r.findings[3].level, Level::Note, "none maps to note");

    assert_eq!(int(&r, "results"), 4);
    assert_eq!(int(&r, "results_error"), 1);
    assert_eq!(int(&r, "results_warning"), 1);
    assert_eq!(int(&r, "results_note"), 2);
}

#[test]
fn sarif_with_no_results_is_empty() {
    let r = read_fixture(Format::Sarif, "empty.sarif");
    assert!(r.findings.is_empty());
    assert_eq!(int(&r, "results"), 0);
}

#[test]
fn sarif_malformed_is_a_sarif_error() {
    let err = read(Format::Sarif, "{\"runs\": [", &Options::default()).unwrap_err();
    assert!(matches!(err, Error::Sarif { line: 1, .. }), "{err}");
}

#[test]
fn sarif_empty_uri_is_no_path() {
    let doc = |uri: &str| {
        format!(
            r#"{{"runs":[{{"results":[{{"ruleId":"R","message":{{"text":"m"}},"locations":[
            {{"physicalLocation":{{"artifactLocation":{{"uri":"{uri}"}},"region":{{"startLine":3}}}}}}]}}]}}]}}"#
        )
    };
    let from_folder = Options {
        paths_from: Some("packages/web".to_owned()),
        ..Options::default()
    };
    for uri in ["", "file://"] {
        for options in [&Options::default(), &from_folder] {
            let r = read(Format::Sarif, &doc(uri), options).unwrap();
            assert_eq!(r.findings[0].path, None, "uri {uri:?}");
            assert_eq!(r.findings[0].line, Some(3), "the line is kept");
        }
    }
    let r = read(Format::Sarif, &doc("src/a.rs"), &from_folder).unwrap();
    assert_eq!(r.findings[0].path.as_deref(), Some("packages/web/src/a.rs"));
}

#[test]
fn sarif_rule_definition_fills_a_missing_level_or_id() {
    let r = read(
        Format::Sarif,
        r#"{"runs":[{
            "tool":{"driver":{"rules":[
                {"id":"A","defaultConfiguration":{"level":"error"}},
                {"id":"B","defaultConfiguration":{"level":"note"}},
                {"id":"B","defaultConfiguration":{"level":"error"}}
            ]}},
            "results":[
                {"ruleId":"A"},
                {"ruleId":"B"},
                {"ruleIndex":1},
                {"rule":{"index":0}},
                {"ruleId":"A","ruleIndex":9},
                {"ruleId":"B","ruleIndex":0},
                {"ruleId":"A","level":"warning"},
                {"ruleId":"unknown"},
                {}
            ]
        }]}"#,
        &Options::default(),
    )
    .unwrap();
    let got: Vec<_> = r
        .findings
        .iter()
        .map(|f| (f.rule.as_str(), f.level))
        .collect();
    assert_eq!(
        got,
        [
            ("A", Level::Error),
            ("B", Level::Note),
            ("B", Level::Note),
            ("A", Level::Error),
            ("A", Level::Error),
            ("B", Level::Error),
            ("A", Level::Warning),
            ("unknown", Level::Warning),
            ("sarif", Level::Warning),
        ],
        "by id (first definition wins), by index, index out of range, index over id"
    );
    assert_eq!(int(&r, "results"), 9);
    assert_eq!(int(&r, "results_error"), 4);
    assert_eq!(int(&r, "results_warning"), 3);
    assert_eq!(int(&r, "results_note"), 2);
}

#[test]
fn sarif_an_index_that_is_not_usable_is_no_index() {
    // SARIF's own "no index" value is -1, and 18446744073709551615 is -1 as a
    // tool with unsigned indexes writes it. No such value may cost the
    // findings around it.
    for index in ["-1", "18446744073709551615", "1.5", "0.0", "1e30", "7"] {
        for result in [
            format!(r#"{{"ruleId":"A","ruleIndex":{index}}}"#),
            format!(r#"{{"ruleId":"A","rule":{{"index":{index}}}}}"#),
        ] {
            let doc = format!(
                r#"{{"runs":[{{
                    "tool":{{"driver":{{"rules":[{{"id":"A","defaultConfiguration":{{"level":"error"}}}}]}}}},
                    "results":[{{"ruleId":"B","level":"note"}},{result}]
                }}]}}"#
            );
            let r = read(Format::Sarif, &doc, &Options::default()).unwrap();
            let got: Vec<_> = r
                .findings
                .iter()
                .map(|f| (f.rule.as_str(), f.level))
                .collect();
            assert_eq!(got, [("B", Level::Note), ("A", Level::Error)], "{result}");
        }
    }
}

#[test]
fn sarif_rule_index_that_is_not_usable_falls_back_to_rule_dot_index() {
    for index in ["-1", "18446744073709551615", "2.0", "9"] {
        let doc = format!(
            r#"{{"runs":[{{
                "tool":{{"driver":{{"rules":[
                    {{"id":"A","defaultConfiguration":{{"level":"error"}}}},
                    {{"id":"B","defaultConfiguration":{{"level":"note"}}}}
                ]}}}},
                "results":[{{"ruleIndex":{index},"rule":{{"index":1}}}}]
            }}]}}"#
        );
        let r = read(Format::Sarif, &doc, &Options::default()).unwrap();
        let f = &r.findings[0];
        assert_eq!((f.rule.as_str(), f.level), ("B", Level::Note), "{index}");
    }
}

#[test]
fn sarif_null_runs_is_no_findings() {
    // The schema allows `null`: a tool that failed before it had any run.
    let r = read(
        Format::Sarif,
        r#"{"version":"2.1.0","runs":null}"#,
        &Options::default(),
    )
    .unwrap();
    assert!(r.findings.is_empty());
}

#[test]
fn sarif_column_no_column_can_be_costs_only_that_column() {
    let region = |region: &str| {
        format!(
            r#"{{"ruleId":"A","locations":[{{"physicalLocation":{{"artifactLocation":{{"uri":"a.rs"}},
                "region":{region}}}}}]}}"#
        )
    };
    let results = [
        region(r#"{"startLine":3,"startColumn":0}"#),
        region(r#"{"startLine":3,"startColumn":-1}"#),
        region(r#"{"startLine":3,"startColumn":1.5}"#),
        region(r#"{"startLine":3,"startColumn":1e3}"#),
        region(r#"{"startLine":3,"startColumn":4294967296}"#),
        region(r#"{"startLine":3,"startColumn":9}"#),
    ];
    let doc = format!(r#"{{"runs":[{{"results":[{}]}}]}}"#, results.join(","));
    let r = read(Format::Sarif, &doc, &Options::default()).unwrap();
    let got: Vec<_> = r.findings.iter().map(|f| (f.line, f.col)).collect();
    assert_eq!(
        got,
        [
            (Some(3), None),
            (Some(3), None),
            (Some(3), None),
            (Some(3), None),
            (Some(3), None),
            (Some(3), Some(9)),
        ]
    );
}

#[test]
fn sarif_line_no_line_can_be_costs_only_that_line() {
    let region = |region: &str| {
        format!(
            r#"{{"ruleId":"A","locations":[{{"physicalLocation":{{"artifactLocation":{{"uri":"a.rs"}},
                "region":{region}}}}}]}}"#
        )
    };
    let results = [
        region(r#"{"startLine":4294967296,"endLine":-1}"#),
        region(r#"{"startLine":9223372036854775808,"endLine":18446744073709551615}"#),
        region(r#"{"startLine":12.0,"endLine":12.5}"#),
        region(r#"{"startLine":1e30,"endLine":4294967295}"#),
        region(r#"{"startLine":7,"endLine":0}"#),
    ];
    let doc = format!(r#"{{"runs":[{{"results":[{}]}}]}}"#, results.join(","));
    let r = read(Format::Sarif, &doc, &Options::default()).unwrap();
    let got: Vec<_> = r
        .findings
        .iter()
        .map(|f| (f.path.as_deref(), f.line, f.end_line))
        .collect();
    assert_eq!(
        got,
        [
            (Some("a.rs"), None, None),
            (Some("a.rs"), None, None),
            (Some("a.rs"), None, None),
            (Some("a.rs"), None, Some(u32::MAX)),
            (Some("a.rs"), Some(7), None),
        ]
    );
}

#[test]
fn sarif_rule_named_only_through_rule_id_takes_its_default_level() {
    let r = read(
        Format::Sarif,
        r#"{"runs":[{
            "tool":{"driver":{"rules":[{"id":"no-eval","defaultConfiguration":{"level":"error"}}]}},
            "results":[{"rule":{"id":"no-eval"}}]
        }]}"#,
        &Options::default(),
    )
    .unwrap();
    assert_eq!(r.findings[0].rule, "no-eval");
    assert_eq!(r.findings[0].level, Level::Error);
}

#[test]
fn junit_testsuites_with_nested_suites() {
    let r = read_fixture(Format::Junit, "suites.xml");
    assert_eq!(r.findings.len(), 2);

    let failure = &r.findings[0];
    assert_eq!(failure.rule, "app.Math.adds");
    assert_eq!(failure.level, Level::Error);
    assert_eq!(
        failure.message, "expected 4 & got 5",
        "attribute, entity resolved"
    );
    assert_eq!(failure.path.as_deref(), Some("tests/math.rs"));
    assert_eq!(failure.line, Some(10));

    let error = &r.findings[1];
    assert_eq!(error.rule, "app.Io.reads");
    assert_eq!(
        error.message, "read failed: <eof>",
        "first line of the text"
    );
    assert_eq!(error.path, None);

    assert_eq!(int(&r, "tests"), 4);
    assert_eq!(int(&r, "failures"), 1);
    assert_eq!(int(&r, "errors"), 1);
    assert_eq!(int(&r, "skipped"), 1);
    assert_eq!(r.facts.get("time"), Some(&Fact::Float(2.0)));
}

#[test]
fn junit_bare_testsuite_root_and_cdata() {
    let r = read_fixture(Format::Junit, "bare.xml");
    assert_eq!(r.findings.len(), 1);
    assert_eq!(r.findings[0].rule, "no_class");
    assert_eq!(r.findings[0].message, "boom <raw>");
    assert_eq!(int(&r, "tests"), 2);
}

#[test]
fn junit_time_falls_back_to_the_root_attribute() {
    let r = read(
        Format::Junit,
        r#"<testsuite time="9"><testcase name="a"/></testsuite>"#,
        &Options::default(),
    )
    .unwrap();
    assert_eq!(r.facts.get("time"), Some(&Fact::Float(9.0)));
}

#[test]
fn junit_empty_suite_is_an_empty_report() {
    let r = read(Format::Junit, "<testsuites/>", &Options::default()).unwrap();
    assert!(r.findings.is_empty());
    assert_eq!(int(&r, "tests"), 0);
}

#[test]
fn junit_malformed_is_a_junit_error() {
    for bad in [
        "<testsuite><testcase></testsuite>",
        "<testsuite>",
        "not xml",
        "",
    ] {
        let err = read(Format::Junit, bad, &Options::default()).unwrap_err();
        assert!(matches!(err, Error::Junit { .. }), "{bad:?}: {err}");
    }
}

#[test]
fn junit_empty_problem_elements_and_fallback_messages() {
    let r = read(
        Format::Junit,
        r#"<testsuite>
            <testcase name="a" file="" line="0"><failure message="m"/><error/></testcase>
            <testcase name="b" classname=""><failure type="Kind"/><failure message="  ">

                body
            </failure></testcase>
            <testcase/>
        </testsuite>"#,
        &Options::default(),
    )
    .unwrap();
    let got: Vec<_> = r
        .findings
        .iter()
        .map(|f| (f.rule.as_str(), f.message.as_str()))
        .collect();
    assert_eq!(
        got,
        [
            ("a", "m"),
            ("a", "test errored"),
            ("b", "Kind"),
            ("b", "body")
        ]
    );
    assert_eq!(
        (r.findings[0].path.as_deref(), r.findings[0].line),
        (None, None)
    );
    assert_eq!(int(&r, "tests"), 3);
    assert_eq!(int(&r, "failures"), 3);
    assert_eq!(int(&r, "errors"), 1);
    assert_eq!(r.facts.get("time"), None);
}

#[test]
fn junit_text_joins_cdata_entities_and_character_references() {
    let r = read(
        Format::Junit,
        "<testsuite><testcase name=\"t\"><failure>a &lt;&gt;&amp;&quot;&apos; \
         &#33;&#x21; &nbsp; <![CDATA[<&amp;>]]> z</failure></testcase></testsuite>",
        &Options::default(),
    )
    .unwrap();
    assert_eq!(r.findings[0].message, "a <>&\"' !! &nbsp; <&amp;> z");
}

#[test]
fn junit_reads_paths_from_and_the_first_attribute_of_a_name() {
    let options = Options {
        paths_from: Some("packages/web".to_owned()),
        ..Options::default()
    };
    let r = read(
        Format::Junit,
        r#"<testsuite><testcase x:name="first" name="second" classname="C" file="./t/a.rs" line=" 7 ">
            <failure message="m"/></testcase></testsuite>"#,
        &options,
    )
    .unwrap();
    let f = &r.findings[0];
    assert_eq!(f.rule, "C.first");
    assert_eq!(f.path.as_deref(), Some("packages/web/t/a.rs"));
    assert_eq!(f.line, Some(7));
}

#[test]
fn junit_malformed_attribute_on_an_unread_element_is_an_error() {
    for bad in [
        r#"<testsuite><properties><property name="a" name="b"/></properties></testsuite>"#,
        r#"<testsuite><system-out note="&bogus;"/></testsuite>"#,
        r#"<testsuite><testcase name="t" time=1/></testsuite>"#,
    ] {
        let err = read(Format::Junit, bad, &Options::default()).unwrap_err();
        assert!(
            matches!(err, Error::Junit { line: 1, .. }),
            "{bad:?}: {err}"
        );
    }
}

#[test]
fn lcov_two_files_with_and_without_totals() {
    let r = read_fixture(Format::Lcov, "two-files.info");
    assert!(r.findings.is_empty());
    assert_eq!(int(&r, "files"), 2);
    assert_eq!(int(&r, "lines_found"), 7);
    assert_eq!(
        int(&r, "lines_hit"),
        4,
        "a.rs from LH, b.rs counted from DA"
    );
    assert_eq!(r.facts.get("lines_percent"), Some(&Fact::Float(57.14)));
    assert_eq!(int(&r, "branches_found"), 2);
    assert_eq!(int(&r, "branches_hit"), 1);
    assert_eq!(int(&r, "functions_found"), 2);
    assert_eq!(int(&r, "functions_hit"), 1);
}

#[test]
fn lcov_exposes_per_file_totals() {
    let report = read_lcov(&fixture("two-files.info")).unwrap();
    let [a, b] = &report.files[..] else {
        panic!("two files")
    };
    assert_eq!(a.path, "src/a.rs");
    assert_eq!((a.lines.found, a.lines.hit), (3, 2));
    assert!(a.branches.is_some());
    assert_eq!(b.path, "src/b.rs");
    assert_eq!((b.lines.found, b.lines.hit), (4, 2));
    assert_eq!((b.branches, b.functions), (None, None));
}

#[test]
fn lcov_zero_lines_has_no_percent() {
    let r = read_fixture(Format::Lcov, "zero.info");
    assert_eq!(int(&r, "lines_found"), 0);
    assert_eq!(r.facts.get("lines_percent"), None);
    assert_eq!(r.facts.get("branches_found"), None);
}

#[test]
fn lcov_empty_input_is_an_empty_report() {
    let r = read(Format::Lcov, "", &Options::default()).unwrap();
    assert_eq!(int(&r, "files"), 0);
}

#[test]
fn lcov_comment_lines_are_skipped_anywhere() {
    let report = read_lcov(
        "#made by lcov 2.3\nTN:\nSF:a.rs\n#no colon here\nDA:1,1\n  #indented: DA:2,0\nend_of_record\n#after\n",
    )
    .unwrap();
    let [a] = &report.files[..] else {
        panic!("one file")
    };
    assert_eq!(a.path, "a.rs");
    assert_eq!((a.lines.found, a.lines.hit), (1, 1));

    let only_comments = read_lcov("#one\n#two\n").unwrap();
    assert!(only_comments.files.is_empty());
}

#[test]
fn lcov_kf_opens_a_record_like_sf() {
    let report = read_lcov("KF:a.rs\nDA:1,1\nDA:2,0\nKF:b.rs\nDA:1,1\nend_of_record\n").unwrap();
    let [a, b] = &report.files[..] else {
        panic!("two files")
    };
    assert_eq!(a.path, "a.rs");
    assert_eq!((a.lines.found, a.lines.hit), (2, 1));
    assert_eq!(b.path, "b.rs");
    assert_eq!((b.lines.found, b.lines.hit), (1, 1));
}

#[test]
fn lcov_malformed_is_an_lcov_error() {
    for (bad, line) in [
        ("SF:a\nDA:x,1\n", 2),
        ("DA:1,1\n", 1),
        ("SF:a\ngarbage\n", 2),
        ("SF:a\nLF:-1\n", 2),
    ] {
        let err = read(Format::Lcov, bad, &Options::default()).unwrap_err();
        assert!(
            matches!(err, Error::Lcov { line: l, .. } if l == line),
            "{bad:?}: {err}"
        );
    }
}

#[test]
fn lcov_field_counts_and_untaken_branches() {
    let report = read_lcov(
        "SF:a\nDA:1,2,checksum\nDA:2,0\nBRDA:1,0,0,-\nBRDA:1,0,1,4\nFN:1,f\nFNDA:0,f\nFNDA:2,g\n",
    )
    .unwrap();
    let a = &report.files[0];
    assert_eq!((a.lines.found, a.lines.hit), (2, 1));
    assert_eq!(a.branches.map(|t| (t.found, t.hit)), Some((2, 1)));
    assert_eq!(a.functions.map(|t| (t.found, t.hit)), Some((1, 1)));

    let summary_only = read_lcov("SF:a\nBRH:1\nFNH:3\nFNF:4\nend_of_record\n").unwrap();
    let a = &summary_only.files[0];
    assert_eq!(
        a.branches, None,
        "BRH without BRF or BRDA is no branch data"
    );
    assert_eq!(a.functions.map(|t| (t.found, t.hit)), Some((4, 3)));

    for bad in [
        "SF:a\nDA:1\n",
        "SF:a\nBRDA:1,0,0\n",
        "SF:a\nBRDA:1,0,0,1,9\n",
        "SF:a\nBRDA:1,0,0,x\n",
        "SF:a\nFNDA:x,f\n",
        "SF:a\nFNH:x\n",
    ] {
        let err = read_lcov(bad).unwrap_err();
        assert!(matches!(err, Error::Lcov { line: 2, .. }), "{bad:?}: {err}");
    }
    let err = read_lcov("TN:\nVER:1\nDA:x\n").unwrap_err();
    assert_eq!(
        err.to_string(),
        "lcov: line 3: `DA` before any `SF`",
        "unknown records are skipped; the missing file is reported before the bad field"
    );
}

#[test]
fn format_parses_and_displays_contract_names() {
    for name in ["lines", "sarif", "junit", "lcov"] {
        let format: Format = name.parse().unwrap();
        assert_eq!(format.to_string(), name);
        assert_eq!(
            serde_json::to_string(&format).unwrap(),
            format!("\"{name}\"")
        );
    }
    assert!(matches!(
        "result".parse::<Format>(),
        Err(Error::UnknownFormat(_))
    ));
}

#[test]
fn read_bytes_rejects_invalid_utf8() {
    let err = read_bytes(Format::Lines, &[0xff, 0xfe], &Options::default()).unwrap_err();
    assert!(matches!(err, Error::Utf8(_)));
}

#[test]
fn finding_json_uses_the_schema_field_names() {
    let r = read_fixture(Format::Sarif, "two-runs.sarif");
    let full = serde_json::to_value(&r.findings[0]).unwrap();
    assert_eq!(
        sorted_keys(&full),
        [
            "col",
            "end_line",
            "fingerprint",
            "level",
            "line",
            "message",
            "path",
            "rule"
        ]
    );
    assert_eq!(full["level"], "error");

    let bare = serde_json::to_value(&r.findings[2]).unwrap();
    assert_eq!(
        sorted_keys(&bare),
        ["level", "message", "rule"],
        "None fields are skipped"
    );
}

#[test]
fn report_json_has_findings_and_facts_and_hides_empty_unmatched() {
    let r = read_fixture(Format::Lcov, "zero.info");
    let json = serde_json::to_value(&r).unwrap();
    assert_eq!(sorted_keys(&json), ["facts", "findings"]);
    assert_eq!(json["facts"]["lines_found"], 0);
}

#[test]
fn an_empty_paths_from_is_the_repository_root() {
    let doc = r#"{"runs":[{"results":[{"ruleId":"R","locations":[
        {"physicalLocation":{"artifactLocation":{"uri":"src/a.rs"}}}]}]}]}"#;
    let lines = "src/a.rs:3: error: m";
    let junit = r#"<testsuite><testcase classname="c" name="n" file="src/a.rs"><failure message="m"/></testcase></testsuite>"#;
    for base in [None, Some(""), Some(".")] {
        let options = Options {
            paths_from: base.map(str::to_owned),
            ..Options::default()
        };
        for (format, input) in [
            (Format::Sarif, doc),
            (Format::Lines, lines),
            (Format::Junit, junit),
        ] {
            let r = read(format, input, &options).unwrap();
            assert_eq!(
                r.findings[0].path.as_deref(),
                Some("src/a.rs"),
                "{format:?} {base:?}"
            );
        }
    }
}
