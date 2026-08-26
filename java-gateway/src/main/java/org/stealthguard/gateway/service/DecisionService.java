package org.stealthguard.gateway.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.stealthguard.gateway.dto.DecisionResponse;
import org.stealthguard.gateway.model.Decision;
import org.stealthguard.gateway.model.Score;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.repository.DecisionRepository;
import org.stealthguard.gateway.repository.ScoreRepository;

/**
 * Applies the §8.1 decision policy from externalized thresholds and persists
 * scores + decisions. On ML failure it fails safe to `challenge` (ADR 0005).
 */
@Service
public class DecisionService {

    private final ScoreRepository scoreRepository;
    private final DecisionRepository decisionRepository;
    private final double humanAllowThreshold;
    private final double botBlockThreshold;

    public DecisionService(
        ScoreRepository scoreRepository,
        DecisionRepository decisionRepository,
        @Value("${stealthguard.human-allow-threshold}") double humanAllowThreshold,
        @Value("${stealthguard.bot-block-threshold}") double botBlockThreshold) {
        this.scoreRepository = scoreRepository;
        this.decisionRepository = decisionRepository;
        this.humanAllowThreshold = humanAllowThreshold;
        this.botBlockThreshold = botBlockThreshold;
    }

    public String decide(double score) {
        if (score >= humanAllowThreshold) {
            return "allow";
        }
        if (score <= botBlockThreshold) {
            return "block";
        }
        return "challenge";
    }

    public DecisionResponse record(Session session, MlServiceClient.ScoreDto mlScore) {
        Score score = new Score();
        score.setSession(session);
        score.setHumannessScore(mlScore.humannessScore());
        score.setLabel(mlScore.label());
        score.setReasonCodes(toReasonCodeMaps(mlScore.reasonCodes()));
        score.setShadow(false);
        score.setCreatedAt(Instant.now());
        scoreRepository.save(score);

        String decision = decide(mlScore.humannessScore());
        Decision decisionRow = new Decision();
        decisionRow.setSession(session);
        decisionRow.setDecision(decision);
        decisionRow.setReason("score=" + mlScore.humannessScore() + " model=" + mlScore.modelVersion());
        decisionRow.setCreatedAt(Instant.now());
        decisionRepository.save(decisionRow);

        return toResponse(session.getId(), decision, mlScore.humannessScore(),
            mlScore.modelVersion(), mlScore.reasonCodes());
    }

    /** Fail-safe: no ML score -> challenge, never allow (ADR 0005). */
    public DecisionResponse recordFailure(Session session, String reason) {
        Decision decisionRow = new Decision();
        decisionRow.setSession(session);
        decisionRow.setDecision("challenge");
        decisionRow.setReason(reason);
        decisionRow.setCreatedAt(Instant.now());
        decisionRepository.save(decisionRow);
        return toResponse(session.getId(), "challenge", null, null, List.of());
    }

    public DecisionResponse latest(UUID sessionId) {
        return decisionRepository.findTopBySessionIdOrderByCreatedAtDesc(sessionId)
            .map(d -> toResponse(sessionId, d.getDecision(), null, null, List.of()))
            .orElse(null);
    }

    private DecisionResponse toResponse(
        UUID sessionId, String decision, Double score, String modelVersion,
        List<MlServiceClient.ScoreDto.ReasonCodeDto> reasonCodes) {
        return new DecisionResponse(
            sessionId, decision, score, modelVersion,
            reasonCodes == null ? List.of()
                : reasonCodes.stream().map(rc -> new DecisionResponse.ReasonCodeDto(rc.code(), rc.weight())).toList());
    }

    private List<java.util.Map<String, Object>> toReasonCodeMaps(List<MlServiceClient.ScoreDto.ReasonCodeDto> reasonCodes) {
        if (reasonCodes == null) {
            return List.of();
        }
        return reasonCodes.stream()
            .map(rc -> java.util.Map.<String, Object>of("code", rc.code(), "weight", rc.weight()))
            .toList();
    }
}