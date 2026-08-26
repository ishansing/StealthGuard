package org.stealthguard.gateway;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.stealthguard.gateway.model.Feedback;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.repository.FeedbackRepository;
import org.stealthguard.gateway.repository.SessionRepository;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FeedbackRepositoryTest extends AbstractPostgresTest {

    @Autowired
    FeedbackRepository feedbackRepository;

    @Autowired
    SessionRepository sessionRepository;

    @Test
    void insertAndReadBack() {
        Session session = sessionRepository.save(newSession());
        Feedback feedback = new Feedback();
        feedback.setSession(session);
        feedback.setReviewer("analyst@example.org");
        feedback.setCorrectedLabel("human");
        feedback.setCreatedAt(Instant.now());

        Feedback saved = feedbackRepository.save(feedback);

        Feedback found = feedbackRepository.findById(saved.getId()).orElseThrow();
        assertEquals("human", found.getCorrectedLabel());
        assertEquals("analyst@example.org", found.getReviewer());
    }

    private Session newSession() {
        Session session = new Session();
        session.setId(UUID.randomUUID());
        session.setPage("/login");
        session.setCreatedAt(Instant.now());
        return session;
    }
}