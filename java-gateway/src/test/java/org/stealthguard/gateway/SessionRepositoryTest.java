package org.stealthguard.gateway;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.model.TelemetryEvent;
import org.stealthguard.gateway.repository.SessionRepository;
import org.stealthguard.gateway.repository.TelemetryEventRepository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionRepositoryTest extends AbstractPostgresTest {

    @Autowired
    SessionRepository sessionRepository;

    @Autowired
    TelemetryEventRepository telemetryEventRepository;

    @Test
    void insertAndReadBack() {
        Session session = newSession();

        sessionRepository.save(session);

        Session found = sessionRepository.findById(session.getId()).orElseThrow();
        assertEquals(session.getPage(), found.getPage());
        assertEquals(session.getInputModality(), found.getInputModality());
    }

    @Test
    void deletingSessionCascadesToChildren() {
        Session session = sessionRepository.save(newSession());
        TelemetryEvent event = new TelemetryEvent();
        event.setSession(session);
        event.setEventType("keystroke");
        event.setPayload(Map.of("key", "a", "down_time", 1.0, "up_time", 2.0));
        event.setTimestamp(Instant.now());
        telemetryEventRepository.save(event);

        sessionRepository.delete(session);

        assertTrue(telemetryEventRepository.findById(event.getId()).isEmpty());
    }

    @Test
    void childWithMissingSessionFailsForeignKeyConstraint() {
        TelemetryEvent orphan = new TelemetryEvent();
        orphan.setSession(sessionRepository.getReferenceById(UUID.randomUUID()));
        orphan.setEventType("click");
        orphan.setPayload(Map.of("x", 10, "y", 20));
        orphan.setTimestamp(Instant.now());

        assertThrows(DataIntegrityViolationException.class,
            () -> telemetryEventRepository.saveAndFlush(orphan));
    }

    private Session newSession() {
        Session session = new Session();
        session.setId(UUID.randomUUID());
        session.setPage("/login");
        session.setCreatedAt(Instant.now());
        session.setUserAgent("test-agent");
        session.setViewportWidth(1366);
        session.setViewportHeight(768);
        session.setTimezoneOffset(330);
        session.setInputModality("mouse");
        return session;
    }
}