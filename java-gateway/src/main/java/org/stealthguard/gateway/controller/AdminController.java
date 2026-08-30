package org.stealthguard.gateway.controller;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.stealthguard.gateway.dto.AdminFeedbackRequest;
import org.stealthguard.gateway.dto.DecisionResponse;
import org.stealthguard.gateway.dto.SessionDetailDto;
import org.stealthguard.gateway.dto.SessionSummaryDto;
import org.stealthguard.gateway.dto.TelemetryEventDto;
import org.stealthguard.gateway.model.Decision;
import org.stealthguard.gateway.model.Feedback;
import org.stealthguard.gateway.model.Score;
import org.stealthguard.gateway.model.Session;
import org.stealthguard.gateway.model.TelemetryEvent;
import org.stealthguard.gateway.repository.DecisionRepository;
import org.stealthguard.gateway.repository.FeedbackRepository;
import org.stealthguard.gateway.repository.ScoreRepository;
import org.stealthguard.gateway.repository.SessionRepository;
import org.stealthguard.gateway.repository.TelemetryEventRepository;
import org.stealthguard.gateway.service.SessionNotFoundException;

/** Read-only dashboard endpoints + reviewer feedback (SPEC §8.1). */
@RestController
@RequestMapping("/stealthguard/admin")
public class AdminController {

    private final SessionRepository sessionRepository;
    private final DecisionRepository decisionRepository;
    private final ScoreRepository scoreRepository;
    private final TelemetryEventRepository eventRepository;
    private final FeedbackRepository feedbackRepository;

    public AdminController(
        SessionRepository sessionRepository,
        DecisionRepository decisionRepository,
        ScoreRepository scoreRepository,
        TelemetryEventRepository eventRepository,
        FeedbackRepository feedbackRepository) {
        this.sessionRepository = sessionRepository;
        this.decisionRepository = decisionRepository;
        this.scoreRepository = scoreRepository;
        this.eventRepository = eventRepository;
        this.feedbackRepository = feedbackRepository;
    }

    @GetMapping("/sessions")
    @Transactional(readOnly = true)
    public Page<SessionSummaryDto> sessions(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {
        return sessionRepository
            .findAll(PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")))
            .map(this::toSummary);
    }

    @GetMapping("/sessions/{sessionId}")
    @Transactional(readOnly = true)
    public SessionDetailDto session(@PathVariable UUID sessionId) {
        Session session = sessionRepository.findById(sessionId)
            .orElseThrow(() -> new SessionNotFoundException(sessionId));
        SessionSummaryDto summary = toSummary(session);
        Decision decision = decisionRepository.findTopBySessionIdOrderByCreatedAtDesc(sessionId).orElse(null);
        Score score = scoreRepository.findTopBySessionIdOrderByCreatedAtDesc(sessionId).orElse(null);

        List<DecisionResponse.ReasonCodeDto> reasonCodes = score != null && score.getReasonCodes() != null
            ? score.getReasonCodes().stream()
                .map(m -> new DecisionResponse.ReasonCodeDto(
                    String.valueOf(m.get("code")),
                    ((Number) m.get("weight")).doubleValue()))
                .toList()
            : List.of();

        List<TelemetryEventDto> events = eventRepository.findBySessionIdOrderByTimestampAsc(sessionId).stream()
            .map(e -> new TelemetryEventDto(e.getId(), e.getEventType(), e.getPayload(), e.getTimestamp()))
            .toList();

        return new SessionDetailDto(
            sessionId, summary.page(), summary.createdAt(), summary.userAgent(), summary.inputModality(),
            decision == null ? null : decision.getDecision(),
            score == null ? null : score.getHumannessScore(),
            score == null || score.getModelVersion() == null ? null : score.getModelVersion().getVersion(),
            reasonCodes,
            events);
    }

    @GetMapping("/stats")
    public Map<String, Map<String, Long>> stats() {
        Map<String, Long> decisions = new LinkedHashMap<>();
        for (Object[] row : decisionRepository.countByDecision()) {
            decisions.put((String) row[0], (Long) row[1]);
        }
        Map<String, Long> labels = new LinkedHashMap<>();
        for (Object[] row : scoreRepository.countByLabel()) {
            labels.put((String) row[0], (Long) row[1]);
        }
        Map<String, Long> histogram = new LinkedHashMap<>();
        for (Object[] row : scoreRepository.scoreHistogram()) {
            histogram.put(String.valueOf(row[0]), (Long) row[1]);
        }
        return Map.of("decisions", decisions, "labels", labels, "score_histogram", histogram);
    }

    @PostMapping("/feedback")
    @Transactional
    public Map<String, Object> feedback(@RequestBody AdminFeedbackRequest request) {
        Session session = sessionRepository.findById(request.sessionId())
            .orElseThrow(() -> new SessionNotFoundException(request.sessionId()));
        Feedback feedback = new Feedback();
        feedback.setSession(session);
        feedback.setReviewer(request.reviewer());
        feedback.setCorrectedLabel(request.correctedLabel());
        feedback.setCreatedAt(Instant.now());
        Feedback saved = feedbackRepository.save(feedback);
        return Map.of("ok", true, "id", saved.getId());
    }

    private SessionSummaryDto toSummary(Session session) {
        Decision decision = decisionRepository
            .findTopBySessionIdOrderByCreatedAtDesc(session.getId()).orElse(null);
        Score score = scoreRepository
            .findTopBySessionIdOrderByCreatedAtDesc(session.getId()).orElse(null);
        return new SessionSummaryDto(
            session.getId(), session.getPage(), session.getCreatedAt(),
            session.getUserAgent(), session.getInputModality(),
            decision == null ? null : decision.getDecision(),
            score == null ? null : score.getHumannessScore(),
            score == null || score.getModelVersion() == null ? null : score.getModelVersion().getVersion());
    }
}