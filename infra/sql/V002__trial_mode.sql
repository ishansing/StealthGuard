-- StealthGuard schema v2 (Flyway V002): shadow-trial mode (Phase 9 B1).
-- In trial mode the gateway persists the real decision but returns `allow`
-- to the caller; trial_mode marks such rows so the confidence report can
-- filter them. latency_ms records the end-to-end ingest time per decision.
ALTER TABLE decisions
    ADD COLUMN trial_mode BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN latency_ms INTEGER;