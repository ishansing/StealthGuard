package org.stealthguard.gateway;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mockito;
import org.stealthguard.gateway.model.Decision;
import org.stealthguard.gateway.model.Score;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.repository.DecisionRepository;
import org.stealthguard.gateway.repository.ScoreRepository;
import org.stealthguard.gateway.service.DecisionService;
import org.stealthguard.gateway.service.MlServiceClient;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;

class DecisionServiceTest {

    private DecisionService service(double human, double bot) {
        return new DecisionService(
            Mockito.mock(ScoreRepository.class), Mockito.mock(DecisionRepository.class),
            human, bot, 0.6, 0.2, 0.7, 0.3, 0.5, 0.0);
    }

    @ParameterizedTest
    @CsvSource({
        "1.0, allow",
        "0.8, allow",
        "0.79, challenge",
        "0.5, challenge",
        "0.41, challenge",
        "0.4, block",
        "0.0, block",
    })
    void thresholdBoundaries(double score, String expected) {
        assertEquals(expected, service(0.8, 0.4).decide(score, null));
    }

    @Test
    void keyboardModalityUsesLenientProfile() {
        DecisionService service = service(0.8, 0.4);
        // 0.3 blocks mouse users (<= 0.4) but stays challenge for keyboard (> 0.2).
        assertEquals("block", service.decide(0.3, "mouse"));
        assertEquals("challenge", service.decide(0.3, "keyboard"));
        // 0.7 challenges mouse users (< 0.8) but allows keyboard users (>= 0.6).
        assertEquals("challenge", service.decide(0.7, "mouse"));
        assertEquals("allow", service.decide(0.7, "keyboard"));
        // Deep bot scores still block regardless of modality.
        assertEquals("block", service.decide(0.15, "keyboard"));
    }

    @Test
    void recordPersistsScoreAndDecision() {
        ScoreRepository scores = Mockito.mock(ScoreRepository.class);
        DecisionRepository decisions = Mockito.mock(DecisionRepository.class);
        DecisionService service = new DecisionService(
            scores, decisions, 0.8, 0.4, 0.6, 0.2, 0.7, 0.3, 0.5, 0.0);
        Session session = newSession();

        var response = service.record(
            session, new MlServiceClient.ScoreDto(0.87, "human", "v1", List.of()), "mouse");

        assertEquals("allow", response.decision());
        assertEquals(0.87, response.humannessScore());
        verify(scores).save(any(Score.class));
        verify(decisions).save(any(Decision.class));
    }

    @Test
    void recordFailureFailsSafeToChallenge() {
        ScoreRepository scores = Mockito.mock(ScoreRepository.class);
        DecisionRepository decisions = Mockito.mock(DecisionRepository.class);
        DecisionService service = new DecisionService(
            scores, decisions, 0.8, 0.4, 0.6, 0.2, 0.7, 0.3, 0.5, 0.0);
        Session session = newSession();

        var response = service.recordFailure(session, "ml-service unreachable");

        assertEquals("challenge", response.decision());
        assertEquals(null, response.humannessScore());
        verify(decisions).save(any(Decision.class));
    }

    private Session newSession() {
        Session session = new Session();
        session.setId(UUID.randomUUID());
        session.setPage("/login");
        session.setCreatedAt(Instant.now());
        return session;
    }
}