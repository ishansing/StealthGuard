package org.stealthguard.gateway;

import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Migration test: Flyway runs against a fresh container on context startup;
 * assert the resulting public schema contains exactly the tables from SPEC §7.
 */
class DatabaseSchemaTest extends AbstractPostgresTest {

    @Autowired
    JdbcTemplate jdbcTemplate;

    @Test
    void migrationCreatesAllSpecTables() {
        Set<String> expected = Set.of(
            "sessions",
            "telemetry_events",
            "scores",
            "decisions",
            "model_registry",
            "feedback",
            "challenge_responses");

        List<String> tables = jdbcTemplate.queryForList(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
            String.class);

        for (String table : expected) {
            assertTrue(tables.contains(table), "missing table: " + table);
        }
    }
}