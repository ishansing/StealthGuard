from app.scorer import LABEL_DICT, RuleBasedScorer, label_for_score, top_reason_codes

HUMAN_FEATURES = {
    "keystroke_mean_hold_ms": 95.0,
    "keystroke_std_hold_ms": 25.0,
    "keystroke_mean_interkey_ms": 150.0,
    "keystroke_std_interkey_ms": 60.0,
    "typing_speed_chars_per_s": 3.5,
    "mouse_mean_speed_px_per_s": 300.0,
    "mouse_std_speed_px_per_s": 130.0,
    "mouse_path_efficiency": 0.55,
    "mouse_idle_ratio": 0.5,
    "mouse_direction_changes": 20.0,
    "session_duration_ms": 9000.0,
    "event_count": 300.0,
}

BOT_FEATURES = {
    "keystroke_mean_hold_ms": 80.0,
    "keystroke_std_hold_ms": 0.1,
    "keystroke_mean_interkey_ms": 100.0,
    "keystroke_std_interkey_ms": 0.1,
    "typing_speed_chars_per_s": 8.0,
    "mouse_mean_speed_px_per_s": 600.0,
    "mouse_std_speed_px_per_s": 1.0,
    "mouse_path_efficiency": 0.99,
    "mouse_idle_ratio": 0.0,
    "mouse_direction_changes": 0.0,
    "session_duration_ms": 800.0,
    "event_count": 40.0,
}


def test_label_threshold_boundaries() -> None:
    cases = [
        (1.0, "human"),
        (0.8, "human"),
        (0.7999, "uncertain"),
        (0.5, "uncertain"),
        (0.4001, "uncertain"),
        (0.4, "bot"),
        (0.0, "bot"),
    ]
    for score, expected in cases:
        assert label_for_score(score, human_threshold=0.8, bot_threshold=0.4) == expected, score


def test_rule_based_score_is_bounded() -> None:
    scorer = RuleBasedScorer(0.8, 0.4)
    for features in ({}, HUMAN_FEATURES, BOT_FEATURES):
        result = scorer.score(features)
        assert 0.0 <= result.humanness_score <= 1.0
        assert result.label in ("human", "bot", "uncertain")


def test_rule_based_separates_bot_from_human() -> None:
    scorer = RuleBasedScorer(0.8, 0.4)
    bot = scorer.score(BOT_FEATURES)
    human = scorer.score(HUMAN_FEATURES)
    assert bot.humanness_score < human.humanness_score
    assert bot.label == "bot"
    assert human.label == "human"


def test_reason_codes_shape_and_mapping() -> None:
    codes = top_reason_codes(
        {"keystroke_std_hold_ms": 0.5, "mouse_path_efficiency": -0.3, "event_count": 0.1}
    )
    assert len(codes) == 3
    assert codes[0].code == LABEL_DICT["keystroke_std_hold_ms"]["human"]
    assert codes[1].code == LABEL_DICT["mouse_path_efficiency"]["bot"]
    assert all(c.weight >= 0.0 for c in codes)
