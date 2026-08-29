package org.stealthguard.gateway.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
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
 * scores + decisions. Thresholds are per input modality (Phase 9 A5): a
 * keyboard-only or switch user gets a lenient profile so accessibility flows
 * are never silently blocked. On ML failure it fails safe to `challenge`.
 */
@Service
public class DecisionService {

    /** Per-modality threshold profile. */
    public record Thresholds(double human, double bot) {
    }

    private final ScoreRepository scoreRepository;
    private final DecisionRepository decisionRepository;
    private final Thresholds defaultThresholds;
    private final Map<String, Thresholds> modalityThresholds;

    public DecisionService(
        ScoreRepository scoreRepository,
        DecisionRepository decisionRepository,
        @Value("${stealthguard.human-allow-threshold}") double humanAllowThreshold,
        @Value("${stealthguard.bot-block-threshold}") double botBlockThreshold,
        @Value("${stealthguard.human-allow-threshold-keyboard:0.6}") double keyboardHuman,
        @Value("${stealthguard.bot-block-threshold-keyboard:0.2}") double keyboardBot,
        @Value("${stealthguard.human-allow-threshold-touch:0.7}") double touchHuman,
        @Value("${stealthguard.bot-block-threshold-touch:0.3}") double touchBot,
        @Value("${stealthguard.human-allow-threshold-switch:0.6}") double switchHuman,
        @Value("${stealthguard.bot-block-threshold-switch:0.2}") double switchBot) {
        this.scoreRepository = scoreRepository;
        this.decisionRepository = decisionRepository;
        this.defaultThresholds = new Thresholds(humanAllowThreshold, botBlockThreshold);
        this.modalityThresholds = Map.of(
            "keyboard", new Thresholds(keyboardHuman, keyboardBot),
            "touch", new Thresholds(touchHuman, touchBot),
            "switch", new Thresholds(switchHuman, switchBot));
    }

    public Thresholds thresholdsFor(String modality) {
        if (modality == null) {
            return defaultThresholds;
        }
        return modalityThresholds.getOrDefault(modality.toLowerCase(), defaultThresholds);
    }

    public String decide(double score, String modality) {
        Thresholds t = thresholdsFor(modality);
        if (score >= t.human()) {
            return "allow";
        }
        if (score <= t.bot()) {
            return "block";
        }
        return "challenge";
    }

    public DecisionResponse record(Session session, MlServiceClient.ScoreDto mlScore, String modality,
        boolean trialMode, long latencyMs) {
        Score score = new Score();
        score.setSession(session);
        score.setHumannessScore(mlScore.humannessScore());
        score.setLabel(mlScore.label());
        score.setReasonCodes(toReasonCodeMaps(mlScore.reasonCodes()));
        score.setShadow(false);
        score.setCreatedAt(Instant.now());
        scoreRepository.save(score);

        String decision = decide(mlScore.humannessScore(), modality);
        Decision decisionRow = new Decision();
        decisionRow.setSession(session);
        decisionRow.setDecision(decision);
        decisionRow.setReason("score=" + mlScore.humannessScore() + " model=" + mlScore.modelVersion()
            + " modality=" + (modality == null ? "?" : modality));
        decisionRow.setTrialMode(trialMode);
        decisionRow.setLatencyMs((int) latencyMs);
        decisionRow.setCreatedAt(Instant.now());
        decisionRepository.save(decisionRow);

        return toResponse(session.getId(), decision, mlScore.humannessScore(),
            mlScore.modelVersion(), mlScore.reasonCodes());
    }

    /** Persist a shadow-model score (Phase 9 A3) — logged only, never a decision. */
    public void recordShadow(Session session, double score, String modelVersion) {
        Score row = new Score();
        row.setSession(session);
        row.setHumannessScore(score);
        row.setLabel(score >= defaultThresholds.human() ? "human" : score <= defaultThresholds.bot() ? "bot" : "uncertain");
        row.setShadow(true);
        row.setCreatedAt(Instant.now());
        scoreRepository.save(row);
    }

    /** Fail-safe: no ML score -> challenge, never allow (ADR 0005). */
    public DecisionResponse recordFailure(Session session, String reason, boolean trialMode, long latencyMs) {
        Decision decisionRow = new Decision();
        decisionRow.setSession(session);
        decisionRow.setDecision("challenge");
        decisionRow.setReason(reason);
        decisionRow.setTrialMode(trialMode);
        decisionRow.setLatencyMs((int) latencyMs);
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