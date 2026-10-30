//! The report's format gate. A format change in `src/report.rs` that is not also made here must fail.

use skillwright::report::{render_export_tally, render_unit_line, render_unmatched_overwrite};
use tradecraft_core::{ExportMode, ExportUnit, StaleKind, UnitStatus};

fn plugin(status: UnitStatus) -> ExportUnit {
    ExportUnit::Plugin {
        root: "claude".to_string(),
        name: "tools".to_string(),
        skills: 2,
        status,
        version_bump_suggestion: None,
    }
}

fn manifest(status: UnitStatus) -> ExportUnit {
    ExportUnit::Manifest {
        root: "claude".to_string(),
        status,
    }
}

fn stale() -> ExportUnit {
    ExportUnit::Stale {
        root: "claude".to_string(),
        path: ".claude-plugin/packs/gone".to_string(),
        kind: StaleKind::Plugin,
    }
}

fn stale_file() -> ExportUnit {
    ExportUnit::Stale {
        root: "claude".to_string(),
        path: ".claude-plugin/README.md".to_string(),
        kind: StaleKind::File,
    }
}

fn not_carried() -> ExportUnit {
    ExportUnit::NotCarried {
        root: None,
        path: "marketplaces/house/plugins/tools/agents/triage.md".to_string(),
        kind: "agent".to_string(),
    }
}

mod render_unit_line_tests {
    use super::*;

    #[test]
    fn a_not_carried_member_names_its_path_and_its_kind() {
        // The live bug: the switch was written against three variants, so the
        // fourth returned `undefined` and the report line read `undefined`.
        let line = render_unit_line(&not_carried(), ExportMode::Build);
        assert!(line.contains("marketplaces/house/plugins/tools/agents/triage.md"));
        assert!(line.contains("agent"));
        assert!(!line.contains("undefined"));
    }

    #[test]
    fn a_member_one_root_cannot_carry_names_that_root() {
        let unit = ExportUnit::NotCarried {
            root: Some("codex".to_string()),
            path: "marketplaces/house/plugins/tools/commands/ship.md".to_string(),
            kind: "command".to_string(),
        };
        assert_eq!(
            render_unit_line(&unit, ExportMode::Build),
            "marketplaces/house/plugins/tools/commands/ship.md  not carried · command on codex"
        );
    }

    #[test]
    fn a_not_carried_member_reads_the_same_under_check_as_under_build() {
        // It is a fact about the vault's contents, not an outcome of the run,
        // so neither verb changes it — unlike a stale path, which check calls
        // drift and build removes.
        assert_eq!(
            render_unit_line(&not_carried(), ExportMode::Check),
            render_unit_line(&not_carried(), ExportMode::Build)
        );
    }

    #[test]
    fn a_not_carried_member_belongs_to_no_root() {
        // Its path is the vault's. Prefixing a root would file it under a
        // marketplace root it was precisely not written into.
        assert!(!render_unit_line(&not_carried(), ExportMode::Build).starts_with("claude/"));
    }

    #[test]
    fn the_three_original_variants_are_unchanged() {
        assert_eq!(
            render_unit_line(&plugin(UnitStatus::Written), ExportMode::Build),
            "claude/tools  written · 2 skills"
        );
        assert_eq!(
            render_unit_line(&manifest(UnitStatus::Ok), ExportMode::Check),
            "claude  ok · marketplace manifest"
        );
        assert_eq!(
            render_unit_line(&stale(), ExportMode::Check),
            ".claude-plugin/packs/gone  drift · stale plugin"
        );
        assert_eq!(
            render_unit_line(&stale(), ExportMode::Build),
            ".claude-plugin/packs/gone  removed · stale plugin"
        );
    }

    #[test]
    fn a_whole_pack_going_does_not_read_like_a_leftover_file() {
        // Both lines end in the same verb, and one of them is the
        // marketplace losing a pack. The kind is the only thing that says so.
        assert_eq!(
            render_unit_line(&stale_file(), ExportMode::Build),
            ".claude-plugin/README.md  removed · stale file"
        );
        assert_ne!(
            render_unit_line(&stale(), ExportMode::Build),
            render_unit_line(&stale_file(), ExportMode::Build)
                .replace(".claude-plugin/README.md", ".claude-plugin/packs/gone")
        );
    }
}

mod render_export_tally_tests {
    use super::*;

    #[test]
    fn every_unit_is_counted_exactly_once() {
        // The tally's own contract: its numbers sum to the units it was
        // given, and no unit is filed under a key its variant does not
        // carry. Keying on `unit.status` counted a not-carried member under
        // `undefined` and then filtered it back out.
        let units = vec![
            plugin(UnitStatus::Written),
            plugin(UnitStatus::Unchanged),
            manifest(UnitStatus::Written),
            stale(),
            not_carried(),
        ];
        let line = render_export_tally(&units);
        let total: u32 = line
            .split(|c: char| !c.is_ascii_digit())
            .filter(|s| !s.is_empty())
            .map(|s| s.parse::<u32>().unwrap())
            .sum();
        assert_eq!(total as usize, units.len());
        assert!(!line.contains("undefined"));
    }

    #[test]
    fn not_carried_is_counted_beside_stale_not_among_the_statuses() {
        assert_eq!(
            render_export_tally(&[plugin(UnitStatus::Written), not_carried(), not_carried()]),
            "1 written, 2 not carried"
        );
    }

    #[test]
    fn a_report_holding_only_not_carried_members_still_reports_them() {
        assert_eq!(render_export_tally(&[not_carried()]), "1 not carried");
    }

    #[test]
    fn an_empty_report_says_so() {
        assert_eq!(render_export_tally(&[]), "nothing to report");
    }
}

mod render_unmatched_overwrite_tests {
    use super::*;

    #[test]
    fn the_path_is_named_and_so_is_the_spelling_that_would_have_matched() {
        let line = render_unmatched_overwrite(".claude/skills/review/SKILL.md");
        assert!(line.contains(".claude/skills/review/SKILL.md"));
        assert!(line.contains("destination-relative"));
    }

    #[test]
    fn an_absolute_path_is_told_that_it_is_absolute() {
        assert!(
            render_unmatched_overwrite("/dest/.claude/skills/review/SKILL.md").contains("absolute")
        );
    }

    #[test]
    fn a_relative_path_is_not_told_that_it_is_absolute() {
        assert!(!render_unmatched_overwrite(".claude/skills/review/SKILL.md").contains("absolute"));
    }
}

mod normalize_thrown_reason_tests {
    use skillwright::report::normalize_thrown_reason;

    #[test]
    fn a_refusals_status_word_is_stripped_and_the_token_leads() {
        // `CoreError::Refused`'s Display is `refused: <token>: <prose>`, and
        // the `refused:` is the line's own status column.
        assert_eq!(
            normalize_thrown_reason("refused: no-renderer: cursor has no skill layout"),
            "no-renderer: cursor has no skill layout"
        );
    }

    #[test]
    fn any_other_message_is_left_whole() {
        assert_eq!(
            normalize_thrown_reason("reading /tmp/x: permission denied"),
            "reading /tmp/x: permission denied"
        );
    }
}

mod roster_row_tests {
    use skillwright::report::roster_row;
    use std::path::PathBuf;
    use tradecraft_core::frontmatter::ContainerIdentity;
    use tradecraft_core::{DiscoveredComponent, EntityKind, KindSource};

    fn component() -> DiscoveredComponent {
        DiscoveredComponent {
            name: "code-review".to_string(),
            description: "reviews code".to_string(),
            description_filled: false,
            kind: EntityKind::Skill,
            kind_source: KindSource::Frontmatter,
            folder_kind: Some(EntityKind::Command),
            targets: Some(vec!["claude-code".to_string()]),
            plugin: Some("tools".to_string()),
            folder_plugin: None,
            marketplace: None,
            entry_path: PathBuf::from("/vault/commands/code-review/code-review.md"),
            bundle_root: None,
            resources: Vec::new(),
            vault_relative_path: "commands/code-review/code-review.md".to_string(),
            hook: None,
            identity: ContainerIdentity::default(),
        }
    }

    #[test]
    fn the_json_row_carries_the_seven_fields_the_table_shows() {
        let json = serde_json::to_value(roster_row(&component())).unwrap();
        assert_eq!(json["path"], "commands/code-review/code-review.md");
        assert_eq!(json["kind"], "skill");
        assert_eq!(json["folder_kind"], "command");
        assert_eq!(json["name"], "code-review");
        assert_eq!(json["description"], "reviews code");
        assert_eq!(json["plugin"], "tools");
        assert_eq!(json["targets"], serde_json::json!(["claude-code"]));
        assert_eq!(json.as_object().unwrap().len(), 7);
    }

    #[test]
    fn an_absent_targets_key_stays_null_rather_than_becoming_an_empty_list() {
        // Absent is "every destination"; empty is "nowhere". Collapsing them
        // would make the row say the opposite of what the note does.
        let mut component = component();
        component.targets = None;
        let json = serde_json::to_value(roster_row(&component)).unwrap();
        assert!(json["targets"].is_null());
    }
}

mod drift_tests {
    use skillwright::report::{AttributedState, Attribution, RowState, has_drift};
    use tradecraft_core::status::PublishState;

    fn row(state: Option<RowState>) -> AttributedState {
        AttributedState {
            attribution: Attribution {
                skill: "skills/code-review/code-review.md".to_string(),
                destination: "/dest".to_string(),
                target: "claude".to_string(),
            },
            state,
            reason: None,
            published_at: None,
            files: Vec::new(),
        }
    }

    #[test]
    fn the_three_states_check_fails_on() {
        for state in [
            PublishState::Stale,
            PublishState::Conflict,
            PublishState::Unknown,
        ] {
            assert!(has_drift(&[row(Some(RowState::State(state)))]), "{state:?}");
        }
    }

    #[test]
    fn never_published_current_not_applicable_and_an_excluded_destination_are_not_drift() {
        assert!(!has_drift(&[
            row(Some(RowState::State(PublishState::NeverPublished))),
            row(Some(RowState::State(PublishState::Current))),
            row(Some(RowState::NotApplicable)),
            row(None),
        ]));
    }
}
