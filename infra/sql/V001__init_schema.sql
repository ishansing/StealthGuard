-- StealthGuard schema v1 (Flyway V001)
-- All seven tables from SPEC §7, with FKs, CHECKs, and indices.

CREATE TABLE sessions (
    id               UUID PRIMARY KEY,
    page             TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_agent       TEXT,
    viewport_width   INTEGER,
    viewport_height  INTEGER,
    timezone_offset  INTEGER,
    input_modality   TEXT
);

CREATE TABLE telemetry_events (
    id         BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('keystroke', 'mouse_move', 'touch_move', 'click')),
    payload    JSONB NOT NULL,
    timestamp  TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_telemetry_events_session_time ON telemetry_events (session_id, timestamp);

CREATE TABLE model_registry (
    version      TEXT PRIMARY KEY,
    trained_at   TIMESTAMPTZ NOT NULL,
    metrics_json JSONB,
    is_active    BOOLEAN NOT NULL DEFAULT false,
    feature_list JSONB
);

CREATE TABLE scores (
    id              BIGSERIAL PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    humanness_score DOUBLE PRECISION NOT NULL,
    label           TEXT,
    model_version   TEXT REFERENCES model_registry(version),
    reason_codes    JSONB,
    is_shadow       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_scores_session ON scores (session_id);
CREATE INDEX idx_scores_created_at ON scores (created_at);

CREATE TABLE decisions (
    id         BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    decision   TEXT NOT NULL CHECK (decision IN ('allow', 'block', 'challenge')),
    reason     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_decisions_session ON decisions (session_id);
CREATE INDEX idx_decisions_created_at ON decisions (created_at);

CREATE TABLE feedback (
    id              BIGSERIAL PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    reviewer        TEXT,
    corrected_label TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_feedback_session ON feedback (session_id);

CREATE TABLE challenge_responses (
    id             BIGSERIAL PRIMARY KEY,
    session_id     UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    challenge_type TEXT,
    response       TEXT,
    correct        BOOLEAN,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_challenge_responses_session ON challenge_responses (session_id);