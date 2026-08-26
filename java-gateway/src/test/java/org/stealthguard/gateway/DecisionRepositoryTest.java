package org.stealthguard.gateway;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.stealthguard.gateway.model.Decision;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.repository.DecisionRepository;
import org.stealthguard.gateway.repository.SessionRepository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DecisionRepositoryTest extends AbstractPostgresTest {

    @Autowired
    DecisionRepository decisionRepository;

    @Autowired
    SessionRepository sessionRepository;

    @Test
    void insertAndReadBack() {
        Session session = sessionRepository.save(newSession());
        Decision decision = new Decision();
        decision.setSession(session);
        decision.setDecision("challenge");
        decision.setReason("ml-service unreachable");
        decision.setCreatedAt(Instant.now());

        Decision saved = decisionRepository.save(decision);

        Decision found = decisionRepository.findById(saved.getId()).orElseThrow();
        assertEquals("challenge", found.getDecision());
        assertEquals("ml-service unreachable", found.getReason());
    }

    @Test
    void invalidDecisionValueViolatesCheckConstraint() {
        Session session = sessionRepository.save(newSession());
        Decision decision = new Decision();
        decision.setSession(session);
        decision.setDecision("banana");
        decision.setCreatedAt(Instant.now());

        assertThrows(DataIntegrityViolationException.class,
            () -> decisionRepository.saveAndFlush(decision));
    }

    private Session newSession() {
        Session session = new Session();
        session.setId(UUID.randomUUID());
        session.setPage("/login");
        session.setCreatedAt(Instant.now());
        return session;
    }
}