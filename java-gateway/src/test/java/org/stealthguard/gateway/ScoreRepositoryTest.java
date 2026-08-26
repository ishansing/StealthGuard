package org.stealthguard.gateway;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.stealthguard.gateway.model.ModelRegistry;
import org.stealthguard.gateway.model.Score;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.repository.ModelRegistryRepository;
import org.stealthguard.gateway.repository.ScoreRepository;
import org.stealthguard.gateway.repository.SessionRepository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ScoreRepositoryTest extends AbstractPostgresTest {

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    SessionRepository sessionRepository;

    @Autowired
    ModelRegistryRepository modelRegistryRepository;

    @Test
    void insertAndReadBackWithJson() {
        Session session = sessionRepository.save(newSession());
        ModelRegistry model = new ModelRegistry();
        model.setVersion("v1");
        model.setTrainedAt(Instant.now());
        model.setActive(true);
        model.setMetricsJson(Map.of("auc", 0.91, "precision", 0.9, "recall", 0.88));
        model.setFeatureList(Map.of("features", List.of("keystroke_mean_hold_ms", "mouse_path_efficiency")));
        modelRegistryRepository.save(model);

        Score score = new Score();
        score.setSession(session);
        score.setHumannessScore(0.87);
        score.setLabel("human");
        score.setModelVersion(model);
        score.setReasonCodes(List.of(
            Map.of("code", "natural_keystroke_variance", "weight", 0.31),
            Map.of("code", "nonlinear_mouse_path", "weight", 0.22)));
        score.setShadow(false);
        score.setCreatedAt(Instant.now());

        Score saved = scoreRepository.save(score);
        scoreRepository.flush();

        Score found = scoreRepository.findById(saved.getId()).orElseThrow();
        assertEquals(0.87, found.getHumannessScore());
        assertEquals("human", found.getLabel());
        assertEquals("v1", found.getModelVersion().getVersion());
        assertEquals(2, found.getReasonCodes().size());
        assertEquals("natural_keystroke_variance", found.getReasonCodes().get(0).get("code"));
    }

    @Test
    void scoreWithMissingModelVersionFailsForeignKeyConstraint() {
        Session session = sessionRepository.save(newSession());
        Score score = new Score();
        score.setSession(session);
        score.setHumannessScore(0.5);
        score.setCreatedAt(Instant.now());
        score.setModelVersion(modelRegistryRepository.getReferenceById("ghost-v1"));

        assertThrows(DataIntegrityViolationException.class, () -> scoreRepository.saveAndFlush(score));
    }

    private Session newSession() {
        Session session = new Session();
        session.setId(UUID.randomUUID());
        session.setPage("/login");
        session.setCreatedAt(Instant.now());
        session.setInputModality("mouse");
        return session;
    }
}