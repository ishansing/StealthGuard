package org.stealthguard.gateway.service;

import java.time.Instant;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.stealthguard.gateway.dto.ChallengeResponseRequest;
import org.stealthguard.gateway.dto.DecisionResponse;
import org.stealthguard.gateway.model.ChallengeResponse;
import org.stealthguard.gateway.model.Decision;
import org.stealthguard.gateway.model.Feedback;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.repository.ChallengeResponseRepository;
import org.stealthguard.gateway.repository.DecisionRepository;
import org.stealthguard.gateway.repository.FeedbackRepository;

import java.util.UUID;

/**
 * Fallback-challenge path (SPEC §8.1): records the answer, verifies it
 * server-side, upgrades the decision on success, and writes reviewer feedback.
 */
@Service
public class ChallengeService {

    private final SessionService sessionService;
    private final ChallengeResponseRepository challengeResponseRepository;
    private final DecisionRepository decisionRepository;
    private final FeedbackRepository feedbackRepository;
    private final String expectedAnswer;

    public ChallengeService(
        SessionService sessionService,
        ChallengeResponseRepository challengeResponseRepository,
        DecisionRepository decisionRepository,
        FeedbackRepository feedbackRepository,
        @Value("${stealthguard.challenge-answer}") String expectedAnswer) {
        this.sessionService = sessionService;
        this.challengeResponseRepository = challengeResponseRepository;
        this.decisionRepository = decisionRepository;
        this.feedbackRepository = feedbackRepository;
        this.expectedAnswer = expectedAnswer;
    }

    @Transactional
    public DecisionResponse respond(UUID sessionId, ChallengeResponseRequest request) {
        Session session = sessionService.require(sessionId);

        boolean correct = "math".equals(request.challengeType())
            && expectedAnswer.trim().equalsIgnoreCase(
                request.response() == null ? "" : request.response().trim());

        ChallengeResponse response = new ChallengeResponse();
        response.setSession(session);
        response.setChallengeType(request.challengeType());
        response.setResponse(request.response());
        response.setCorrect(correct);
        response.setCreatedAt(Instant.now());
        challengeResponseRepository.save(response);

        Feedback feedback = new Feedback();
        feedback.setSession(session);
        feedback.setReviewer("challenge");
        feedback.setCorrectedLabel(correct ? "human" : null);
        feedback.setCreatedAt(Instant.now());
        feedbackRepository.save(feedback);

        if (correct) {
            Decision decision = new Decision();
            decision.setSession(session);
            decision.setDecision("allow");
            decision.setReason("challenge passed");
            decision.setCreatedAt(Instant.now());
            decisionRepository.save(decision);
            return new DecisionResponse(sessionId, "allow", null, null, java.util.List.of());
        }
        return new DecisionResponse(sessionId, "challenge", null, null, java.util.List.of());
    }
}